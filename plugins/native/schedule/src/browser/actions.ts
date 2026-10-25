import { messageOf, showActionStatus } from "./dom.js";
import { openEdit } from "./form.js";
import { openOperation } from "./operation.js";
import type { SchedulePage } from "./page.js";
import { openRecovery } from "./recovery.js";
import { post } from "./request.js";
import { collapse, refreshStage } from "./stage.js";

/** Asks the Host to change one thing, then reads the page again; a failure is said under the detail's buttons. */
async function change(button: HTMLButtonElement, fallback: string, write: () => Promise<unknown>, then: () => Promise<unknown>): Promise<void> {
  button.disabled = true;
  try {
    await write();
    await then();
  } catch (error) {
    showActionStatus(button, messageOf(error) || fallback);
    button.disabled = false;
  }
}

/** A refresh button on a detail that keeps its review (the reminder's or the operation's): a failure is said under its buttons. */
async function refreshDetail(page: SchedulePage, button: HTMLButtonElement, id: string): Promise<void> {
  button.disabled = true;
  try { await refreshStage(page, id, "job", true); }
  catch (error) { showActionStatus(button, messageOf(error)); }
  finally { button.disabled = false; }
}

async function archive(page: SchedulePage, button: HTMLButtonElement): Promise<void> {
  const { L, host } = page, id = button.dataset.scheduleTaskArchive ?? "";
  if (!await host.confirm(L("schedule.archive.confirm"))) return;
  await change(button, L("schedule.error.archive"), () => post(host, "/tasks/" + encodeURIComponent(id) + "/archive", {}, L("schedule.error.archive")), () => refreshStage(page));
}

/** Pauses or resumes a conversation task. */
function toggleTask(page: SchedulePage, button: HTMLButtonElement): Promise<void> {
  const { L, host } = page, id = button.dataset.scheduleTaskId ?? "", enabled = button.dataset.scheduleTaskEnabledAction === "true";
  return change(button, L("schedule.error.update"), () => post(host, "/tasks/" + encodeURIComponent(id) + "/enabled", { enabled }, L("schedule.error.update")), () => refreshStage(page, id, "task"));
}

/** Pauses or resumes an alarm another plugin registered (or an operation on one). */
function toggleJob(page: SchedulePage, button: HTMLButtonElement): Promise<void> {
  const { L, host } = page, id = button.dataset.scheduleJobId ?? "", enabled = button.dataset.scheduleEnabledAction === "true";
  return change(button, L("schedule.error.update"), () => post(host, "/jobs/" + encodeURIComponent(id) + "/enabled", { enabled }, L("schedule.error.update")), () => refreshStage(page, button.dataset.scheduleDetailId || id, "job"));
}

/** What a click on the workbench asks for, by the first control it landed on. */
export async function onWorkbenchClick(page: SchedulePage, event: Event): Promise<void> {
  const target = event.target as Element, hit = <E extends HTMLElement>(selector: string) => target.closest<E>(selector);
  const decision = hit("[data-schedule-operation-decision]");
  if (decision) { openOperation(page, decision.dataset.operationId ?? "", decision.dataset.scheduleOperationDecision ?? ""); return; }
  const operationRefresh = hit<HTMLButtonElement>("[data-schedule-operation-refresh]");
  if (operationRefresh) { await refreshDetail(page, operationRefresh, "operation:" + (operationRefresh.dataset.scheduleOperationRefresh ?? "")); return; }
  const recover = hit("[data-schedule-reminder-recover]");
  if (recover) { openRecovery(page, recover.dataset.scheduleJobId ?? ""); return; }
  const reminderRefresh = hit<HTMLButtonElement>("[data-schedule-reminder-refresh]");
  if (reminderRefresh) { await refreshDetail(page, reminderRefresh, reminderRefresh.dataset.scheduleReminderRefresh ?? ""); return; }
  if (hit("[data-schedule-collapse]")) { collapse(page); return; }
  const edit = hit("[data-schedule-task-edit]");
  if (edit) { openEdit(page, edit); return; }
  const archiving = hit<HTMLButtonElement>("[data-schedule-task-archive]");
  if (archiving) { await archive(page, archiving); return; }
  const task = hit<HTMLButtonElement>("[data-schedule-task-enabled-action]");
  if (task) { await toggleTask(page, task); return; }
  const job = hit<HTMLButtonElement>("[data-schedule-enabled-action]");
  if (job) await toggleJob(page, job);
}
