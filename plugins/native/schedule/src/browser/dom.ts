import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Translate } from "./types.js";

export const required = requiredQuery(selector => `Schedule page: ${selector} is missing`);

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
