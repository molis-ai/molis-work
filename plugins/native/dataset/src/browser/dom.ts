import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
export { messageOf };
/** An element the server drew; the page cannot work without it. */
export const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Dataset page is missing ${selector}`);
  return node;
};

/** A one-line cell whose full text is also its tooltip. */
export function textCell(className: string, text: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.title = text;
  node.textContent = text;
  return node;
}
