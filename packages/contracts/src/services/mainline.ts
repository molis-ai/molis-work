import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_REFERENCE_SCHEMA, ACTION_SUBJECT_SCHEMA, BACKGROUND_TASK_SCHEMA, WORK_EVENT_SOURCE_SCHEMA, defineErrorCodes,
  type ActionDefinition, type ActionReference, type ActionSubject, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskCommand } from "../platform/actions.js";

/**
 * The mainline service (specs/work-line §5–§6, `horizontal/mainline`): system actions that read, for one project, what its
 * registrants and task providers say right now, and act on a row the way the row itself says. It keeps nothing: every call asks
 * the providers again through the caller's own client, so what a caller cannot read is not in its answer.
 */
export const MAINLINE_PROVIDER_ID = "system.mainline";
export const MAINLINE_READ_PERMISSION = "mainline:read";
/** Acting on a task: the action a command names is still authorized on its own when it is called. */
export const MAINLINE_CONTROL_PERMISSION = "mainline:control";

/** A task as a reader gets it: the provider's own row, with the provider it came from. */
export interface BackgroundTaskRow extends BackgroundTask {
  /** The same for a provider's task across reads. */
  id: string;
  /** The provider that answered; each command's action is its own. */
  source: Required<ActionReference>;
  origin: BackgroundTaskCollection["source"];
}

/** A provider that could not be read, by its title and its code only: what a provider says in its error stays out (S-12). */
export interface MainlineIssue { source: Required<ActionReference>; title: string; code: string }

export interface BackgroundTasksReadResult { tasks: BackgroundTaskRow[]; issues: MainlineIssue[] }

/** One command of one row, as the reader was given it. It is run only if the provider, asked again, still offers exactly this. */
export interface BackgroundTaskCommandRequest { source: Required<ActionReference>; subject: ActionSubject; command: BackgroundTaskCommand }
export interface BackgroundTaskCommandResult { role: BackgroundTaskCommand["role"]; output: unknown }

/** The service's refusals. */
export const mainlineErrors = defineErrorCodes("mainline", {
  /** The provider a row came from no longer answers this caller. */
  source_changed: "conflict",
  /** The task is gone, or no longer offers the command as it was shown. */
  task_changed: "conflict",
});

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const source = { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] } as const;
export const BACKGROUND_TASK_ROW_SCHEMA = { ...BACKGROUND_TASK_SCHEMA, properties: { ...BACKGROUND_TASK_SCHEMA.properties, id: { type: "string", minLength: 1, maxLength: 1000 }, source, origin: WORK_EVENT_SOURCE_SCHEMA },
  required: [...BACKGROUND_TASK_SCHEMA.required, "id", "source", "origin"] };
const ISSUE_SCHEMA = { type: "object", properties: { source, title: { ...id, maxLength: 500 }, code: id }, required: ["source", "title", "code"], additionalProperties: false } as const;
const COMMAND_SCHEMA = { type: "object", properties: { role: { enum: ["stop", "pause", "resume"] }, action: ACTION_REFERENCE_SCHEMA, input: { type: "object" }, summary: { type: "string", maxLength: 1000 } },
  required: ["role", "action", "input", "summary"], additionalProperties: false } as const;

const metadata = { scope: "project" as const, scheduling: "concurrent" as const, subject_kinds: [] };
export const mainlineActions = {
  /** The task panel's read: every provider of the table in this project, asked once each in parallel through the caller's client. */
  tasks: { capability_id: "background.tasks.read", version: /* @version action.background.tasks.read */ 1, operation: "query", action: { ...metadata,
    title: "后台任务", description: "从这个项目里已授权的提供方读取正在办、或等着你处理的后台任务，保留各自的对象与提供方身份；只读，不会执行任务上的动作。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "mcp"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<Record<string, never>>()({ type: "object", properties: {}, additionalProperties: false }),
    output_schema: { type: "object", properties: { tasks: { type: "array", items: BACKGROUND_TASK_ROW_SCHEMA }, issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["tasks", "issues"], additionalProperties: false } } } as ActionDefinition<Record<string, never>, BackgroundTasksReadResult>,
  /**
   * Stop, pause or resume a task: the provider is asked again, and the command is run only if the task still offers exactly it.
   * The command's action is then called as the caller, so its own audience, permissions and diagnostics apply; only the person may ask.
   */
  command: { capability_id: "background.tasks.command", version: /* @version action.background.tasks.command */ 1, operation: "command", action: { ...metadata,
    title: "对后台任务执行命令", description: "重新读取任务的提供方，确认这条停止、暂停或继续的命令仍由它给出后，以本人身份调用它写明的动作。",
    kind: "operation", effect: "write", audiences: ["user"], permissions: [MAINLINE_CONTROL_PERMISSION],
    input_schema: inputSchemaFor<BackgroundTaskCommandRequest>()({ type: "object", properties: { source, subject: ACTION_SUBJECT_SCHEMA, command: COMMAND_SCHEMA }, required: ["source", "subject", "command"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { role: { enum: ["stop", "pause", "resume"] }, output: {} }, required: ["role", "output"], additionalProperties: false } } } as ActionDefinition<BackgroundTaskCommandRequest, BackgroundTaskCommandResult>,
};
