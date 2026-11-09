import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
/** The icon sprite entry the design system draws (`#icon-<name>`). */
export const ICON = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** The first `limit` whole characters of `value`: never half of one (an emoji is one character, two UTF-16 units), and reads no further than that. */
export function firstCharacters(value: string, limit: number): string {
  let end = 0, count = 0;
  for (const character of value) {
    if (count === limit) break;
    end += character.length;
    count += 1;
  }
  return value.slice(0, end);
}

/** The first `limit` UTF-16 units of `value`, without leaving half a character at the end (a cut ending on a high surrogate drops it). */
export function cutUnits(value: string, limit: number): string {
  const cut = value.slice(0, limit), last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** The node a page the server drew must have. */
export const required = requiredQuery(selector => `Pages page is missing ${selector}`);

export const stop = (event: Event) => { event.preventDefault(); event.stopPropagation(); };

/** What a failure says: its own words, or the page's fallback. */
export const said = (error: unknown, fallback: string): string => (error instanceof Error && error.message) || fallback;

/** The failure's HTTP status, when it has one. */
export { statusOf } from "@molis-ai/molis-work-plugin-sdk/browser";

/** The text of a document node, paragraphs apart; a body that is not a document gives nothing. */
export function docText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const { type, text, content } = node as { type?: string; text?: unknown; content?: unknown };
  return typeof text === "string" ? text : Array.isArray(content) ? content.map(docText).join(type === "doc" ? "\n" : "") : "";
}

export function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" });
}

/** True for a document node with nothing but empty paragraphs (and no text beyond blanks). */
export function blank(node: unknown): boolean {
  const { type, text, content } = node as { type?: string; text?: string; content?: unknown[] };
  return type === "text" ? !(text ?? "").trim() : ["doc", "paragraph"].includes(String(type)) && (content ?? []).every(blank);
}
