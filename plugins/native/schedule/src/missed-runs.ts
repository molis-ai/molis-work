import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  ActionError, assertRunsWindow, bindActionHandler, defineRunDecisionAction, defineRunsOverviewAction, runHasExpired, runIsMissed, runsExpiryBounds,
  withinRunsWindow, RUN_MISSED_KEPT_MS, RUNS_MISSED_LIMIT, RUNS_UPCOMING_LIMIT,
  type ActionExecutionContext, type ActionHandlerBinding, type MissedRun, type RunDecided, type RunDecision, type RunsOverview, type RunsWindow, type ScheduledRun,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduleJobRecord, ScheduleRegisterInput, ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";
import { SCHEDULE_OPERATION_WAKEUP, SCHEDULE_REMINDER_WAKEUP, SCHEDULE_TASK_WAKEUP_CAPABILITY } from "./background-actions.js";
import { scheduleErrors } from "./error.js";
import { SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_PLUGIN_ID } from "./manifest.js";
import { getScheduledOperation, saveScheduledOperation, scheduledOperationForJob } from "./operations.js";
import { getScheduleReminder } from "./reminders.js";
import { getScheduleConversationTask, type ScheduleTaskDatabase } from "./tasks.js";

/**
 * What Schedule missed while Molis Work was not running or the computer slept (resident-runtime-design §2.1): a task, a plugin's
 * scheduled operation or a reminder that came up more than the grace late is not run then. It is written down here, the job goes on to
 * its next time as usual, and the person decides in the menu-bar panel. 「现在做」 puts the job back at the time it missed, so the
 * Scheduler wakes it on the same path as at its time and its next time stays where it was; 「跳过」 only marks it. One nobody decided on
 * for seven days from its time is skipped on its own (scheduled-runs.ts): its row stays undecided, so it is told apart from the person's
 * 跳过; it leaves the list and is counted in `expired`, and a one-time reminder or operation behind it is ended as a 跳过 would end it.
 */
type MissedKind = "task" | "operation" | "reminder";
interface MissedRow { project_id: string; run_id: string; kind: MissedKind; ref: string; title: string; due_at: string; missed_at: string; decision: string | null }

/** Rows are kept a month past their end so a second click finds them decided: a month after the decision, or after their seven days ran out. */
const ENDED_KEPT_MS = 30 * 86_400_000;

export const scheduleRunsActions = {
  overview: defineRunsOverviewAction("schedule.runs.overview", /* @version action.schedule.runs.overview */ 1, "定时任务的运行概况", ["schedule:read"], "project"),
  decide: defineRunDecisionAction("schedule.runs.decide", /* @version action.schedule.runs.decide */ 1, "处理错过的定时任务", ["schedule:read", "schedule:write"], "project"),
};

export const missedRunId = (kind: MissedKind, ref: string, dueAt: string) => `${kind}:${ref}:${dueAt}`;
const KIND_BY_CAPABILITY: Readonly<Record<string, MissedKind>> = {
  [SCHEDULE_TASK_WAKEUP_CAPABILITY]: "task", [SCHEDULE_OPERATION_WAKEUP]: "operation", [SCHEDULE_REMINDER_WAKEUP]: "reminder",
};

/** What a job stands for, if it is still on: the missed row names it, and 「现在做」 puts its job back. */
function target(db: ScheduleTaskDatabase, kind: MissedKind, jobId: string, objectRef: string): { ref: string; title: string; jobId: string } | null {
  if (kind === "task") {
    const task = getScheduleConversationTask(db, objectRef);
    return task?.enabled && !task.archived ? { ref: task.task_id, title: task.title, jobId: task.job_id ?? jobId } : null;
  }
  if (kind === "reminder") {
    const reminder = getScheduleReminder(db, objectRef);
    return reminder && reminder.jobId === jobId ? { ref: reminder.id, title: reminder.text, jobId: reminder.jobId } : null;
  }
  const run = scheduledOperationForJob(db, jobId);
  return run?.state === "enabled" ? { ref: run.id, title: `${run.pluginTitle}：${run.operationTitle}`, jobId: run.jobId } : null;
}

function row(db: ScheduleTaskDatabase, projectId: string, runId: string): MissedRow | null {
  return (db.prepare("SELECT * FROM schedule_missed_runs WHERE project_id = ? AND run_id = ?").get(projectId, runId) as MissedRow | undefined) ?? null;
}

/**
 * Before a wakeup runs: a due time more than the grace ago, for a job that is still on and not put back by 「现在做」, is missed. The row is
 * written (once: the same occurrence is one row), and the wakeup answers without running; the Scheduler moves the job on as for any answer.
 */
