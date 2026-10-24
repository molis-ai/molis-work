export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Text Stats page: ${selector} is missing`);
  return node;
}
