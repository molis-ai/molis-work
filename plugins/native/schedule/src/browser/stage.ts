import { detailOf } from "./dom.js";
import type { SchedulePage } from "./page.js";
import type { RowKind } from "./types.js";
import { post } from "./request.js";
import { readTaskReads, sayTaskReads, showCreated } from "./reads.js";
import { closeArea, placeArea } from "./area.js";

const uiText = globalThis.t;

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

/** No row is selected and no detail shown; the new/edit form is put away too, and the open task's reads area closes. */
function clearSelection(page: SchedulePage): void {
  const { workbench, list } = page;
  closeArea(page);
  list.querySelectorAll<HTMLElement>("[data-schedule-row]").forEach(row => {
    row.classList.remove("is-selected"); row.setAttribute("aria-selected", "false"); row.tabIndex = -1;
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => { detail.hidden = true; });
  const empty = workbench.querySelector<HTMLElement>("[data-schedule-detail-empty]");
  if (empty) empty.hidden = true;
  page.pane.hidden = true;
}

/** Nothing is open: the list is shown without a selected row. */
export function collapse(page: SchedulePage): void {
  publishContext(page, null);
  expand(false);
  clearSelection(page);
}

/** The new/edit form takes the detail pane: no row is selected while it is on show. */
export function showForm(page: SchedulePage): void {
  publishContext(page, null);
  clearSelection(page);
  page.pane.hidden = false;
  expand(true);
}

/** Puts the form away and shows what it replaced: the task it edited, or nothing. */
export function closeForm(page: SchedulePage, taskId: string | null): void {
  if (taskId) select(page, taskId, "task"); else collapse(page);
}

/** Opens one row's detail; the person opening a task also marks it read (best effort), a redraw of what is open does not. */
export function select(page: SchedulePage, id: string | null | undefined, kind: RowKind, markRead = true): void {
  if (!id) { collapse(page); return; }
  const { workbench, list, host } = page;
  list.querySelectorAll<HTMLElement>("[data-schedule-row]").forEach(row => {
    const selected = kind === "task" ? row.dataset.scheduleTaskId === id : row.dataset.scheduleJobId === id;
    row.classList.toggle("is-selected", selected); row.setAttribute("aria-selected", String(selected)); row.tabIndex = selected ? 0 : -1;
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => { detail.hidden = detail.dataset.scheduleDetail !== id; });
  const empty = workbench.querySelector<HTMLElement>("[data-schedule-detail-empty]");
  if (empty) empty.hidden = true;
  page.pane.hidden = true;
  if (kind === "task") showCreated(page, id);
  expand(true);
  // The detail is on show before the area is placed on it: the place it reports is where the person sees it.
  placeArea(page, kind === "task" ? id : null);
  publishContext(page, kind === "task" ? id : null);
  // Marking a task read is a courtesy: when it does not go through, nothing the person did is lost.
  if (kind === "task" && markRead) void post(host, "/tasks/" + encodeURIComponent(id) + "/open", {}, "").catch(() => undefined);
}

/** What is open on the page: a row (by its kind and id), the new/edit form, or nothing. */
export function openNow(page: SchedulePage): { readonly id?: string; readonly kind: RowKind | "form" | "none" } {
  if (!page.pane.hidden) return { kind: "form" };
  const row = page.list.querySelector<HTMLElement>("[data-schedule-row].is-selected");
  if (!row) return { kind: "none" };
  return row.dataset.scheduleKind === "task" ? { id: row.dataset.scheduleTaskId, kind: "task" } : { id: row.dataset.scheduleJobId, kind: "job" };
}

/**
 * Reads the page again and swaps the list and the details in place, then opens `openId` (or none). When the person opened something
 * else while the page was read, that stays open instead: a late answer does not take their choice away. With `preserveConfirmation`
 * a failure is thrown to the caller (a dialog keeps its review on show); otherwise it is a toast. Without `markRead` (a redraw the
 * person did not ask for), the task opened again is not marked read.
 *
 * Reads are numbered: one started later (the person's change while a background read was under way, or the other way round) is
 * newer than any answer of an earlier one, so an earlier read that answers after it draws nothing and ends as the later one does.
 */
export function refreshStage(page: SchedulePage, openId?: string, kind: RowKind = "task", preserveConfirmation = false, markRead = true, signal?: AbortSignal, wordsOnly = false): Promise<boolean> {
  const turn = ++page.refreshing;
  const next = drawStage(page, turn, openId, kind, preserveConfirmation, markRead, signal, wordsOnly);
  page.latestRefresh = next;
  return next;
}

/** What a read the page has gone past ends with: the later read's outcome, said the way this read's caller asked for. */
async function superseded(page: SchedulePage, preserveConfirmation: boolean): Promise<boolean> {
  const drawn = await page.latestRefresh!.catch(() => false);
  if (!drawn && preserveConfirmation) throw new Error(uiText.text("schedule.error.refresh"));
  return drawn;
}

async function drawStage(page: SchedulePage, turn: number, openId: string | undefined, kind: RowKind, preserveConfirmation: boolean, markRead: boolean, signal?: AbortSignal, wordsOnly = false): Promise<boolean> {
  const { list, workbench, host } = page;
  try {
    const scrollTop = list.scrollTop, template = document.createElement("template"), asked = openNow(page);
    const html = await host.view.readDocument(signal ? { signal } : undefined);
    if (turn !== page.refreshing) return superseded(page, preserveConfirmation);
    if (signal?.aborted) return false;
    template.innerHTML = html.trim();
    const now = openNow(page), moved = now.kind !== asked.kind || now.id !== asked.id;
    const nextRoot = template.content.querySelector<HTMLElement>("[data-schedule-workbench]");
    const nextList = template.content.querySelector("[data-schedule-list]"), nextWorkspace = template.content.querySelector("[data-schedule-stage-workspace]");
    const workspace = workbench.querySelector("[data-schedule-stage-workspace]");
    if (!nextList || !nextWorkspace || !workspace) throw new Error(uiText.text("schedule.error.refresh"));
    if (nextRoot?.dataset.viewRevision) {
      workbench.dataset.viewRevision = nextRoot.dataset.viewRevision;
    }
    const chrome = list.querySelector(".plugin-stage-chrome");
    nextList.querySelector(".plugin-stage-chrome")?.remove();
    const incoming = [...nextList.childNodes];
    list.replaceChildren(...(chrome ? [chrome, ...incoming] : incoming));
    const empty = workspace.querySelector("[data-schedule-detail-empty]");
    const target = moved ? now : { id: openId, kind: openId ? kind : "none" as const };
    // The open task's reads section, where the platform's area is placed, moves into its new detail: the area stays as it is.
    const kept = page.area?.element.closest<HTMLElement>("[data-schedule-reads]");
    const keptFor = kept?.closest<HTMLElement>("[data-schedule-detail]")?.dataset.scheduleDetail;
    workspace.querySelectorAll("[data-schedule-detail]").forEach(detail => detail.remove());
    nextWorkspace.querySelectorAll("[data-schedule-detail]").forEach(detail => { if (empty) workspace.insertBefore(detail, empty); else workspace.append(detail); });
    if (kept && keptFor && target.kind === "task" && keptFor === target.id) detailOf(workspace, keptFor)?.querySelector("[data-schedule-reads]")?.replaceWith(kept);
    list.scrollTop = scrollTop;
    // What was to be opened may be gone from the new page (archived meanwhile, while a later read took an earlier one's place): nothing is open then.
    if ((target.kind === "task" || target.kind === "job") && target.id && detailOf(workspace, target.id)) select(page, target.id, target.kind, markRead);
    else if (target.kind === "task" || target.kind === "job") collapse(page);
    else if (target.kind === "none") collapse(page);
    // The rows and details are new: what each task reads is said on them again (one read for the whole list); new words alone change
    // no grant, so the last answer is said again (TGA-22).
    if (wordsOnly) sayTaskReads(page);
    else void readTaskReads(page);
    return true;
  } catch {
    if (signal?.aborted) return false;
    // A read that failed after a later one began says nothing of its own: the later read draws the page, or says it could not.
    if (turn !== page.refreshing) return superseded(page, preserveConfirmation);
    if (preserveConfirmation) throw new Error(uiText.text("schedule.error.refresh"));
    host.showToast(uiText.text("schedule.error.refresh"), true);
    return false;
  }
}
