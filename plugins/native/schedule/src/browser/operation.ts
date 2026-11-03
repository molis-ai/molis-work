import { detailOf, messageOf, required, showMessage } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { post } from "./request.js";
import { refreshStage } from "./stage.js";

const error = (page: SchedulePage) => required(page.operationForm, "[data-operation-review-error]");

const lock = (page: SchedulePage, busy: boolean) => {
  const { operationForm, operationReview } = page;
  page.operationBusy = busy;
  operationForm.setAttribute("aria-busy", String(busy));
  operationForm.querySelectorAll("button").forEach(button => { button.disabled = busy; });
  required<HTMLButtonElement>(operationForm, "[type=submit]").disabled = busy || !operationReview?.input;
};

/** What the decision would do, in words the person reads before confirming. */
function warning(page: SchedulePage, decision: string): string {
  const { L } = page;
  return decision === "retry" ? L("schedule.operation.warning-retry") : decision === "skip" ? L("schedule.operation.warning-skip") : L("schedule.operation.warning-resume");
}

/** Fills the dialog from the operation's detail: what it is, what it was given, and what the decision does. */
function readOperation(page: SchedulePage, id: string, decision: string): void {
  const { L, workbench, operationForm } = page, detail = detailOf(workbench, "operation:" + id);
  const button = [...(detail?.querySelectorAll<HTMLElement>("[data-schedule-operation-decision]") ?? [])].find(item => item.dataset.scheduleOperationDecision === decision);
  page.operationReview = { id, decision, input: button ? { ...(JSON.parse(button.dataset.confirmation ?? "{}") as Record<string, string>), decision } : null };
  required(operationForm, "[data-operation-review-title]").textContent = detail?.querySelector("h1")?.textContent ?? "";
  required(operationForm, "[data-operation-review-target]").textContent = detail?.querySelector("[data-schedule-operation-target]")?.textContent ?? "";
  required(operationForm, "[data-operation-review-input]").textContent = detail?.querySelector("[data-schedule-operation-input]")?.textContent ?? "";
  required(operationForm, "[data-operation-review-warning]").textContent = button ? warning(page, decision) : L("schedule.operation.changed");
  lock(page, false);
}

/** Opens the review of one decision about an unknown outcome. */
export function openOperation(page: SchedulePage, id: string, decision: string): void {
  if (page.operationBusy) return;
  readOperation(page, id, decision);
  showMessage(error(page), "");
  page.operationDialog.showModal();
}

export function wireOperation(page: SchedulePage): void {
  const { L, operationDialog, operationForm } = page;
  operationForm.querySelectorAll("[data-schedule-operation-close]").forEach(button => button.addEventListener("click", () => { if (!page.operationBusy) operationDialog.close(); }));
  operationDialog.addEventListener("cancel", event => { if (page.operationBusy) event.preventDefault(); });
  operationForm.querySelector("[data-operation-review-refresh]")?.addEventListener("click", async () => {
    if (page.operationBusy || !page.operationReview) return;
    const { id, decision } = page.operationReview;
    lock(page, true); showMessage(error(page), "");
    try { await refreshStage(page, "operation:" + id, "job", true); readOperation(page, id, decision); }
    catch (failure) { showMessage(error(page), messageOf(failure)); }
    finally { lock(page, false); }
  });
  operationForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (page.operationBusy || !page.operationReview?.input) return;
    const { id, input } = page.operationReview;
    lock(page, true); showMessage(error(page), "");
    try {
      await post(page.host, "/operations/" + encodeURIComponent(id) + "/recover", input, L("schedule.error.restore-operation"));
      page.operationReview.input = null;
      await refreshStage(page, "operation:" + id, "job", true);
      operationDialog.close();
    } catch (failure) { showMessage(error(page), messageOf(failure) || L("schedule.error.restore-operation")); }
    finally { lock(page, false); }
  });
}
