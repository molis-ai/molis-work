/** An element the server drew; the page cannot work without it. */
export function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`PPT page is missing ${selector}`);
  return node;
}

/** A one-line cell whose full text is also its tooltip. */
export function textCell(className: string, text: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.title = text;
  node.textContent = text;
  return node;
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The first line of a text, or `fallback` when it has none. */
export function firstLine(value: string | null | undefined, fallback = ""): string {
  const line = String(value || "").trim().split("\n")[0]!.trim();
  return line || fallback;
}

/** A date as a short local day (with the year when it is not this one); empty when there is none to show. */
export function whenOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}
