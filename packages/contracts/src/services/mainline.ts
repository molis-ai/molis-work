import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_REFERENCE_SCHEMA, ACTION_SUBJECT_SCHEMA, BACKGROUND_TASK_SCHEMA, WORK_EVENT_SCHEMA, WORK_EVENT_SOURCE_SCHEMA, WORK_EVENT_WINDOW_SCHEMA, defineErrorCodes,
  type ActionDefinition, type ActionReference, type ActionSubject, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskCommand, type WorkEvent, type WorkEventCollection,
  type WorkEventWindow } from "../platform/actions.js";
import type { StateRingState } from "../platform/ui-state-rings.js";

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

/**
 * An event on the line: the registrant's own event, with who registered it, where it sits and what is being done behind it. The
 * name and the state word are the registrant's, given in this read; nothing here is kept between reads (WLN-21).
 */
export interface WorkLineEvent extends WorkEvent {
  /** The same for a registrant's event across reads. */
  id: string;
  source: Required<ActionReference>;
  origin: WorkEventCollection["source"];
  /** Behind now, beside it or ahead of it. An event with a task under way or waiting behind it is beside now, wherever its owner put it. */
  wing: "done" | "now" | "next";
  /** Its place in the wing, 0 nearest to now. */
  rank: number;
  /** What the line shows: the owner's state, unless a task behind it is being done or waits on the person (WLN-38). */
  line_state?: StateRingState;
  /** It, or a task behind it, waits on the person. */
  waiting: boolean;
  /**
   * The tasks that say they serve it, from the task table read in the same call: how many, and which. No progress is copied. Only
   * what the caller itself can read is counted: a task provider answers the person alone (S-49), so another audience gets none.
   */
  tasks: { running: number; waiting: number; refs: ActionSubject[] };
}
export interface WorkLineReadResult { events: WorkLineEvent[]; issues: MainlineIssue[] }

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

const count = { type: "integer", minimum: 0 } as const;
export const WORK_LINE_EVENT_SCHEMA = { ...WORK_EVENT_SCHEMA, properties: { ...WORK_EVENT_SCHEMA.properties, id: { type: "string", minLength: 1, maxLength: 1000 }, source, origin: WORK_EVENT_SOURCE_SCHEMA,
  wing: { enum: ["done", "now", "next"] }, rank: count, line_state: WORK_EVENT_SCHEMA.properties.state, waiting: { type: "boolean" },
  tasks: { type: "object", properties: { running: count, waiting: count, refs: { type: "array", items: ACTION_SUBJECT_SCHEMA } }, required: ["running", "waiting", "refs"], additionalProperties: false } },
  required: [...WORK_EVENT_SCHEMA.required, "id", "source", "origin", "wing", "rank", "waiting", "tasks"] };

const metadata = { scope: "project" as const, scheduling: "concurrent" as const, subject_kinds: [] };
export const mainlineActions = {
  /**
   * The line of one project: every registrant asked once in parallel, the task table read once in the same call, each event placed
   * and ordered. The Assistant and an outside Agent read this same answer; there is no second, textual form of it.
   */
  line: { capability_id: "mainline.line.read", version: /* @version action.mainline.line.read */ 1, operation: "query", action: { ...metadata,
    title: "事项线", description: "从这个项目里已授权的登记方读取当前窗口里的事件，标出每件在线上的位置、先后和背后在办或等你的任务（只算调用方自己读得到的任务）；只读，不会执行事件上的动作。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "mcp"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<WorkEventWindow>()(WORK_EVENT_WINDOW_SCHEMA),
    output_schema: { type: "object", properties: { events: { type: "array", items: WORK_LINE_EVENT_SCHEMA }, issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["events", "issues"], additionalProperties: false } } } as ActionDefinition<WorkEventWindow, WorkLineReadResult>,
  /** The task panel's read: every provider of the table in this project, asked once each in parallel through the caller's client. */
  tasks: { capability_id: "background.tasks.read", version: /* @version action.background.tasks.read */ 1, operation: "query", action: { ...metadata,
    title: "后台任务", description: "从这个项目里已授权的提供方读取正在办、或等着你处理的后台任务，保留各自的对象与提供方身份；只读，不会执行任务上的动作。",
    // The providers answer the person alone (S-49), so only the person has anything to read here.
    kind: "query", effect: "read", audiences: ["user"], permissions: [MAINLINE_READ_PERMISSION],
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
