import type { UiTaskGrantsAreaState } from "@molis-ai/molis-work-contracts/platform/ui";
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

/** What a row and a detail say about one task's reads; a note left out stays as it is. */
interface Marks {
  /** Reads data (the task holds categories), else project files. */
  readonly data: boolean;
  /** A category needs the person: `needs_confirmation` or `removed`. */
  readonly reconfirm: boolean;
  /** Holds categories, none of which can be read now. */
  readonly nothing: boolean;
  readonly notes: Partial<Record<"needs_confirmation" | "removed" | "unavailable", boolean>>;
}

const marksOf = (reads: TaskReads | undefined): Marks => ({ data: Boolean(reads), reconfirm: needsPerson(reads), nothing: reads !== undefined && reads.granted === 0,
  notes: { needs_confirmation: Boolean(reads?.needs_confirmation), removed: Boolean(reads?.removed), unavailable: Boolean(reads?.unavailable) } });

function markRow(row: HTMLElement, marks: Marks | null): void {
  const mark = row.querySelector<HTMLElement>("[data-schedule-kind-mark]");
  if (mark) mark.dataset.scheduleKindMark = !marks ? "unknown" : marks.data ? "data" : "files";
  swap(row.querySelector("[data-schedule-row-reconfirm]"), row.querySelector("[data-schedule-row-status]"), Boolean(marks?.reconfirm));
}

function markDetail(detail: HTMLElement, section: HTMLElement, marks: Marks | null, ready: Readiness | undefined): void {
  swap(detail.querySelector("[data-schedule-detail-reconfirm]"), detail.querySelector("[data-schedule-detail-status]"), Boolean(marks?.reconfirm));
  for (const [state, shown] of Object.entries(marks?.notes ?? { needs_confirmation: false, removed: false, unavailable: false })) {
    hide(section, `[data-schedule-reads-note="${state}"]`, !shown);
  }
  // A task that reads data needs one category it can read now; one that reads files needs the project's workspace.
  hide(section, '[data-schedule-reads-note="nothing"]', !marks?.nothing);
  hide(section, '[data-schedule-reads-note="workspace"]', !marks || marks.data || ready?.workspace !== false);
}

/**
 * Says on each row and detail what its task reads, from one answer for the whole list. `known` is null when the platform's list could
 * not be read: the marks stay blank and each detail says so, with a retry; the task re-checks when it is due, and
 * fails that run if the grants still can't be read.
 */
function apply(page: SchedulePage, known: ReadonlyMap<string, TaskReads> | null, ready: Readiness | undefined): void {
  const { L, list, workbench } = page;
  list.querySelectorAll<HTMLElement>("[data-schedule-row][data-schedule-task-id]").forEach(row => {
    markRow(row, known ? marksOf(known.get(row.dataset.scheduleTaskId ?? "")) : null);
  });
  workbench.querySelectorAll<HTMLElement>("[data-schedule-detail]").forEach(detail => {
    const section = detail.querySelector<HTMLElement>("[data-schedule-reads]");
    if (!section) return;
    const reads = known?.get(detail.dataset.scheduleDetail ?? "");
    markDetail(detail, section, known ? marksOf(reads) : null, ready);
    hide(section, "[data-schedule-reads-failed]", known !== null);
    hide(section, '[data-schedule-reads-summary="files"]', !known || Boolean(reads));
    hide(section, '[data-schedule-reads-summary="data"]', !reads);
    const count = section.querySelector("[data-schedule-reads-count]");
    if (count) count.textContent = reads ? L("schedule.reads.count", { count: reads.categories }) : "";
  });
}

/**
 * After the person changed a task's reads in the platform's area: its row and detail say what the area's two flags tell, without
 * asking the platform again (task-grants-platform-area.md §6). A change there only ever takes a category out of
 * `needs_confirmation`, `unavailable` or `removed`, never puts one there, so a flag that is off clears those notes and one that is on
 * leaves them. The one case two flags cannot tell (nothing granted, nothing needing the person, yet a category whose plugin is off
 * still held) shows as reading files until the page reads its list again.
 */
export function markChanged(page: SchedulePage, taskId: string, state: UiTaskGrantsAreaState): void {
  page.changes.set(taskId, { state, during: page.reading });
  const data = state.granted || state.attention;
  const marks: Marks = { data, reconfirm: state.attention, nothing: !state.granted && state.attention,
    notes: { ...state.attention ? {} : { needs_confirmation: false, removed: false }, ...data ? {} : { unavailable: false } } };
  const row = [...page.list.querySelectorAll<HTMLElement>("[data-schedule-row][data-schedule-task-id]")].find(item => item.dataset.scheduleTaskId === taskId);
  if (row) markRow(row, marks);
  const detail = detailOf(page.workbench, taskId), section = detail?.querySelector<HTMLElement>("[data-schedule-reads]");
  if (!detail || !section) return;
  hide(section, "[data-schedule-reads-failed]", true);
  hide(section, '[data-schedule-reads-summary="files"]', data);
  if (!data) hide(section, '[data-schedule-reads-summary="data"]', true);
  markDetail(detail, section, marks, page.ready);
  // A task that now reads files only says whether the project has a workspace: Schedule's own read, asked once for the page.
  if (!data && page.ready === undefined) {
    void read<Readiness>(page.host, "/readiness").then(ready => {
      page.ready = ready;
      if (page.changes.get(taskId)?.state === state) markDetail(detail, section, marks, ready);
    }, () => undefined);
  }
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
  if (ready) page.ready = ready;
  apply(page, known, ready ?? page.ready);
  // A change the person made in the area while this list was on its way is newer than the list: it is said again over it.
  for (const [taskId, change] of [...page.changes]) {
    if (change.during < reading) page.changes.delete(taskId);
    else markChanged(page, taskId, change.state);
  }
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
