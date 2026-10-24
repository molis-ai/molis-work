/** Small DOM helpers the Todo page shares. */
export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const iconSvg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

/** Replays the arrival motion on a node that just appeared. */
export function arrive(node: HTMLElement | null): void {
  if (!node) return;
  node.classList.remove("is-arriving");
  void node.offsetWidth;
  node.classList.add("is-arriving");
}

export const pad = (value: number) => String(value).padStart(2, "0");
export const isoDay = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const at = new Date(iso);
  return `${isoDay(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** The element a click or change landed in, when it is one. */
export const targetElement = (event: Event): Element | null => (event.target instanceof Element ? event.target : null);

/** Opens or closes the `<details>` menu a button sits in. */
export function closeMenu(button: Element): void {
  const details = button.closest("details");
  if (details) details.open = false;
}
