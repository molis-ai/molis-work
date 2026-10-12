export function find<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`I0 preview is missing ${selector}`);
  return found;
}
export function text(root: ParentNode, selector: string, value: string): void {
  const element = find(root, selector);
  if (element.textContent !== value) element.textContent = value;
}
export function show(root: ParentNode, selector: string, visible: boolean): void {
  find(root, selector).hidden = !visible;
}
export function disable(root: ParentNode, selector: string, disabled: boolean): void {
  root.querySelectorAll<HTMLButtonElement>(selector).forEach(button => { button.disabled = disabled; });
}
export function focusField(root: HTMLElement, name: string): void {
  const field = find(root, `[data-field="${name}"]`);
  find(field, "input,textarea,button,[tabindex]").focus();
}
