import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";

export interface AssistantTextPorts {
  say(text: string): string;
  objects: AssistantWorkView["objects"];
  language(hint: string): string;
  tokens(text: string, language: string): Array<[string | null, string]>;
}

/** Model words, code, titles and attributes are text even though the Host draws their surrounding structure. */
export const assistantEscape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const LANGUAGE_NAME: Record<string, string> = { ts: "TypeScript", js: "JavaScript", json: "JSON", py: "Python", sh: "Shell", yaml: "YAML", html: "HTML", css: "CSS", go: "Go", rust: "Rust",
  java: "Java", c: "C", sql: "SQL", diff: "Diff", markdown: "Markdown" };

/**
 * The pieces of a large code block as kinds and lengths: the kinds it uses, then one mark a piece, its kind's place in that
 * list ("-" for plain text) followed by its length in base 36, e.g. `keyword string|03.-1.12`. The page builds the
 * coloured nodes from the block's text by this map, so the tokenizer stays on the Host.
 */
export function assistantPaintMap(pieces: ReadonlyArray<[string | null, string]>): string {
  const kinds: string[] = [];
  const marks = pieces.map(([kind, value]) => {
    if (!kind) return "-" + value.length.toString(36);
    if (!kinds.includes(kind)) kinds.push(kind);
    return kinds.indexOf(kind).toString(36) + value.length.toString(36);
  });
  return kinds.join(" ") + "|" + marks.join(".");
}

export function assistantCodeHtml(code: string, hint: string, ports: AssistantTextPorts): string {
  // The lines exactly as written, first and last included (VUX-33). Copy takes them from `data-code`, never from the coloured
  // DOM; a blank last line, which a line break at the end of <pre> would not show, is held open by a <br>.
  const text = String(code || "");
  const guessed = /^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text) ? "json" : /^\s*\$ /.test(text) ? "sh" : /^(@@|\+\+\+|---) /m.test(text) ? "diff" : "";
  const resolved = ports.language(hint || "");
  const language = (typeof resolved === "string" ? resolved : "") || guessed, lines = text.split("\n").length;
  // A block past a slice goes out as its text and the map of its pieces; the page colours it a slice a frame (assistantPaintMap).
  const pieces = language && text.length <= 400000 ? ports.tokens(text, language) : null, paint = pieces && text.length > 16000 ? assistantPaintMap(pieces) : "";
  const body = pieces && !paint ? pieces.map(([kind, value]) => kind ? `<span class="tok-${assistantEscape(kind)}">${assistantEscape(value)}</span>` : assistantEscape(value)).join("") : assistantEscape(text);
  const say = (value: string) => assistantEscape(ports.say(value));
  // The count fills the translated words, so an English count agrees with its number ("1 line", "22 lines"), not just the first {n}.
  const count = (value: string) => assistantEscape(fillMessage(ports.say(value), { n: lines }));
  return `<figure class="assistant-code" data-lines="${lines}"${lines > 18 ? " data-folded" : ""} data-code="${assistantEscape(text)}"${paint ? ` data-paint="${assistantEscape(paint)}"` : ""}><figcaption class="assistant-code-head"><span class="assistant-code-lang">${assistantEscape(LANGUAGE_NAME[language] || hint || ports.say("代码"))}</span><span class="assistant-code-lines">${count("{n} 行")}</span><button class="assistant-code-copy" type="button">${say("复制")}</button></figcaption><pre><code>${body}${text.endsWith("\n") ? "<br>" : ""}</code></pre>${lines > 18 ? `<button class="assistant-code-more" type="button">${count("展开全部 {n} 行")}</button>` : ""}</figure>`;
}

const BT = String.fromCharCode(96);
const INLINE = [BT + "[^" + BT + "]+" + BT, "\\*\\*[^*]+\\*\\*", "__[^_]+__", "~~[^~]+~~", "\\*[^*\\s][^*]*\\*", "(?<![\\w])_[^_\\s][^_]*_(?![\\w])",
  "\\[[^\\]]+\\]\\([^)\\s]+\\)", "https?://[^\\s<>「」（）()，。；、]+", "「[^」]{1,80}」"].join("|");
