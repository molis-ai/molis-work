import { ActionError, BACKGROUND_TASK_DONE_STATES, BACKGROUND_TASKS_OUTPUT_TYPE, type BackgroundTaskCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomeBackgroundTaskRow, HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { backgroundTaskRows } from "@molis-ai/molis-work-service-mainline";
import { collectHomeAggregate, type HomeAggregatePorts } from "./home-aggregate.js";
import { repeatingFailure } from "./host-log.js";

/**
 * The background tasks of every open project (PG-043, specs/work-line §6): what the providers that declare a `home_aggregate`
 * query of this type say is being done or waits on the person, newest first. Nothing here names a plugin or reads a table: the
 * Home asks each project's provider through its action (S-49) and flattens the answers, keeping the project and the provider
 * each came from. A project that is not open lists nothing (the Home never opens one to read it); a plugin that is off or not
 * granted in a project is not called.
 */

export type { HomeBackgroundTaskRow } from "@molis-ai/molis-work-contracts/services/mainline";

// Read on every attention poll: a project that cannot be read is written when it starts failing, and again once it has been read.
const unreadable = repeatingFailure("home", "background_tasks_unreadable");

export async function homeBackgroundTasks(ports: HomeAggregatePorts, projects: ReadonlyArray<{ project_id: string; display_name: string }>, signal?: AbortSignal): Promise<HomeBackgroundTasksReadResult> {
  const names = new Map(projects.map(project => [project.project_id, project.display_name]));
  const { answers, issues } = await collectHomeAggregate<BackgroundTaskCollection>(ports, BACKGROUND_TASKS_OUTPUT_TYPE, {}, signal);
  const rows: HomeBackgroundTaskRow[] = [];
  for (const answer of answers) {
    const tasks = backgroundTaskRows(answer.output, answer.source, answer.subject_kinds);
    const key = `${answer.project_id}:${answer.source.capability_id}`;
    if (!tasks) { issues.push({ project_id: answer.project_id, source: answer.source, code: "actions.output_invalid" }); continue; }
    unreadable.worked(key); unreadable.worked(`${answer.project_id}:`);
    const project = { project_id: answer.project_id, project_name: names.get(answer.project_id) ?? answer.project_id };
    // What ended is kept by its owner only to be reported (`reports_to`): this list is what is still being done or waits on the person.
    for (const row of tasks) if (!BACKGROUND_TASK_DONE_STATES.has(row.state)) rows.push({ ...row, ...project });
  }
  for (const issue of issues) unreadable.failed(`${issue.project_id}:${issue.source?.capability_id ?? ""}`, new ActionError(issue.code, "后台任务读不出来"), { project_id: issue.project_id });
  return { tasks: rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id)), issues };
}