export async function noteMissedWakeup(db: ScheduleTaskDatabase, projectId: string, input: ScheduleWakeupInput, now: number,
  write: (operation: () => void) => Promise<void>): Promise<ScheduleWakeupReply | null> {
  const kind = KIND_BY_CAPABILITY[input.capability_id];
  if (!kind || !runIsMissed(input.due_at, now)) return null;
  const current = target(db, kind, input.job_id, input.object_ref);
  if (!current) return null;
  const runId = missedRunId(kind, current.ref, input.due_at);
  if (row(db, projectId, runId)?.decision === "run_now") return null;
  await write(() => {
    const at = new Date(now).toISOString();
    db.prepare("DELETE FROM schedule_missed_runs WHERE project_id = ? AND ((decision IS NOT NULL AND decided_at < ?) OR (decision IS NULL AND due_at < ?))")
      .run(projectId, new Date(now - ENDED_KEPT_MS).toISOString(), new Date(now - ENDED_KEPT_MS - RUN_MISSED_KEPT_MS).toISOString());
    db.prepare(`INSERT INTO schedule_missed_runs (project_id, run_id, kind, ref, title, due_at, missed_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, run_id) DO NOTHING`).run(projectId, runId, kind, current.ref, [...current.title].slice(0, 300).join(""), input.due_at, at);
  });
  return { detail: "missed" };
}

/**
 * A one-time reminder or operation left behind a missed run that is over (skipped, by the person or on its own), ended as 跳过 ends it.
 * Only while it is still set for the time that was missed: one the person has moved to another time is theirs to keep.
 */
function endOnce(db: ScheduleTaskDatabase, projectId: string, kind: MissedKind, ref: string, dueAt: string): void {
  const due = Date.parse(dueAt), still = (item: { repeat: string; at: string } | null | undefined) => item?.repeat === "none" && Date.parse(item.at) === due;
  if (kind === "reminder" && still(getScheduleReminder(db, ref))) db.prepare("DELETE FROM schedule_plugin_reminders WHERE id = ?").run(ref);
  if (kind === "operation") {
    const run = getScheduledOperation(db, projectId, ref);
    if (run && still(run) && run.state === "enabled") saveScheduledOperation(db, { ...run, state: "completed", detail: "错过后跳过" });
  }
}

/**
 * A one-time reminder or operation whose missed run ran out its seven days without a decision is ended as 跳过 would end it, inside
 * Schedule's own write (the reconcile round), whatever Molis Work was doing on the seventh day. The rows themselves stay undecided.
 */
export function endExpiredOnce(db: ScheduleTaskDatabase, projectId: string, now: number): void {
  const rows = db.prepare(`SELECT kind, ref, due_at FROM schedule_missed_runs WHERE project_id = ? AND decision IS NULL AND kind IN ('reminder', 'operation') AND due_at <= ?`)
    .all(projectId, new Date(now - RUN_MISSED_KEPT_MS).toISOString()) as Array<Pick<MissedRow, "kind" | "ref" | "due_at">>;
  for (const { kind, ref, due_at } of rows) endOnce(db, projectId, kind, ref, due_at);
}

interface DecisionScheduler {
  get(jobId: string): ScheduleJobRecord | null;
  isExecuting(jobId: string): boolean;
  register(input: ScheduleRegisterInput): ScheduleJobRecord;
}

/** One decision, inside Schedule's write. A run that is no longer there (the task stopped, the reminder was cancelled) is `gone`. */
export function decideMissedRun(db: ScheduleTaskDatabase, schedule: DecisionScheduler, projectId: string, input: RunDecision, now: Date): RunDecided {
  const missed = row(db, projectId, input.run_id);
  if (!missed || missed.decision) return { state: "gone" };
  // Its seven days ran out before the click: it was skipped on its own and stays counted as that.
  if (runHasExpired(missed.due_at, now.getTime())) { endOnce(db, projectId, missed.kind, missed.ref, missed.due_at); return { state: "gone" }; }
  const mark = (decision: "run_now" | "skip") => db.prepare("UPDATE schedule_missed_runs SET decision = ?, decided_at = ? WHERE project_id = ? AND run_id = ?")
    .run(decision, now.toISOString(), projectId, input.run_id);
  const jobId = missed.kind === "task" ? getScheduleConversationTask(db, missed.ref)?.job_id
    : missed.kind === "reminder" ? getScheduleReminder(db, missed.ref)?.jobId : getScheduledOperation(db, projectId, missed.ref)?.jobId;
  const job = jobId ? schedule.get(jobId) : null;
  const capability = job ? KIND_BY_CAPABILITY[job.capability_id] : undefined;
  const current = job && capability === missed.kind ? target(db, missed.kind, job.job_id, job.object_ref) : null;
  if (!job || !current || current.ref !== missed.ref) { mark("skip"); return { state: "gone" }; }
  if (input.decision === "skip") {
    mark("skip");
    // A one-time reminder or operation that was missed and is skipped is over: it is not left looking as if it might still come.
    if (job.recurrence.kind === "once") endOnce(db, projectId, missed.kind, missed.ref, missed.due_at);
    return { state: "skipped" };
  }
  if (schedule.isExecuting(job.job_id)) throw scheduleErrors.job_invalid("这项正在运行，等它跑完再试");
  // Back at the time it missed: the Scheduler wakes it on its next pass, with that due time, and moves a repeating one on from there.
  schedule.register({ plugin_id: job.plugin_id, capability_id: job.capability_id, object_ref: job.object_ref, title: job.title, due_at: missed.due_at, recurrence: job.recurrence });
  mark("run_now");
  return { state: "started" };
}

