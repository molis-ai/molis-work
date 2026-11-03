import type { Translate } from "./types.js";

export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Schedule page: ${selector} is missing`);
  return node;
}

export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

/** The detail on show for a row, by the id its `data-schedule-detail` carries. */
export const detailOf = (workbench: ParentNode, id: string): HTMLElement | undefined =>
  [...workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]")].find(item => item.dataset.scheduleDetail === id);

/** Says why an action on a detail did not happen, under that detail's buttons. */
export function showActionStatus(from: Element | null | undefined, message: string): void {
  const status = from?.closest("[data-schedule-detail]")?.querySelector<HTMLElement>("[data-schedule-action-status]");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
}

/** A one-line message in a dialog's error slot; an empty message hides it. */
export function showMessage(slot: HTMLElement, message: string): void {
  slot.textContent = message;
  slot.hidden = !message;
}

export type { Translate };
