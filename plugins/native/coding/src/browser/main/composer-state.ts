import type { Page } from "./page.js";

/** A round that has ended, one way or another. */
export function terminal(phase: string): boolean {
  return ["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(phase);
}

/**
 * The composer and what sets the next round (each a button by the box opening a dialog of that name) are shut while a session is
 * made, until its first read, and while sending.
 */
export function unread(page: Page): boolean {
  return page.s.creating || !page.refs.draft.owns(page.s.current);
}

export function shut(page: Page): boolean {
  return page.s.sending || unread(page);
}
