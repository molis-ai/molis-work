/** An element the server drew; the page cannot work without it. */
export function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Jelly page is missing ${selector}`);
  return node;
}

/** The nearest element above a click or input target (events from text nodes included). */
export function above<T extends Element = HTMLElement>(event: Event, selector: string): T | null {
  const origin = event.target as Element | null;
  return origin && "closest" in origin ? origin.closest<T>(selector) : null;
}
