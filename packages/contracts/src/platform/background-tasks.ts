import { inputSchemaFor } from "./action-input.js";
import { ACTION_REFERENCE_SCHEMA } from "./action-offers.js";
import { ACTION_SUBJECT_SCHEMA } from "./action-subjects.js";
import type { ActionDefinition, ActionReference, ActionSubject } from "./actions.js";
import { STATE_RING_FAMILIES, type StateRingState } from "./ui-state-rings.js";
import { OPEN_TARGET_SCHEMA, WORK_EVENT_SOURCE_SCHEMA, type OpenTarget } from "./work-events.js";

/**
 * The table of background tasks (specs/work-line §6): the work that is being done or waits on the person behind the events of
 * the line, whoever does it. A provider declares one project-scope, read-only query of these types with `home_aggregate`; the
 * Host asks it in every open project (S-49), and the task panel, the line and the Home's title bar read the same answers. The page
 * knows no provider: what a row is, whom it serves, where it opens and how it is stopped all come from the row.
 */
export const BACKGROUND_TASKS_INPUT_TYPE = /* @version type.molis.background-tasks.query "molis.background-tasks.query.v{version}" */ "molis.background-tasks.query.v1";
export const BACKGROUND_TASKS_OUTPUT_TYPE = /* @version type.molis.background-tasks.collection "molis.background-tasks.collection.v{version}" */ "molis.background-tasks.collection.v1";

/** A sentence in the provider's own words, whole: the page shows it as written. */
export interface BackgroundTaskPhrase { text: string }

/** What the person may do to a task: an action through the gateway with the input the provider wrote, so it is authorized and leaves its diagnostic line like any call. */
export interface BackgroundTaskCommand { role: "stop" | "pause" | "resume"; action: ActionReference; input: Record<string, unknown>; summary: string }

/**
 * One way to answer what a task asks: the provider's own action through the gateway, with the input the provider wrote. `revise`
 * is run with the person's words added to that input as `note`; the others are run with the input as it is.
 */
export interface BackgroundTaskAnswer { role: "approve" | "revise" | "reject"; action: ActionReference; input: Record<string, unknown>; summary: string }

/**
 * What a task that stopped asks the person to decide (specs/work-line §4.4, WLN-10), exactly as its owner holds it. `id` is the
 * owner's own id of this question at this version: an answer names it, reaches that question only, and is refused once the owner
 * no longer asks exactly it (PWA-135). A provider that cannot offer an action for an answer leaves `answers` empty: the person
 * decides where the task opens.
 */
export interface BackgroundTaskDecision {
  id: string;
  /** What is to be decided, in the owner's words. */
  ask: string;
  /** Why it is asked. */
  why?: string;
  /** What agreeing would change, one place a line. */
  changes: Array<{ label: string; value: string }>;
  answers: BackgroundTaskAnswer[];
}

export interface BackgroundTaskExecutor { kind: "assistant" | "character" | "plugin" | "platform"; label: string }

export interface BackgroundTask {
  /** The task itself: what a relation attaches and what opens. */
  subject: ActionSubject;
  title: string;
  /** The state ring's value for where it stands. */
  state: StateRingState;
  /** The step under way, or why it waits. */
  step?: BackgroundTaskPhrase;
  /** Further lines its card lists under the step. */
  details: BackgroundTaskPhrase[];
  /** It waits on the person: the page counts these. */
  waiting: boolean;
  started_at?: string;
  updated_at: string;
  executor: BackgroundTaskExecutor;
  /** The events it is done for; empty when it belongs to none. */
  serves: ActionSubject[];
  scope: "project" | "personal";
  commands: BackgroundTaskCommand[];
  /** What it waits on the person to decide, each answered on its own; empty when it asks nothing that can be listed. */
  decisions: BackgroundTaskDecision[];
  open: OpenTarget | null;
  /**
   * A task no conversation started (a plugin's own, a schedule's, an outside Agent's through MCP) that the scope's Assistant should
   * report on once it ends (specs/work-line contract-design §9; user decision 2026-11-15): when the table shows it ended — a done
   * or failed state — the Assistant runs one round in that scope's main conversation that only reports and advises. That round
   * has no authority to carry the task on: it may read, but it starts no task and runs no command. A row that leaves the table
   * without having been shown ended is not reported, so a provider keeps an ended row a short while for it to be seen (and lists it
   * in an ended state: the panel shows it among what just came back; the Home's list of unfinished work leaves out one that ended
   * well, in `BACKGROUND_TASK_DONE_STATES`, and keeps a failed one). A task a conversation sent out returns to that conversation:
   * one whose provider cannot tell who started it may still say this, and a job a conversation follows as its own is not reported
   * to the Assistant again.
   */
  reports_to?: "assistant";
}

