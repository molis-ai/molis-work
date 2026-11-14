import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `Jelly page is missing ${selector}`);

/** The nearest element above a click or input target (events from text nodes included). */
export function above<T extends Element = HTMLElement>(event: Event, selector: string): T | null {
  const origin = event.target as Element | null;
  return origin && "closest" in origin ? origin.closest<T>(selector) : null;
}
