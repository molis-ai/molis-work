import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `Lingguang page is missing ${selector}`);

export { textCell } from "@molis-ai/molis-work-plugin-sdk/browser";

/** A short card: who or what it is, then its text. */
export function textCard(head: string, text: string, className?: string): HTMLElement {
  const card = document.createElement("article"), title = document.createElement("strong"), body = document.createElement("p");
  if (className) card.className = className;
  title.textContent = head;
  body.textContent = text;
  card.append(title, body);
  return card;
}

export { isAbort } from "@molis-ai/molis-work-plugin-sdk/browser";
