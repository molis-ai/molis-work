import { esc, targetOf } from "./dom.js";
import type { ToastAction, WorkflowsPage } from "./page.js";

export function hideToast(page: WorkflowsPage) {
  const { toastEl } = page;
  clearTimeout(page.toastId); page.toastAct = null;
  toastEl.classList.remove("is-on");
  setTimeout(() => { if (!toastEl.classList.contains("is-on")) toastEl.hidden = true; }, 200);
}

/** A line at the bottom of the page; with an action it waits longer, so the person can take it. */
export function toast(page: WorkflowsPage, message: string, tone?: "error" | "", action?: ToastAction) {
  const { toastEl } = page;
  page.toastAct = action || null;
  toastEl.innerHTML = `<span>${esc(message)}</span>` + (action ? `<button type="button" class="mw-toast__action" data-wf-toast-action>${esc(action.label)}</button>` : "");
  toastEl.dataset.tone = tone || "";
  if (tone === "error") toastEl.dataset.mwState = "failed"; else { delete toastEl.dataset.mwState; delete toastEl.dataset.ringMounted; }
  toastEl.classList.toggle("has-action", Boolean(action));
  toastEl.hidden = false;
  void toastEl.offsetWidth;
  toastEl.classList.add("is-on");
  clearTimeout(page.toastId);
  page.toastId = setTimeout(() => hideToast(page), action ? 6000 : 3200);
}

export function wireToast(page: WorkflowsPage) {
  page.toastEl.addEventListener("click", (event) => {
    if (!targetOf(event)?.closest("[data-wf-toast-action]") || !page.toastAct) return;
    const { run } = page.toastAct; hideToast(page); run();
  });
}
