import { ActionError, HOME_BACKGROUND_TASKS_OUTPUT_TYPE, type HomeBackgroundTask, type HomeBackgroundTaskCollection, type HomeBackgroundTaskPhrase } from "@molis-ai/molis-work-contracts/platform/actions";
import { collectHomeAggregate, type HomeAggregatePorts } from "./home-aggregate.js";
import { repeatingFailure } from "./host-log.js";

/**
 * The title bar's background tasks (PG-043): what the plugins that declare a `home_aggregate` query of this type say is still running
 * or waiting on the person, in every open project, newest first. Nothing here names a plugin or reads a table: the Home asks each
 * project's plugin through its action (S-49) and flattens the answers, keeping the project each came from. A project that is not open
 * lists nothing (the Home never opens one to read it); a plugin that is off or not granted in a project is not called.
 */

/** A task as the page draws it: the plugin's own row, with where it came from and the URL that stops each command it left running. */
export interface HomeBackgroundTaskRow {
  project_id: string;
  project_name: string;
  /** The workbench surface the plugin shows the task on. */
  surface: string;
  id: string;
  title: string;
  state: string;
  updated_at: string;
  waiting: boolean;
  standing: HomeBackgroundTaskPhrase[];
  commands: Array<{ task_id: string; summary: string; stop_url: string }>;
}

const SURFACE = /^[a-zA-Z0-9_-]{1,64}$/;
const SEGMENT = /^[A-Za-z0-9._~%-]{1,400}$/;

/**
 * The page URL of a plugin route the plugin named relative to itself (`/sessions/s1/background/t1/stop`): the plugin and the project are
 * the Host's own, and the path must be plain segments that stay under the plugin once the browser resolves them. Anything else is not offered.
 */
function pluginUrl(projectId: string, pluginId: string, path: string): string | null {
  if (!path.startsWith("/")) return null;
  const segments = path.slice(1).split("/");
  if (segments.length > 12) return null;
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return null; }
    // A browser resolves `%2e%2e` as `..`, and a control character or a backslash is no part of a route.
    if (decoded === "." || decoded === ".." || /[\\\u0000-\u001f]/.test(decoded)) return null;
  }
  return `/projects/${encodeURIComponent(projectId)}/api/plugins/${encodeURIComponent(pluginId)}/${segments.join("/")}`;
}

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

function phrasesOf(value: unknown): HomeBackgroundTaskPhrase[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const phrases: HomeBackgroundTaskPhrase[] = [];
  for (const phrase of value as Array<Record<string, unknown> | null>) {
    if (!phrase || !text(phrase.text, 200) || (phrase.count !== undefined && !Number.isSafeInteger(phrase.count))) return null;
    phrases.push({ text: phrase.text, ...(phrase.count === undefined ? {} : { count: phrase.count as number }) });
  }
  return phrases;
}

/** One task of an answer, or null when the plugin sent something the page cannot draw. */
function rowOf(task: HomeBackgroundTask, base: Pick<HomeBackgroundTaskRow, "project_id" | "project_name" | "surface">, pluginId: string | null): HomeBackgroundTaskRow | null {
  const standing = phrasesOf(task?.standing);
  if (!standing || !text(task.id, 200) || typeof task.title !== "string" || !text(task.state, 200) || !text(task.updated_at, 64) || typeof task.waiting !== "boolean" || !Array.isArray(task.commands)) return null;
  const commands: HomeBackgroundTaskRow["commands"] = [];
  for (const command of task.commands) {
    const stop = pluginId && text(command?.task_id, 200) && typeof command.summary === "string" && text(command.stop_path, 1000) ? pluginUrl(base.project_id, pluginId, command.stop_path) : null;
    if (stop) commands.push({ task_id: command.task_id, summary: command.summary, stop_url: stop });
  }
  return { ...base, id: task.id, title: task.title, state: task.state, updated_at: task.updated_at, waiting: task.waiting, standing, commands };
}

// Read on every attention poll: a project that cannot be read is written when it starts failing, and again once it has been read.
const unreadable = repeatingFailure("home", "background_tasks_unreadable");

export async function homeBackgroundTasks(ports: HomeAggregatePorts, projects: ReadonlyArray<{ project_id: string; display_name: string }>, signal?: AbortSignal): Promise<HomeBackgroundTaskRow[]> {
  const names = new Map(projects.map(project => [project.project_id, project.display_name]));
  const { answers, issues } = await collectHomeAggregate<HomeBackgroundTaskCollection>(ports, HOME_BACKGROUND_TASKS_OUTPUT_TYPE, {}, signal);
  const rows: HomeBackgroundTaskRow[] = [];
  for (const answer of answers) {
    const surface = answer.output?.source?.surface;
    const tasks = Array.isArray(answer.output?.tasks) ? answer.output.tasks : null;
    const key = `${answer.project_id}:${answer.source.capability_id}`;
    if (typeof surface !== "string" || !SURFACE.test(surface) || !tasks) { unreadable.failed(key, new ActionError("actions.output_invalid", "后台任务的回答读不了"), { project_id: answer.project_id }); continue; }
    unreadable.worked(key); unreadable.worked(`${answer.project_id}:`);
    const base = { project_id: answer.project_id, project_name: names.get(answer.project_id) ?? answer.project_id, surface };
    for (const task of tasks) { const row = rowOf(task, base, answer.plugin_id); if (row) rows.push(row); }
  }
  for (const issue of issues) unreadable.failed(`${issue.project_id}:${issue.source?.capability_id ?? ""}`, new ActionError(issue.code, "后台任务读不出来"), { project_id: issue.project_id });
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id));
}
