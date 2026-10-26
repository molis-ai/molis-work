import { onWorkbenchClick } from "./actions.js";
import { wireForm } from "./form.js";
import { wireOperation } from "./operation.js";
import { createPage } from "./page.js";
import { wireRecovery } from "./recovery.js";
import { select } from "./stage.js";
import type { ScheduleHost } from "./types.js";

const OPEN_KEY = "mw-schedule-open";

/**
 * The Schedule page: create, edit, pause or archive a conversation task, and review an alarm another plugin registered. The page
 * is drawn by the server; this opens its rows and reads it again after a change.
 */
export function scheduleClient(host: ScheduleHost): void {
  const page = createPage(host);
  if (!page) return;
  const { list, workbench } = page;
  wireRecovery(page);
  wireOperation(page);
  wireForm(page);
  list.addEventListener("click", event => {
    const target = event.target as Element;
    if (target.closest("[data-schedule-new]")) return;
    const row = target.closest<HTMLElement>("[data-schedule-row]");
    if (!row) return;
    const kind = row.dataset.scheduleKind === "task" ? "task" : "job";
    select(page, kind === "task" ? row.dataset.scheduleTaskId : row.dataset.scheduleJobId, kind);
  });
  workbench.addEventListener("click", event => void onWorkbenchClick(page, event));
  const pending = sessionStorage.getItem(OPEN_KEY);
  if (pending) {
    sessionStorage.removeItem(OPEN_KEY);
    // Tab restore collapses the stage in the same initialization turn; a microtask lets a task just created or paused stay open on its conversation.
    queueMicrotask(() => select(page, pending, "task"));
  }
}
