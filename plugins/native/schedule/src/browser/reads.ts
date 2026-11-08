import { detailOf } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { read } from "./request.js";
import type { Readiness, TaskReads } from "./types.js";

/** Shows one of two elements in place of the other. */
function swap(shown: HTMLElement | null, hidden: HTMLElement | null, flag: boolean): void {
  if (shown) shown.hidden = !flag;
  if (hidden) hidden.hidden = flag;
}

const hide = (root: ParentNode, selector: string, hidden: boolean) => {
  const node = root.querySelector<HTMLElement>(selector);
  if (node) node.hidden = hidden;
};

/** A category the person has to look at again: it reads more or differently now, or it is no longer offered. */
const needsPerson = (reads: TaskReads | undefined) => Boolean(reads && (reads.needs_confirmation > 0 || reads.removed > 0));

/**
 * Says on each row and detail what its task reads, from one answer for the whole list. `known` is null when the platform's list could
 * not be read: the marks stay blank and each detail says so, with a retry; a task still runs on what was last confirmed.
 */
function apply(page: SchedulePage, known: ReadonlyMap<string, TaskReads> | null, ready: Readiness | undefined): void {
  const { L, list, workbench } = page;
  list.querySelectorAll<HTMLElement>("[data-schedule-row][data-schedule-task-id]").forEach(row => {
    const reads = known?.get(row.dataset.scheduleTaskId ?? "");
    const mark = row.querySelector<HTMLElement>("[data-schedule-kind-mark]");
    if (mark) mark.dataset.scheduleKindMark = !known ? "unknown" : reads ? "data" : "files";
    swap(row.querySelector("[data-schedule-row-reconfirm]"), row.querySelector("[data-schedule-row-status]"), needsPerson(reads));
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => {
    const section = detail.querySelector<HTMLElement>("[data-schedule-reads]");
    if (!section) return;
    const reads = known?.get(detail.dataset.scheduleDetail ?? "");
    swap(detail.querySelector("[data-schedule-detail-reconfirm]"), detail.querySelector("[data-schedule-detail-status]"), needsPerson(reads));
    hide(section, "[data-schedule-reads-failed]", known !== null);
    hide(section, '[data-schedule-reads-summary="files"]', !known || Boolean(reads));
    hide(section, '[data-schedule-reads-summary="data"]', !reads);
    const count = section.querySelector("[data-schedule-reads-count]");
    if (count) count.textContent = reads ? L("schedule.reads.count", { count: reads.categories }) : "";
    hide(section, '[data-schedule-reads-note="needs_confirmation"]', !reads?.needs_confirmation);
    hide(section, '[data-schedule-reads-note="removed"]', !reads?.removed);
    hide(section, '[data-schedule-reads-note="unavailable"]', !reads?.unavailable);
    // A task that reads data needs one category it can read now; one that reads files needs the project's workspace.
    hide(section, '[data-schedule-reads-note="nothing"]', !reads || reads.granted > 0);
    hide(section, '[data-schedule-reads-note="workspace"]', !known || Boolean(reads) || ready?.workspace !== false);
  });
}

/**
 * Reads what the tasks may read (the platform's grants, `/grants`) once for the whole page, and, only when a task reads project files,
 * whether the project has a workspace (`/readiness`); then says it on the rows and details. A later read replaces an earlier one
 * that lands after it.
 */
export async function readTaskReads(page: SchedulePage): Promise<void> {
  if (!page.list.querySelector("[data-schedule-task-id]")) return;
  const reading = ++page.reading;
  const tasks = await read<{ tasks: TaskReads[] }>(page.host, "/grants").then(answer => answer.tasks, () => null);
  const known = tasks ? new Map(tasks.map(item => [item.task_id, item])) : null;
  const readsFiles = known !== null && [...page.list.querySelectorAll<HTMLElement>("[data-schedule-row][data-schedule-task-id]")].some(row => !known.has(row.dataset.scheduleTaskId ?? ""));
  const ready = readsFiles ? await read<Readiness>(page.host, "/readiness").catch(() => undefined) : undefined;
  if (reading !== page.reading) return;
  apply(page, known, ready);
}

/** The task just created says once, in its detail, that what it reads is chosen there; opening another task ends that. */
export function showCreated(page: SchedulePage, taskId: string): void {
  if (page.created && page.created !== taskId) page.created = "";
  page.workbench.querySelectorAll<HTMLElement>("[data-schedule-reads-created]").forEach(line => { line.hidden = true; });
  const line = page.created ? detailOf(page.workbench, page.created)?.querySelector<HTMLElement>("[data-schedule-reads-created]") : null;
  if (line) line.hidden = false;
}

export function wireReads(page: SchedulePage): void {
  page.workbench.addEventListener("click", event => {
    const retry = (event.target as Element).closest<HTMLButtonElement>("[data-schedule-reads-retry]");
    if (!retry) return;
    retry.disabled = true;
    void readTaskReads(page).finally(() => { retry.disabled = false; });
  });
  void readTaskReads(page);
}
