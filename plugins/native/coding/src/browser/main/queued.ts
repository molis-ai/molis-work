import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el, errorMessage } from "../dom.js";
import { refreshState } from "./configuration.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import type { QueuedRound } from "./shapes.js";

/** Marked the priority: others whose work overlaps it are asked to make way; nothing is paused. */
export function renderPriority(page: Page, id: string, on: boolean) {
  const { q } = page, button = q("[data-coding-priority]");
  button.hidden = !id;
  button.dataset.session = id || "";
  button.setAttribute("aria-pressed", String(on));
  button.textContent = on ? uiText.text("coding.priority.on") : uiText.text("coding.priority.mark");
}

/** What a queued round waits for, in words. */
function waitingNote(_page: Page, queued: QueuedRound): string {
  return queued.note || (queued.waiting_for === "reply" ? uiText.text("coding.queued.reply", { title: queued.after_title }) : queued.waiting_for === "command" ? uiText.text("coding.queued.command", { title: queued.after_title }) : uiText.text("coding.queued.run", { title: queued.after_title }));
}

/** What was said after the person started the round now or gave the wait up. */
function doneNote(_page: Page, queued: QueuedRound, action: "start" | "cancel"): string {
  if (action === "start") return uiText.text("coding.queued.started");
  return queued.waiting_for === "reply" ? uiText.text("coding.queued.reply-cancelled") : queued.waiting_for === "command" ? uiText.text("coding.queued.command-cancelled") : uiText.text("coding.queued.cancelled");
}

/** One button of a queued round: it starts the round now, or gives up the wait. */
function queuedAction(page: Page, id: string, queued: QueuedRound, label: string, action: "start" | "cancel"): HTMLButtonElement {
  const { lifetime, s } = page, button = el("button", label, "mw-btn " + (action === "start" ? "mw-btn--primary" : "mw-btn--ghost"));
  button.type = "button";
  lifetime.listen(button, "click", async () => {
    button.disabled = true;
    try {
      await api(page, sessionPath(id) + "/queued", "POST", { action });
      status(page, doneNote(page, queued, action));
      s.queuedKey = "";
      await refreshState(page);
      await readCurrent(page);
    } catch (error) {
      status(page, errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

/** A round waiting for another session: what it waits for, and starting it now or giving the wait up. */
export function renderQueued(page: Page, id: string, queued: QueuedRound | null | undefined) {
  const { q, s } = page, box = q("[data-coding-queued]"), next = JSON.stringify([id, queued]);
  if (next === s.queuedKey) return;
  s.queuedKey = next;
  box.hidden = !queued;
  box.replaceChildren();
  if (!queued) return;
  const actions = el("div", "", "coding-queued-actions");
  actions.append(queuedAction(page, id, queued, uiText.text("coding.queued.cancel"), "cancel"), queuedAction(page, id, queued, uiText.text("coding.queued.start"), "start"));
  box.append(el("p", waitingNote(page, queued)), actions);
}
