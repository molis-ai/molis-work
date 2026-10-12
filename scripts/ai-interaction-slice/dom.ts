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
  root.querySelectorAll<HTMLElement>(selector).forEach(element => { element.hidden = !visible; });
}
export function disable(root: ParentNode, selector: string, disabled: boolean): void {
  root.querySelectorAll<HTMLButtonElement>(selector).forEach(button => { button.disabled = disabled; });
}
export function attr(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
/** Focus the control a field's error points at, then make sure it is in view of its own scroller. */
export function focusField(root: HTMLElement, name: string): void {
  const field = find(root, `[data-ix-field="${name}"]`);
  const target = field.querySelector<HTMLElement>("[data-ix-focus]") ?? find(field, "input,textarea,button,[tabindex]");
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}
/** True when the scroller sits at (or within a line of) its end. */
export function atEnd(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
}
