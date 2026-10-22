import type { ActionDefinition } from "./actions.js";

/**
 * The background work a plugin still has running or waiting on the person, as the Home's title bar lists it across projects
 * (PG-043). A plugin declares one project-scope, read-only query of this type with `home_aggregate`; the Host asks it in every open
 * project (S-49) and the page shows what the answers say. The page knows no plugin: where a row opens, what it reads and where its
 * commands stop all come from the row.
 */
export const HOME_BACKGROUND_TASKS_INPUT_TYPE = "molis.home-background-tasks.query.v1";
export const HOME_BACKGROUND_TASKS_OUTPUT_TYPE = "molis.home-background-tasks.collection.v1";

/** One phrase of what a row says under its title. `text` is a sentence the page may have a translation for; `{n}` in it is `count`. */
export interface HomeBackgroundTaskPhrase { text: string; count?: number }

/** A command the task left running. `stop_path` is the plugin's own route that stops it, relative to the plugin (`/sessions/s1/background/t1/stop`); the Host turns it into the page's URL. */
export interface HomeBackgroundTaskCommand { task_id: string; summary: string; stop_path: string }

export interface HomeBackgroundTask {
  /** The item the Home opens on the plugin's surface. */
  id: string;
  title: string;
  /** The plugin's own name for the standing; the page only styles by it. */
  state: string;
  updated_at: string;
  /** It waits on the person: the page counts these and marks the button. */
  waiting: boolean;
  standing: HomeBackgroundTaskPhrase[];
  commands: HomeBackgroundTaskCommand[];
}

export interface HomeBackgroundTaskCollection {
  /** The workbench surface the tasks open on. */
  source: { surface: string };
  tasks: HomeBackgroundTask[];
}

const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 200 };
const token = { ...id, pattern: "^[a-zA-Z0-9_-]+$" };
const HOME_BACKGROUND_TASKS_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false };
const HOME_BACKGROUND_TASK_SCHEMA = { type: "object", properties: {
  id, title: { ...text, maxLength: 500 }, state: token, updated_at: { ...id, format: "date-time" }, waiting: { type: "boolean" },
  standing: { type: "array", maxItems: 8, items: { type: "object", properties: { text: { ...id, maxLength: 200 }, count: { type: "integer", minimum: 0 } }, required: ["text"], additionalProperties: false } },
  commands: { type: "array", maxItems: 50, items: { type: "object", properties: { task_id: id, summary: { ...text, maxLength: 1000 }, stop_path: { ...id, maxLength: 1000 } }, required: ["task_id", "summary", "stop_path"], additionalProperties: false } } },
  required: ["id", "title", "state", "updated_at", "waiting", "standing", "commands"], additionalProperties: false };
const HOME_BACKGROUND_TASKS_SCHEMA = { type: "object", properties: { source: { type: "object", properties: { surface: token }, required: ["surface"], additionalProperties: false },
  tasks: { type: "array", maxItems: 500, items: HOME_BACKGROUND_TASK_SCHEMA } }, required: ["source", "tasks"], additionalProperties: false };

export function defineHomeBackgroundTasksAction(capabilityId: string, title: string, permissions: string[]): ActionDefinition<Record<string, never>, HomeBackgroundTaskCollection> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "读取本项目里还在跑、或等着你处理的后台任务，给首页标题栏的后台任务列表；只读，不会执行任务上的动作。",
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user"], permissions, subject_kinds: [], home_aggregate: true,
    input_type: HOME_BACKGROUND_TASKS_INPUT_TYPE, output_type: HOME_BACKGROUND_TASKS_OUTPUT_TYPE,
    input_schema: HOME_BACKGROUND_TASKS_INPUT_SCHEMA, output_schema: HOME_BACKGROUND_TASKS_SCHEMA } };
}
