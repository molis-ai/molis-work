import { detailOf } from "./dom.js";
import type { SchedulePage } from "./page.js";
import type { RowKind } from "./types.js";
import { post } from "./request.js";

const expand = (expanded: boolean) => {
  const shell = document.querySelector<HTMLElement>("[data-schedule-stage-shell]"), workspace = document.querySelector<HTMLElement>("[data-schedule-stage-workspace]");
  if (!shell) return;
  shell.dataset.expanded = expanded ? "true" : "false";
  if (workspace) workspace.hidden = !expanded;
};

/** The task on screen, for the Assistant and the placement bar (a conversation task is what the Assistant can read). */
function publishContext(page: SchedulePage, taskId: string | null): void {
  const { workbench } = page;
  const context: { plugin_id: string; surface_title: string; object?: { kind: string; id: string; title: string } } = { plugin_id: page.host.pluginId, surface_title: "Schedule" };
  if (taskId) context.object = { kind: "schedule_task", id: taskId, title: detailOf(workbench, taskId)?.querySelector("h1")?.textContent?.trim() ?? "" };
  workbench.setAttribute("data-assistant-context", JSON.stringify(context));
}

/** Nothing is open: the list is shown without a selected row. */
export function collapse(page: SchedulePage): void {
  const { workbench, list } = page;
  publishContext(page, null);
  expand(false);
  list.querySelectorAll<HTMLElement>("[data-schedule-row]").forEach(row => {
    row.classList.remove("is-selected"); row.setAttribute("aria-selected", "false"); row.tabIndex = -1;
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => { detail.hidden = true; });
  const empty = workbench.querySelector<HTMLElement>("[data-schedule-detail-empty]");
  if (empty) empty.hidden = true;
}

/** Opens one row's detail; opening a task also marks it read (best effort). */
export function select(page: SchedulePage, id: string | null | undefined, kind: RowKind): void {
  if (!id) { collapse(page); return; }
  const { workbench, list, host } = page;
  list.querySelectorAll<HTMLElement>("[data-schedule-row]").forEach(row => {
    const selected = kind === "task" ? row.dataset.scheduleTaskId === id : row.dataset.scheduleJobId === id;
    row.classList.toggle("is-selected", selected); row.setAttribute("aria-selected", String(selected)); row.tabIndex = selected ? 0 : -1;
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => { detail.hidden = detail.dataset.scheduleDetail !== id; });
  const empty = workbench.querySelector<HTMLElement>("[data-schedule-detail-empty]");
  if (empty) empty.hidden = true;
  expand(true);
  publishContext(page, kind === "task" ? id : null);
  // Marking a task read is a courtesy: when it does not go through, nothing the person did is lost.
  if (kind === "task") void post(host, "/tasks/" + encodeURIComponent(id) + "/open", {}, "").catch(() => undefined);
}

/**
 * Reads the page again and swaps the list and the details in place, then opens `openId` (or none). With `preserveConfirmation`
 * a failure is thrown to the dialog that asked, which keeps its review on show; otherwise it is a toast.
 */
export async function refreshStage(page: SchedulePage, openId?: string, kind: RowKind = "task", preserveConfirmation = false): Promise<boolean> {
  const { L, list, workbench, host } = page;
  try {
    const scrollTop = list.scrollTop, template = document.createElement("template");
    template.innerHTML = (await host.view.readDocument()).trim();
    const nextList = template.content.querySelector("[data-schedule-list]"), nextWorkspace = template.content.querySelector("[data-schedule-stage-workspace]");
    const workspace = workbench.querySelector("[data-schedule-stage-workspace]");
    if (!nextList || !nextWorkspace || !workspace) throw new Error(L("schedule.error.refresh"));
    const chrome = list.querySelector(".plugin-stage-chrome");
    nextList.querySelector(".plugin-stage-chrome")?.remove();
    const incoming = [...nextList.childNodes];
    list.replaceChildren(...(chrome ? [chrome, ...incoming] : incoming));
    const empty = workspace.querySelector("[data-schedule-detail-empty]");
    workspace.querySelectorAll("[data-schedule-detail]").forEach(detail => detail.remove());
    nextWorkspace.querySelectorAll("[data-schedule-detail]").forEach(detail => { if (empty) workspace.insertBefore(detail, empty); else workspace.append(detail); });
    list.scrollTop = scrollTop;
    if (openId) select(page, openId, kind); else collapse(page);
    return true;
  } catch {
    if (preserveConfirmation) throw new Error(L("schedule.error.refresh"));
    host.showToast(L("schedule.error.refresh"), true);
    return false;
  }
}