const link = (label: string, href: string): string => /^(https?:\/\/|mailto:)/i.test(href)
  ? `<a class="assistant-link" href="${assistantEscape(href)}" target="_blank" rel="noopener noreferrer">${assistantEscape(label)}</a>` : assistantEscape(label);

export function assistantInlineHtml(text: string, ports: AssistantTextPorts): string {
  let html = "", last = 0;
  for (const match of text.matchAll(new RegExp(INLINE, "g"))) {
    html += assistantEscape(text.slice(last, match.index));
    const token = match[0], inside = (tag: string, edge: number) => `<${tag}>${assistantInlineHtml(token.slice(edge, -edge), ports)}</${tag}>`;
    if (token.startsWith(BT)) html += `<code>${assistantEscape(token.slice(1, -1))}</code>`;
    else if (token.startsWith("**") || token.startsWith("__")) html += inside("strong", 2);
    else if (token.startsWith("~~")) html += inside("s", 2);
    else if (token.startsWith("[")) { const at = token.indexOf("]("); html += link(token.slice(1, at), token.slice(at + 2, -1)); }
    else if (/^https?:/i.test(token)) html += link(token, token);
    else if (token.startsWith("「")) {
      const name = token.slice(1, -1), index = ports.objects.findIndex(one => one.title === name && one.open);
      html += index < 0 ? assistantEscape(token) : `<button class="assistant-inline-object" type="button" data-assistant-object="${index}" aria-label="${assistantEscape(ports.say("打开") + "：" + name)}">${assistantEscape(name)}</button>`;
    } else html += inside("em", 1);
    last = match.index + token.length;
  }
  return html + assistantEscape(text.slice(last));
}

export const ASSISTANT_LIST_ITEM = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;
interface ListItem { task: string | null; parts: Array<string | List>; }
interface List { ordered: boolean; start: number; items: ListItem[]; }
const listHtml = (list: List): string => {
  const tag = list.ordered ? "ol" : "ul";
  return `<${tag}${list.ordered && list.start > 1 ? ` start="${list.start}"` : ""}>${list.items.map(item => `<li${item.task === null ? "" : ` class="assistant-task${item.task === " " ? "" : " is-done"}"`}>${item.task === null ? "" : '<span class="assistant-task-box"></span>'}${item.parts.map(part => typeof part === "string" ? part : listHtml(part)).join("")}</li>`).join("")}</${tag}>`;
};

/** Keep the Assistant's indentation rules, including blank-separated items and indented continuation lines. */
export function assistantListHtml(lines: string[], start: number, ports: AssistantTextPorts): { html: string; end: number } {
  const roots: List[] = [], stack: Array<{ indent: number; list: List }> = [];
  let index = start, lastItem: ListItem | null = null;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) { if (index + 1 < lines.length && ASSISTANT_LIST_ITEM.test(lines[index + 1]!)) { index += 1; continue; } break; }
    const match = ASSISTANT_LIST_ITEM.exec(line);
    if (!match) {
      if (lastItem && /^\s{2,}\S/.test(line)) { lastItem.parts.push("<br>" + assistantInlineHtml(line.trim(), ports)); index += 1; continue; }
      break;
    }
    const indent = match[1]!.replace(/\t/g, "  ").length, ordered = /\d/.test(match[2]!);
    while (stack.length && indent < stack[stack.length - 1]!.indent) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || indent > top.indent) {
      const list: List = { ordered, start: Number(match[2]!.replace(/\D/g, "")), items: [] };
      if (top && lastItem) lastItem.parts.push(list); else roots.push(list);
      stack.push(top = { indent, list });
    }
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(match[3]!);
    const item: ListItem = { task: task ? task[1]! : null, parts: [assistantInlineHtml(task ? task[2]! : match[3]!, ports)] };
    top.list.items.push(item); lastItem = item; index += 1;
  }
  return { html: roots.map(listHtml).join(""), end: index };
}
