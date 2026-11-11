export const required = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Files page: ${selector} is missing`);
  return node;
};
