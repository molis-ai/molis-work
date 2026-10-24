/** An element the server drew; the page cannot work without it. */
export function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Lingguang page is missing ${selector}`);
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

/** A short card: who or what it is, then its text. */
export function textCard(head: string, text: string, className?: string): HTMLElement {
  const card = document.createElement("article"), title = document.createElement("strong"), body = document.createElement("p");
  if (className) card.className = className;
  title.textContent = head;
  body.textContent = text;
  card.append(title, body);
  return card;
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export const isAbort = (error: unknown): boolean => (error as { name?: string } | null)?.name === "AbortError";
