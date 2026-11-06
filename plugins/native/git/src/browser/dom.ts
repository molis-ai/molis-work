import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
export { messageOf };
export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Git page: ${selector} is missing`);
  return node;
}

/** An option list from plain values, keeping the chosen one if it is still there. */
export function setOptions(select: HTMLSelectElement, values: readonly string[], keep?: string): void {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value;
    return option;
  }));
  if (keep && values.includes(keep)) select.value = keep;
}
