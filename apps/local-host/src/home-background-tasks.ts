import { ActionError, BACKGROUND_TASK_DONE_STATES, BACKGROUND_TASKS_OUTPUT_TYPE, type BackgroundTaskCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomeBackgroundTaskRow, HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { STATE_RING_FAMILIES } from "@molis-ai/molis-work-contracts/platform/ui";
import { backgroundTaskRows } from "@molis-ai/molis-work-service-mainline";
import { collectHomeAggregate, rememberRestingReading, type HomeAggregatePorts, type HomeAggregateResult } from "./home-aggregate.js";
import { repeatingFailure } from "./host-log.js";

/**
 * The background tasks of open and resting projects (PG-043, specs/work-line §6): what the providers that declare a `home_aggregate`
 * query of this type say is being done or waits on the person, newest first. Nothing here names a plugin or reads a table: the
 * Home asks each project's provider through its action (S-49) and flattens the answers, keeping the project and the provider
 * each came from. Sleeping or restarted projects whose persisted resting reading still holds answer without being opened
 * (`resting: true`), unread or stale ones are quietly read once in the background, and a project closed on purpose is cleared and
 * neither read nor opened; a plugin that is off or not granted in a project is not called.
 */

export type { HomeBackgroundTaskRow } from "@molis-ai/molis-work-contracts/services/mainline";

// Read on every attention poll: a project that cannot be read is written when it starts failing, and again once it has been read.
const unreadable = repeatingFailure("home", "background_tasks_unreadable");

/** The states of a background task that is being done, waits its turn, or tries again: work a closing project or restart would cut short. */
const UNDER_WAY: ReadonlySet<string> = new Set(STATE_RING_FAMILIES.filter(family => (["running", "waiting", "syncing", "retrying"] as const)
  .some(key => key === family.key)).flatMap(family => [...family.states]));

/** Active waiting states whose liveness does not survive a Host restart and must be reconciled against the new process's `startedAt`. */
const PROCESS_BOUND_STATES: ReadonlySet<string> = new Set(["paused", "answer", "approval"]);

/** Visibility window for ended background tasks that report back to the Assistant (`reports_to`, e.g. failed image jobs). */
const REPORTED_ENDED_TTL_MS = 10 * 60_000;

function hasUnderWayTasks(result: HomeAggregateResult<BackgroundTaskCollection>): boolean {
  if (result.issues.some(issue => issue.code === "actions.timeout")) return true;
  return result.answers.some(answer => backgroundTaskRows(answer.output, answer.source, answer.subject_kinds)?.some(row => UNDER_WAY.has(row.state)) ?? false);
}

function hasRestartSensitiveTasks(result: HomeAggregateResult<BackgroundTaskCollection>): boolean {
  return result.answers.some(answer => backgroundTaskRows(answer.output, answer.source, answer.subject_kinds)
    ?.some(row => PROCESS_BOUND_STATES.has(row.state) || row.commands.length > 0) ?? false);
}

function hasExpiredReportedTasks(result: HomeAggregateResult<BackgroundTaskCollection>, now: number): boolean {
  return result.answers.some(answer => backgroundTaskRows(answer.output, answer.source, answer.subject_kinds)
    ?.some(row => {
      if (!row.reports_to) return false;
      if (row.state !== "failed" && row.state !== "interrupted" && !BACKGROUND_TASK_DONE_STATES.has(row.state)) return false;
      const updatedMs = Date.parse(row.updated_at);
      return !Number.isFinite(updatedMs) || now - updatedMs > REPORTED_ENDED_TTL_MS;
    }) ?? false);
}

function summarizeTaskOutput(output: BackgroundTaskCollection): BackgroundTaskCollection {
  if (!Array.isArray(output?.tasks)) return output;
  return { ...output, tasks: output.tasks.map(row => {
    if (row?.held_reviews === undefined) return row;
    const { held_reviews: _heldReviews, ...task } = row;
    return task;
  }) };
}

export async function homeBackgroundTasks(ports: HomeAggregatePorts, projects: ReadonlyArray<{ project_id: string; display_name: string }>, signal?: AbortSignal): Promise<HomeBackgroundTasksReadResult> {
  const names = new Map(projects.map(project => [project.project_id, project.display_name]));
  const { answers, issues } = await collectHomeAggregate<BackgroundTaskCollection>(
    ports,
    BACKGROUND_TASKS_OUTPUT_TYPE,
    {},
    signal,
    {
      projectOutput: summarizeTaskOutput,
      persistable: result => !hasUnderWayTasks(result),
      stillValid: (result, meta) => !hasUnderWayTasks(result)
        && !(meta?.restarted && hasRestartSensitiveTasks(result))
        && !hasExpiredReportedTasks(result, meta?.now ?? Date.now()),
    },
  );
  const rows: HomeBackgroundTaskRow[] = [];
  for (const answer of answers) {
    const tasks = backgroundTaskRows(answer.output, answer.source, answer.subject_kinds);
    const key = `${answer.project_id}:${answer.source.capability_id}`;
    if (!tasks) {
      issues.push({ project_id: answer.project_id, source: answer.source, code: "actions.output_invalid" });
      continue;
    }
    unreadable.worked(key);
    unreadable.worked(`${answer.project_id}:`);
    const project = { project_id: answer.project_id, project_name: names.get(answer.project_id) ?? answer.project_id, ...(answer.resting ? { resting: true as const } : {}) };
    // What ended is kept by its owner only to be reported (`reports_to`): this list is what is still being done or waits on the person.
    for (const row of tasks) {
      if (!BACKGROUND_TASK_DONE_STATES.has(row.state)) rows.push({ ...row, ...project });
    }
  }
  for (const issue of issues) {
    unreadable.failed(`${issue.project_id}:${issue.source?.capability_id ?? ""}`, new ActionError(issue.code, "后台任务读不出来"), { project_id: issue.project_id });
  }
  return { tasks: rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id)), issues };
}

/**
 * Whether the project's background-task providers say something in it is under way: asked before the project is put to
 * sleep, the same read the Home makes, for that project alone. A provider that ran out of time counts as under way: not knowing is
 * no reason to close it. When nothing is under way and the project stayed unused during the read, the fresh reading is recorded
 * so sleeping can persist it without an extra wake after restart.
 */
export async function backgroundWorkUnderWay(ports: HomeAggregatePorts, reference: { project_id: string; storage_key: string }): Promise<boolean> {
  const resting = ports.resting;
  const usedAt = resting?.rest(reference).usedAt;
  let entered = false;
  const enter: HomeAggregatePorts["whileOpen"] = (project, work) => ports.whileOpen(project, () => {
    entered = true;
    return work();
  });
  const result = await collectHomeAggregate<BackgroundTaskCollection>(
    { ...ports, openProjects: () => [reference], whileOpen: enter, resting: undefined },
    BACKGROUND_TASKS_OUTPUT_TYPE,
    {},
    undefined,
    { projectOutput: summarizeTaskOutput },
  );
  const underWay = hasUnderWayTasks(result);
  if (!underWay && resting && entered && resting.rest(reference).usedAt === usedAt) {
    rememberRestingReading(resting, reference, BACKGROUND_TASKS_OUTPUT_TYPE, {}, usedAt, result, true);
  }
  return underWay;
}