/** The ring states a task ended well in. A row in one stays in the table only while its owner keeps it to be reported (`reports_to`). */
export const BACKGROUND_TASK_DONE_STATES: ReadonlySet<StateRingState> = new Set(["done", "saved", "partial"]);

export interface BackgroundTaskCollection {
  /** Who answers: the workbench surface its tasks open on, with its name and glyph. */
  source: { surface: string; title: string; icon: string };
  tasks: BackgroundTask[];
}

const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 200 };
const instant = { ...id, format: "date-time" };
const phrase = { type: "object", properties: { text: { ...id, maxLength: 200 } }, required: ["text"], additionalProperties: false };
const command = (roles: readonly string[]) => ({ type: "object", properties: { role: { enum: roles }, action: ACTION_REFERENCE_SCHEMA, input: { type: "object" }, summary: { ...text, maxLength: 1000 } },
  required: ["role", "action", "input", "summary"], additionalProperties: false });
export const BACKGROUND_TASK_DECISION_SCHEMA = { type: "object", properties: { id, ask: { ...id, maxLength: 1000 }, why: { ...id, maxLength: 1000 },
  changes: { type: "array", maxItems: 20, items: { type: "object", properties: { label: { ...id, maxLength: 200 }, value: { ...text, maxLength: 2000 } }, required: ["label", "value"], additionalProperties: false } },
  answers: { type: "array", maxItems: 3, items: command(["approve", "revise", "reject"]) } }, required: ["id", "ask", "changes", "answers"], additionalProperties: false };
const BACKGROUND_TASK_STATES: readonly StateRingState[] = STATE_RING_FAMILIES.flatMap(family => [...family.states]);
export const BACKGROUND_TASK_SCHEMA = { type: "object", properties: {
  subject: ACTION_SUBJECT_SCHEMA, title: { ...text, maxLength: 500 }, state: { enum: BACKGROUND_TASK_STATES }, step: phrase, details: { type: "array", maxItems: 8, items: phrase },
  waiting: { type: "boolean" }, started_at: instant, updated_at: instant,
  executor: { type: "object", properties: { kind: { enum: ["assistant", "character", "plugin", "platform"] }, label: { ...id, maxLength: 120 } }, required: ["kind", "label"], additionalProperties: false },
  serves: { type: "array", maxItems: 20, items: ACTION_SUBJECT_SCHEMA }, scope: { enum: ["project", "personal"] },
  commands: { type: "array", maxItems: 50, items: command(["stop", "pause", "resume"]) }, decisions: { type: "array", maxItems: 10, items: BACKGROUND_TASK_DECISION_SCHEMA },
  open: { anyOf: [{ type: "null" }, OPEN_TARGET_SCHEMA] }, reports_to: { enum: ["assistant"] } },
  required: ["subject", "title", "state", "details", "waiting", "updated_at", "executor", "serves", "scope", "commands", "decisions", "open"], additionalProperties: false };
