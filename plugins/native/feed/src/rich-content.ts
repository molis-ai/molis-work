import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "hr",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "sup",
  "sub",
  "kbd",
] as const;

const NON_TEXT_TAGS = [
  "script",
  "style",
  "textarea",
  "option",
  "xmp",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "form",
];

const BLOCK_TAG_PATTERN = /<\/?(?:p|div|h[1-6]|blockquote|ul|ol|li|pre|hr|table|thead|tbody|tr|th|td|details|summary)\b[^>]*>/giu;
const LEADING_INVISIBLE_PATTERN = /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]+/u;

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
    nonTextTags: NON_TEXT_TAGS,
    parseStyleAttributes: false,
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
    nonTextTags: NON_TEXT_TAGS,
  }).trim();
  return text ? `<p>${text}</p>` : "";
}

/**
 * Render external Feed text as mixed GFM Markdown and allowlisted HTML.
 * The parser is deliberately not a trust boundary; every result is sanitized.
 */
export function renderFeedRichText(value: string | null | undefined): string {
  const source = String(value ?? "").replace(LEADING_INVISIBLE_PATTERN, "").trim();
  if (!source) return "";
  try {
    const parsed = marked.parse(source, {
      async: false,
      breaks: false,
      gfm: true,
      pedantic: false,
      silent: true,
    });
    return sanitizeRichHtml(parsed);
  } catch {
    return fallbackPlainParagraph(source);
  }
}

/** Convert Markdown / HTML into compact visible text for Feed rows and summaries. */
export function feedPlainText(
  value: string | null | undefined,
  maximumLength = 320,
): string {
  const rendered = renderFeedRichText(value);
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
