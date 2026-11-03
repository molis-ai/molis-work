import { detailOf, messageOf, required, showMessage } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { post } from "./request.js";
import { refreshStage } from "./stage.js";

const lock = (page: SchedulePage, busy: boolean) => {
  const { recoveryForm, recovery } = page;
  page.recovering = busy;
  recoveryForm.setAttribute("aria-busy", String(busy));
  recoveryForm.querySelectorAll("button").forEach(button => { button.disabled = busy; });
  required<HTMLButtonElement>(recoveryForm, "[type=submit]").disabled = busy || !recovery?.input;
};

/** Fills the dialog from the reminder's detail: what it says, and who it would be handed to. */
export function readRecovery(page: SchedulePage, jobId: string): void {
  const { L, workbench, recoveryForm } = page, detail = detailOf(workbench, jobId);
  const button = detail?.querySelector<HTMLElement>("[data-schedule-reminder-recover]");
  page.recovery = { jobId, input: button ? { expected_installation_id: button.dataset.installationId ?? "", expected_generation: button.dataset.generation ?? "" } : null };
  required(recoveryForm, "[data-schedule-recovery-text]").textContent = detail?.querySelector("[data-schedule-reminder-text]")?.textContent ?? "";
  required(recoveryForm, "[data-schedule-recovery-target]").textContent = detail?.querySelector("[data-schedule-reminder-target]")?.textContent || L("schedule.recovery.gone");
  lock(page, false);
}

/** Opens the review of one reminder's restoration. */
export function openRecovery(page: SchedulePage, jobId: string): void {
  if (page.recovering) return;
  readRecovery(page, jobId);
  showMessage(page.recoveryError, "");
  page.recoveryDialog.showModal();
}

export function wireRecovery(page: SchedulePage): void {
  const { L, recoveryDialog, recoveryForm, recoveryError } = page;
  recoveryForm.querySelectorAll("[data-schedule-recovery-close]").forEach(button => button.addEventListener("click", () => { if (!page.recovering) recoveryDialog.close(); }));
  recoveryDialog.addEventListener("cancel", event => { if (page.recovering) event.preventDefault(); });
  recoveryForm.querySelector("[data-schedule-recovery-refresh]")?.addEventListener("click", async () => {
    if (page.recovering || !page.recovery) return;
    const jobId = page.recovery.jobId;
    lock(page, true); showMessage(recoveryError, "");
    try { await refreshStage(page, jobId, "job", true); readRecovery(page, jobId); }
    catch (error) { showMessage(recoveryError, messageOf(error) || L("schedule.error.refresh")); }
    finally { lock(page, false); }
  });
  recoveryForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (page.recovering || !page.recovery?.input) return;
    const { jobId, input } = page.recovery;
    lock(page, true); showMessage(recoveryError, "");
    try {
      await post(page.host, "/jobs/" + encodeURIComponent(jobId) + "/recover-reminder", input, L("schedule.error.restore-reminder"));
      // If refreshing fails, keep the review visible but never submit the old confirmation again.
      page.recovery.input = null;
      await refreshStage(page, jobId, "job", true);
      recoveryDialog.close();
    } catch (error) { showMessage(recoveryError, messageOf(error) || L("schedule.error.restore-reminder")); }
    finally { lock(page, false); }
  });
}