/** What comes next (the jobs that are on, in the window) and what was missed and not yet decided, in this project. */
export function scheduleRunsOverview(db: ScheduleTaskDatabase, jobs: readonly ScheduleJobRecord[], projectId: string, window: RunsWindow): RunsOverview {
  assertRunsWindow(window);
  const open = (id: string) => ({ surface: SCHEDULE_PROJECT_PLUGIN_ID, id });
  const upcoming: ScheduledRun[] = [];
  for (const job of [...jobs].sort((a, b) => Date.parse(a.next_due_at) - Date.parse(b.next_due_at))) {
    const kind = KIND_BY_CAPABILITY[job.capability_id];
    if (!kind || job.plugin_id !== SCHEDULE_PLUGIN_ID || !job.enabled || !withinRunsWindow(job.next_due_at, window)) continue;
    const current = target(db, kind, job.job_id, job.object_ref);
    if (!current) continue;
    upcoming.push({ run_id: missedRunId(kind, current.ref, job.next_due_at), title: [...current.title].slice(0, 300).join(""), due_at: job.next_due_at,
      project_id: projectId, open: open(current.ref), needs: kind === "task" ? ["model"] : [] });
    if (upcoming.length >= RUNS_UPCOMING_LIMIT) break;
  }
  const bounds = runsExpiryBounds(window);
  const missed = (db.prepare("SELECT * FROM schedule_missed_runs WHERE project_id = ? AND decision IS NULL AND due_at > ? ORDER BY due_at DESC LIMIT ?")
    .all(projectId, bounds.listed_after, RUNS_MISSED_LIMIT) as MissedRow[]).map((entry): MissedRun => ({ run_id: entry.run_id, title: entry.title, due_at: entry.due_at,
    project_id: projectId, open: open(entry.ref), needs: entry.kind === "task" ? ["model"] : [], missed_at: entry.missed_at }));
  // The host page shows this label; the plugin's own words follow the action caller's language, with the old Chinese as a fallback for
  // direct calls that install no text context.
  let title = "定时任务";
  try { const word = uiText.text("schedule.runs.source-title"); if (word !== "schedule.runs.source-title") title = word; } catch { /* direct call has no text context */ }
  const expired = Number((db.prepare(`SELECT COUNT(*) AS n FROM schedule_missed_runs WHERE project_id = ? AND decision IS NULL AND due_at <= ?
    AND (? IS NULL OR due_at > ? OR missed_at > ?)`).get(projectId, bounds.listed_after, bounds.told_at, bounds.counted_after, bounds.told_at) as { n: number }).n);
  return { source: { surface: SCHEDULE_PROJECT_PLUGIN_ID, title }, upcoming, missed, expired };
}

export function createScheduleRunsHandlers(projectId: string, ports: {
  db: ScheduleTaskDatabase; schedule: DecisionScheduler & { list(): readonly ScheduleJobRecord[] };
  write<T>(caller: ActionExecutionContext, operation: () => T): Promise<T>; now?(): Date;
}): ActionHandlerBinding[] {
  const here = (caller: ActionExecutionContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "这件事不属于这个项目");
  };
  return [
    bindActionHandler(scheduleRunsActions.overview, (input, caller) => { here(caller); return scheduleRunsOverview(ports.db, ports.schedule.list(), projectId, input); }),
    bindActionHandler(scheduleRunsActions.decide, (input, caller) => {
      here(caller);
      return ports.write(caller, () => decideMissedRun(ports.db, ports.schedule, projectId, input, ports.now?.() ?? new Date()));
    }),
  ];
}
