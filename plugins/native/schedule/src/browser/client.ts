import { onWorkbenchClick } from "./actions.js";
import { wireForm } from "./form.js";
import { wireOperation } from "./operation.js";
import { createPage } from "./page.js";
import { wireReads } from "./reads.js";
import { wireRecovery } from "./recovery.js";
import { detailOf } from "./dom.js";
import { openNow, refreshStage, select } from "./stage.js";
import type { ScheduleHost } from "./types.js";
import { read } from "./request.js";

const OPEN_KEY = "mw-schedule-open";

/**
 * The Schedule page: create, edit, pause or archive a conversation task, and review an alarm another plugin registered. The page
 * is drawn by the server; this opens its rows, says what each task reads, and reads it again after a change.
 */
export function scheduleClient(host: ScheduleHost): void {
  const page = createPage(host);
  if (!page) return;
  const { list, workbench } = page;
  wireRecovery(page);
  wireOperation(page);
  wireForm(page);
  wireReads(page);
  // Schedule says when what its page shows has changed behind it (a round, reminder or operation ended, a task stopped or was set for
  // its next time, or anyone changed a task through its actions): while the page is on screen it reads the page again only when
  // `/view-revision` differs from the drawn `data-view-revision`, keeping open what is open without marking a task read (PG-061, 96-2).
  // While the form, recovery/operation dialog, or a write is active, it waits and tries again on the next check.
  let observedRevision = "";
  host.scope.watchRevision(async signal => {
    observedRevision = "";
    const result = await read<{ revision?: string }>(host, "/view-revision", signal);
    if (typeof result?.revision === "string") observedRevision = result.revision;
    return result;
  }, async signal => {
    const currentRevision = page.workbench.dataset.viewRevision;
    if (observedRevision && currentRevision && observedRevision === currentRevision) return true;
    const open = openNow(page);
    if (open.kind === "form" || page.creating || page.recovering || page.operationBusy || page.changing > 0 || page.recoveryDialog.open || page.operationDialog.open) return false;
    // A page that could not be read this time keeps the change for the next check.
    const drawn = await refreshStage(page, open.id, open.kind === "none" ? "task" : open.kind, true, false, signal).then(() => true, () => false);
    if (drawn && observedRevision && !page.workbench.dataset.viewRevision) {
      page.workbench.dataset.viewRevision = observedRevision;
    }
    return drawn;
  });
  list.addEventListener("click", event => {
    const target = event.target as Element;
    if (target.closest("[data-schedule-new]")) return;
    const row = target.closest<HTMLElement>("[data-schedule-row]");
    if (!row) return;
    const kind = row.dataset.scheduleKind === "task" ? "task" : "job";
    select(page, kind === "task" ? row.dataset.scheduleTaskId : row.dataset.scheduleJobId, kind);
  });
  workbench.addEventListener("click", event => void onWorkbenchClick(page, event));
  // Another page opens one task by its id (a risk's review sends the person here to grant its reads): its detail opens; a task this
  // page does not hold (archived, or another project's) is told to the workbench, which neither names it nor carries it.
  workbench.addEventListener("molis-work:select-item", event => {
    const itemId = (event as CustomEvent<{ itemId?: unknown } | undefined>).detail?.itemId;
    if (typeof itemId !== "string" || !itemId) return;
    event.preventDefault();
    if (detailOf(workbench, itemId)) select(page, itemId, "task");
    else workbench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId } }));
  });
  const pending = sessionStorage.getItem(OPEN_KEY);
  if (pending) {
    sessionStorage.removeItem(OPEN_KEY);
    // Tab restore collapses the stage in the same initialization turn; a microtask lets a task just created or paused stay open on its conversation.
    queueMicrotask(() => select(page, pending, "task"));
  }
}
