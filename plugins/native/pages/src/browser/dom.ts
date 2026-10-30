/** The icon sprite entry the design system draws (`#icon-<name>`). */
export const ICON = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** The node a page the server drew must have. */
export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Pages page is missing ${selector}`);
  return node;
}

export const stop = (event: Event) => { event.preventDefault(); event.stopPropagation(); };

export const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** What a failure says: its own words, or the page's fallback. */
export const said = (error: unknown, fallback: string): string => (error instanceof Error && error.message) || fallback;

/** The failure's HTTP status, when it has one. */
export const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;

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
