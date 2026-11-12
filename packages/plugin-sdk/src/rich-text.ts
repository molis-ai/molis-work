import { compile, parse, postprocess, preprocess } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import sanitizeHtml from "sanitize-html";

import { CONTENT_TAGS as ALLOWED_TAGS, NON_TEXT_TAGS } from "./browser.js";

const BLOCK_TAG_PATTERN = /<\/?(?:p|div|h[1-6]|blockquote|ul|ol|li|pre|hr|table|thead|tbody|tr|th|td|details|summary)\b[^>]*>/giu;
const LEADING_INVISIBLE_PATTERN = /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/u;
/** A carriage return inside a fenced block rides through the sanitizer as NUL; input cannot carry one (Micromark and the HTML parser turn NUL into U+FFFD). */
const HELD_CR = "\u0000";

type Event = Parameters<typeof postprocess>[0][number];
type Token = Event[1];
type HtmlExtension = NonNullable<NonNullable<Parameters<typeof compile>[0]>["htmlExtensions"]>[number];

/** GFM as before, without footnotes (Marked never read them). */
const SYNTAX = [gfm(), { disable: { null: ["gfmFootnoteDefinition", "gfmFootnoteCall", "gfmPotentialFootnoteCall"] } }];

function safeExternalHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeRichHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      // A fenced block keeps the language it names, so it can be coloured; nothing else rides on class.
      code: ["class"],
      details: ["open"],
      th: ["colspan", "rowspan", "align"],
      td: ["colspan", "rowspan", "align"],
    },
    allowedClasses: { code: ["language-*"] },
    allowedSchemes: ["http", "https"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    allowVulnerableTags: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: false,
    nestingLimit: 30,
    nonTextTags: [...NON_TEXT_TAGS],
    parseStyleAttributes: false,
    // Browsers turn a raw CR in HTML into LF; a fenced block's own CR is written as a reference so it survives.
    textFilter: (text, tagName) => tagName === "code" ? text.replaceAll(HELD_CR, "&#13;") : text.replaceAll(HELD_CR, ""),
    transformTags: {
      a: (tagName, attributes) => {
        const href = safeExternalHref(attributes.href);
        return {
          tagName,
          attribs: {
            ...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : {}),
            ...(attributes.title ? { title: attributes.title } : {}),
          },
        };
      },
    },
  });
}

/**
 * The code a fenced block holds, exactly as written: each line's own text and line ending, without the container prefixes and fence
 * indentation the parser took. The line ending right after the opening fence is structure, and so is one before a closing fence or
 * before the container that ends an open block; an open block that runs to the end keeps the last real line ending, even one the
 * parser left outside its token.
 */
function fencedSources(events: readonly Event[], source: string): Map<Token, string> {
  const found = new Map<Token, string>();
  let open: { token: Token; fences: number; parts: string[]; endings: boolean[]; separated: boolean; depth: number } | null = null;
  for (const [kind, token, context] of events) {
    if (token.type === "codeFenced") {
      if (kind === "enter") { open = { token, fences: 0, parts: [], endings: [], separated: false, depth: 0 }; continue; }
      if (!open) continue;
      const { parts, endings } = open;
      if (open.fences >= 2) { if (endings.at(-1)) { parts.pop(); endings.pop(); } }
      else {
        const rest = source.slice(token.end.offset);
        if (/^(?:\r\n|\r|\n)?$/u.test(rest)) { if (open.separated && rest) parts.push(rest); }
        else if (endings.at(-1) && !/^[\r\n]/u.test(rest)) parts.pop();
      }
      found.set(token, parts.join(""));
      open = null;
      continue;
    }
    if (!open) continue;
    // Only the block's own children count: a fence's info string or a container prefix inside it is not code.
    if (kind === "enter") open.depth += 1; else { open.depth -= 1; continue; }
    if (open.depth !== 1) continue;
    if (token.type === "codeFencedFence") open.fences += 1;
    else if (token.type === "lineEnding") {
      if (!open.separated) { open.separated = true; continue; }
      open.parts.push(context.sliceSerialize(token)); open.endings.push(true);
    } else if (token.type === "codeFlowValue") { open.parts.push(context.sliceSerialize(token)); open.endings.push(false); }
  }
  return found;
}

/** Fenced blocks are drawn from `fencedSources`; raw HTML is left whole for the sanitizer to judge (no GFM tag filter). */
function richHtml(sources: Map<Token, string>): HtmlExtension {
  return {
    enter: {
      codeFenced() { this.lineEndingIfNeeded(); this.tag("<pre><code"); this.setData("fencesCount", 0); this.buffer(); },
    },
    exit: {
      codeFenced(token) {
        const drawn = this.resume(), language = drawn.slice(0, drawn.indexOf(">") + 1);
        this.tag(language);
        // A lone CR is drawn as a space by browsers; a <br> after it shows the line it ends and adds nothing to the text.
        this.raw(this.encode(sources.get(token) ?? "").replace(/\r(?!\n)/gu, HELD_CR + "<br>").replace(/\r/gu, HELD_CR));
        this.tag("</code></pre>");
        this.setData("flowCodeSeenData"); this.setData("fencesCount"); this.setData("slurpOneLineEnding");
      },
      htmlFlowData(token) { this.raw(this.encode(this.sliceSerialize(token))); },
      htmlTextData(token) { this.raw(this.encode(this.sliceSerialize(token))); },
    },
  };
}

function decodeTextEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/giu, (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal ?? "", hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
      return String.fromCodePoint(codePoint);
    })
    .replace(/&(amp|apos|gt|lt|nbsp|quot);/giu, (entity, name: string) => named[name.toLowerCase()] ?? entity);
}

function fallbackPlainParagraph(value: string): string {
  const text = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    enforceHtmlBoundary: false,
    nonTextTags: [...NON_TEXT_TAGS],
  }).trim();
  return text ? `<p>${text}</p>` : "";
}

/**
 * Render untrusted text (a feed item, a model's answer, a pasted note) as mixed GFM Markdown and allowlisted HTML.
 * The parser is deliberately not a trust boundary; every result is sanitized. Links keep only http(s) and open in a new tab.
 * A fenced block's code is kept exactly (tabs, trailing spaces, LF, CRLF and CR), so what is shown and copied is what was written.
 */
export function renderRichText(value: string | null | undefined): string {
  const source = String(value ?? "").replace(LEADING_INVISIBLE_PATTERN, "");
  if (!source.trim()) return "";
  try {
    const events = postprocess(parse({ extensions: SYNTAX }).document().write(preprocess()(source, undefined, true)));
    const html = compile({ allowDangerousHtml: true, htmlExtensions: [gfmHtml(), richHtml(fencedSources(events, source))] })(events);
    return sanitizeRichHtml(html);
  } catch {
    return fallbackPlainParagraph(source);
  }
}

/** Convert Markdown / HTML into compact visible text for list rows and summaries, cut to `maximumLength` characters. */
export function richPlainText(
  value: string | null | undefined,
  maximumLength = 320,
): string {
  const rendered = renderRichText(value);
  if (!rendered) return "";
  const withoutTags = sanitizeHtml(rendered.replace(BLOCK_TAG_PATTERN, " "), {
    allowedTags: [],
    allowedAttributes: {},
    enforceHtmlBoundary: false,
  });
  const normalized = decodeTextEntities(withoutTags).replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  return characters.length > maximumLength
    ? `${characters.slice(0, Math.max(0, maximumLength - 1)).join("")}…`
    : normalized;
}