export const BACKGROUND_TASK_COLLECTION_SCHEMA = { type: "object", properties: { source: WORK_EVENT_SOURCE_SCHEMA, tasks: { type: "array", maxItems: 500, items: BACKGROUND_TASK_SCHEMA } }, required: ["source", "tasks"], additionalProperties: false };

export function defineBackgroundTasksAction(capabilityId: string, version: number, kinds: string[], title: string, permissions: string[]): ActionDefinition<Record<string, never>, BackgroundTaskCollection> {
  return { capability_id: capabilityId, version: version, operation: "query", action: { title, description: "读取本项目里正在办、或等着你处理的后台任务，给后台任务面板、事项线与首页标题栏；只读，不会执行任务上的动作。",
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user"], permissions, subject_kinds: kinds, home_aggregate: true,
    input_type: BACKGROUND_TASKS_INPUT_TYPE, output_type: BACKGROUND_TASKS_OUTPUT_TYPE,
    input_schema: inputSchemaFor<Record<string, never>>()({ type: "object", properties: {}, additionalProperties: false }), output_schema: BACKGROUND_TASK_COLLECTION_SCHEMA } };
}

/**
 * Which event a task is done for (specs/work-line §5) is kept by the task's owner. The owner declares these parts on its own
 * actions with `placement_relation` (the relation is `serves`), for the task kinds it names; the mainline service finds them by
 * the declaration, never by a capability id, and calls them as the caller. `list` says what the task serves now and is where the
 * owner refuses a task the caller may not read; `bind` makes it serve exactly the given event; `release` makes it serve nothing;
 * `create` registers the task as an event of its own. An owner that offers no part cannot have its tasks moved.
 */
export const TASK_SERVES_RELATION = "serves";
export type TaskServesRole = "list" | "bind" | "release" | "create";
export interface TaskServesInput { task: ActionSubject }
export interface TaskServesBindInput { task: ActionSubject; event: ActionSubject }
export interface TaskServesResult { serves: ActionSubject[] }
const servesResult = { type: "object", properties: { serves: { type: "array", maxItems: 20, items: ACTION_SUBJECT_SCHEMA } }, required: ["serves"], additionalProperties: false };
const SERVES_WORDS: Record<TaskServesRole, string> = {
  list: "读取一个后台任务此刻为哪些事件办；只读。", bind: "把一个后台任务改为只为给定的事件办；不改任务的授权、预算与数据范围，任务不停、不重做。",
  release: "让一个后台任务不再属于任何事件；任务照常进行。", create: "把一个后台任务登记成线上的一个新事件；任务照常进行。",
};
export function defineTaskServesAction<R extends TaskServesRole>(role: R, capabilityId: string, version: number, kinds: string[], title: string, permissions: string[]):
  ActionDefinition<R extends "bind" ? TaskServesBindInput : TaskServesInput, TaskServesResult> {
  const reads = role === "list";
  const input = role === "bind"
    ? inputSchemaFor<TaskServesBindInput>()({ type: "object", properties: { task: ACTION_SUBJECT_SCHEMA, event: ACTION_SUBJECT_SCHEMA }, required: ["task", "event"], additionalProperties: false } as const)
    : inputSchemaFor<TaskServesInput>()({ type: "object", properties: { task: ACTION_SUBJECT_SCHEMA }, required: ["task"], additionalProperties: false } as const);
  return { capability_id: capabilityId, version, operation: reads ? "query" : "command", action: { title, description: SERVES_WORDS[role], kind: reads ? "query" : "operation", scope: "project",
    effect: reads ? "read" : "write", audiences: ["user", "agent"], permissions, subject_kinds: kinds,
    placement_relation: { relation: TASK_SERVES_RELATION, role, ...(role === "list" ? { target: { kind: "work_event", noun: "事件" } } : {}) },
    input_schema: input, output_schema: servesResult } } as ActionDefinition<R extends "bind" ? TaskServesBindInput : TaskServesInput, TaskServesResult>;
}
