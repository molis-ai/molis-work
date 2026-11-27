import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_REFERENCE_SCHEMA, ACTION_SUBJECT_SCHEMA, BACKGROUND_TASK_DECISION_SCHEMA, BACKGROUND_TASK_SCHEMA, OPEN_TARGET_SCHEMA, WORK_EVENT_SCHEMA, WORK_EVENT_SOURCE_SCHEMA, WORK_EVENT_WINDOW_SCHEMA, defineErrorCodes,
  type ActionDefinition, type ActionReference, type ActionSubject, type BackgroundTask, type BackgroundTaskAnswer, type BackgroundTaskCollection, type BackgroundTaskCommand, type BackgroundTaskDecision, type OpenTarget, type WorkEvent, type WorkEventCollection,
  type WorkEventWindow } from "../platform/actions.js";
import { REVIEW_REFERENCE_SCHEMA, type ReviewReference } from "../platform/reviews.js";
import type { StateRingState } from "../platform/ui-state-rings.js";
import { defineSubjectContextAction } from "../platform/action-subjects.js";
import { PLACEMENT_RELATION_LIMITS, definePlacementRelationAction } from "../platform/placement.js";
import { WORK_ITEM_LIMITS, WORK_ITEM_NEXT_STEP_SCHEMA, type WorkItemNextStep } from "../platform/work-items.js";

/**
 * The mainline service (specs/work-line §5–§6, `horizontal/mainline`): system actions that read, for one project, what its
 * registrants and task providers say right now, and act on a row the way the row itself says. It keeps nothing: every call asks
 * the providers again through the caller's own client, so what a caller cannot read is not in its answer.
 */
export const MAINLINE_PROVIDER_ID = "system.mainline";
export const MAINLINE_READ_PERMISSION = "mainline:read";
/** Acting on a task: the action a command names is still authorized on its own when it is called. */
export const MAINLINE_CONTROL_PERMISSION = "mainline:control";
/** Saying which event a task is done for: the owner's own part is still authorized on its own when it is called. */
export const MAINLINE_PLACE_PERMISSION = "mainline:place";
/** Arranging the person's own mainline: work items, groups, the current item and what each item holds. */
export const MAINLINE_ARRANGE_PERMISSION = "mainline:arrange";

/** The Host's display of a pending Agent review. Its buttons answer the Host's queue directly. */
export interface BackgroundTaskHeldReview extends Omit<BackgroundTaskDecision, "reference" | "answers"> {
  reference: ReviewReference;
  review_html: string;
  answers: Array<{ role: "approve" | "reject" }>;
}

/** A task as a reader gets it, with its source and any reviews resolved by the Host. */
export interface BackgroundTaskRow extends Omit<BackgroundTask, "decisions" | "held_reviews"> {
  decisions: Array<BackgroundTaskDecision | BackgroundTaskHeldReview>;
  /** The same for a provider's task across reads. */
  id: string;
  /** The provider that answered; each command's action is its own. */
  source: Required<ActionReference>;
  origin: BackgroundTaskCollection["source"];
}

/** A provider that could not be read, by its title and its code only: what a provider says in its error stays out (S-12). */
export interface MainlineIssue { source: Required<ActionReference>; title: string; code: string }

export interface BackgroundTasksReadResult { tasks: BackgroundTaskRow[]; issues: MainlineIssue[] }

/** An unfinished task on Home, with the project whose provider owns it. */
export interface HomeBackgroundTaskRow extends BackgroundTaskRow {
  project_id: string; project_name: string;
}

/** Every partition's tasks, read from the overview, and the sources that could not be read; empty tasks alone does not mean no work. */
export interface HomeBackgroundTasksReadResult {
  readonly updating?: boolean;
  tasks: HomeBackgroundTaskRow[];
  issues: Array<{ project_id: string; source: Required<ActionReference> | null; code: string }>;
}

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
  /** On a line read for one work item: the next step its source gives, shown first ahead of now. Its `source` is the owner's `next` action. */
  suggestion?: WorkItemNextStep;
}
/** The line, with the task table its events were placed with (the caller's own rows and the table's own issues: one read for both). */
export interface WorkLineReadResult { events: WorkLineEvent[]; table: BackgroundTasksReadResult; issues: MainlineIssue[] }

/** One command of one row, as the reader was given it. It is run only if the provider, asked again, still offers exactly this. */
export interface BackgroundTaskCommandRequest { source: Required<ActionReference>; subject: ActionSubject; command: BackgroundTaskCommand }
export interface BackgroundTaskCommandResult { role: BackgroundTaskCommand["role"]; output: unknown }

/**
 * An answer to one thing a task asks (specs/work-line §4.4, WLN-10): the decision by the id the row gave it, and which of its
 * answers. It is run only if the provider, asked again, still asks exactly that and still offers that answer, so an answer never
 * reaches another question or a later version of this one (PWA-135). `note` is the person's words for `revise`, and is required for it.
 */
export interface BackgroundTaskDecideRequest {
  source: Required<ActionReference>; subject: ActionSubject; decision: string; role: BackgroundTaskAnswer["role"]; note?: string;
  /** Required for a held Agent review, using the version the person saw on the card. */
  review_version?: string;
}
export interface BackgroundTaskDecideResult { role: BackgroundTaskAnswer["role"]; output: unknown }

/**
 * One thing that waits on the person in this project (specs/work-line §6, WLN-39): an event of the line that waits, by itself or
 * because a task behind it does, or a waiting task that serves no event of the line. Each object is counted once. The number at
 * the head of the line, the mark on an event and the task panel read this one answer.
 */
export interface WaitingItem {
  /** The event, or the task when it serves no event of the line. */
  subject: ActionSubject;
  /** `task`: a task waits (behind the event, or on its own); `event`: the event's owner says it waits. */
  source: "event" | "task";
  /** The line's id of the event, when the item is an event. */
  event_id?: string;
  /** The task that waits, when one does. */
  task?: ActionSubject;
  since: string;
  open: OpenTarget | null;
}
export interface WaitingReadResult { items: WaitingItem[]; counts: { total: number }; issues: MainlineIssue[] }

/**
 * Where a task goes (specs/work-line §5): onto an event of the line, onto a new event of its own, or to no event. The first
 * placement and a later change are the same call. `window` is the line the caller is looking at: an event is accepted only if a
 * registrant the caller can read reports it there.
 */
export interface TaskPlaceRequest {
  task: ActionSubject;
  to?: { kind: "event" | "new_event" | "none"; subject?: ActionSubject };
  window?: WorkEventWindow;
  /**
   * Which work item it is in, a second dimension beside `to` (contract-design §5): into one item, which takes it out of every other,
   * or into none (`item_id` only with `item`). Only the `holds` relation changes; the task goes on as it was. At least one of `to` and
   * `item` is given.
   */
  item?: { kind: "item" | "none"; item_id?: string };
}
export interface TaskPlaceResult { task: ActionSubject; serves: ActionSubject[]; items?: ActionSubject[] }

/** The service's refusals. */
/** `objects.open@1`: where an object opens on the workbench, as its owner's reader says to this caller; `target` is null when it has no page of its own. */
export interface ObjectOpenRequest { subject: ActionSubject }
export interface ObjectOpenResult { subject: ActionSubject; title: string; target: OpenTarget | null }

export const mainlineErrors = defineErrorCodes("mainline", {
  /** The provider a row came from no longer answers this caller. */
  source_changed: "conflict",
  /** The task is gone, or no longer offers the command as it was shown. */
  task_changed: "conflict",
  /** The task no longer asks this, or no longer offers this answer to it. */
  decision_changed: "conflict",
  /** 「改一下」 without the words to change it by, or words with another answer. */
  note_invalid: "invalid",
  /** The task's owner keeps no relation to events for this kind of task, or does not offer this part of it. */
  task_not_placeable: "invalid",
  /** Two providers say they keep the relation for the same kind of task: neither is called. */
  relation_ambiguous: "conflict",
  /** No registrant the caller can read reports this event in the window. */
  event_unreadable: "not_found",
  /** The owner's answer is not what the relation's parts return, or does not say what was asked of it. */
  owner_answer_invalid: "upstream",
  /** The mainline was arranged elsewhere since it was read: the current one comes with the refusal. */
  conflict: "conflict",
  /** More than a mainline may hold (names, groups, open items, what one item holds). */
  limit: "too_large",
  /** No such work item on this person's mainline in this project. */
  item_missing: "not_found",
  /** The caller cannot read the object it would hold or make into an item. */
  subject_unreadable: "not_found",
  /** No source the caller can reach declares this kind, or it does not offer the part asked of it. */
  source_unavailable: "unavailable",
});

/**
 * A work item (specs/work-mainline/contract-design.md §2): only a container. A light item has its own `name`; one an object became has
 * `source` and reads its name, state and whether it is done from that object's owner. There is no state flow, assignee, due date or
 * comment: done is where the person put it (`completed`), not a state. As a subject it is `{ kind: "work_item", id: item_id }`.
 */
export const WORK_ITEM_KIND = "work_item";
export interface WorkItem { item_id: string; name?: string; source?: ActionSubject; created_at: string }
export type MainlineGroupDefault = "now" | "next" | "waiting";
export interface MainlineGroup {
  group_id: string;
  /** One of the three groups a mainline starts with; the page names it by this key, never by stored words. A renamed group has `name`. */
  default?: MainlineGroupDefault;
  name?: string;
  /** In order, pinned first. */
  items: Array<{ item_id: string; pinned: boolean }>;
}
/** One person's mainline in one project, read from the context of the call. */
export interface Mainline {
  /** The arrangement's write credential: every arranging write gives the one it read, and one arranged elsewhere since is refused (`conflict`). */
  revision: string;
  /** Every item the groups and `completed` name. */
  items: WorkItem[];
  groups: MainlineGroup[];
  /** Put away as done, newest first: at most the latest 100; `completed_total` is how many there are. */
  completed: string[];
  completed_total: number;
  current: string | null;
  /** Switched to lately, newest first, at most 3, none completed. */
  recent: string[];
}
/** A kind the caller's directory can make items of, by its presentation declaration. */
export interface MainlineItemSource { kind: string; owner: string; create: boolean; next: boolean }
/** How many things wait on the person and are under way, per item and per group, from one line read. */
export interface MainlineCounts {
  /** A task has one label only when its owner declares its item or exactly one open item holds it. */
  task_items?: Array<{ subject: ActionSubject; item_id: string }>;
  items: Record<string, { waiting: number; running: number }>;
  groups: Record<string, { waiting: number; running: number }>;
}
export const MAINLINE_LIMITS = { name: WORK_ITEM_LIMITS.name, groups: 20, open_items: 500, held: PLACEMENT_RELATION_LIMITS.targets, completed_read: 100, recent: 3 } as const;

export interface MainlineReadRequest { counts?: boolean }
export interface MainlineReadResult { mainline: Mainline; sources: MainlineItemSource[]; counts?: MainlineCounts }
export interface MainlineItemCreateRequest {
  /** A light item named so. */
  name?: string;
  /** An object made into an item; read first as the caller. */
  from?: ActionSubject;
  /** 「建成 xx」: the source makes the object, then it becomes an item. */
  create_as?: { kind: string; name: string };
  group_id?: string;
  /**
   * The caller's own id for this request, sent again when it retries one that was cancelled or conflicted: a 「建成」 asked again under it
   * gets the same object from its source. Without it the call's id stands in.
   */
  request_id?: string;
}
export interface MainlineItemResult { mainline: Mainline; item: WorkItem }
export interface MainlineResult { mainline: Mainline }
export interface MainlineItemConvertRequest { expected_revision: string; item_id: string; kind: string; /** As `MainlineItemCreateRequest.request_id`. */ request_id?: string }
export interface MainlineItemRenameRequest { expected_revision: string; item_id: string; name: string }
export interface MainlineItemMoveRequest { expected_revision: string; item_id: string; group_id: string; index: number; pinned?: boolean }
export interface MainlineItemCompleteRequest { expected_revision: string; item_id: string; completed: boolean }
export interface MainlineItemRemoveRequest { expected_revision: string; item_id: string }
export type MainlineGroupEditRequest = { expected_revision: string } & (
  | { op: "add"; name: string; index?: number }
  | { op: "rename"; group_id: string; name: string }
  | { op: "delete"; group_id: string }
  | { op: "move"; group_id: string; index: number });
export interface MainlineSwitchRequest { item_id: string | null }
export interface MainlineContentsRequest { item_id: string }
/** 「这件事的东西」: what was put in, and what the source's own relation names; references only. */
export interface MainlineContentsResult { held: ActionSubject[]; related: Array<{ source: Required<ActionReference>; subjects: ActionSubject[] }>; issues: MainlineIssue[] }

/** The relation 「装进事项」 the mainline service keeps, declared with placement's relation shape. */
export const MAINLINE_HOLDS_RELATION = "holds";

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const source = { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] } as const;
const { held_reviews: _heldReviews, ...taskRowProperties } = BACKGROUND_TASK_SCHEMA.properties;
const heldReview = { ...BACKGROUND_TASK_DECISION_SCHEMA, properties: { ...BACKGROUND_TASK_DECISION_SCHEMA.properties,
  reference: REVIEW_REFERENCE_SCHEMA, review_html: { type: "string", minLength: 1 },
  answers: { type: "array", maxItems: 2, minItems: 1, items: { type: "object", properties: { role: { enum: ["approve", "reject"] } }, required: ["role"], additionalProperties: false } },
}, required: [...BACKGROUND_TASK_DECISION_SCHEMA.required, "reference", "review_html"] };
export const BACKGROUND_TASK_ROW_SCHEMA = { ...BACKGROUND_TASK_SCHEMA, properties: { ...taskRowProperties,
  decisions: { type: "array", maxItems: 20, items: { anyOf: [BACKGROUND_TASK_DECISION_SCHEMA, heldReview] } },
  id: { type: "string", minLength: 1, maxLength: 1000 }, source, origin: WORK_EVENT_SOURCE_SCHEMA },
  required: [...BACKGROUND_TASK_SCHEMA.required, "id", "source", "origin"] };
const ISSUE_SCHEMA = { type: "object", properties: { source, title: { ...id, maxLength: 500 }, code: id }, required: ["source", "title", "code"], additionalProperties: false } as const;
const COMMAND_SCHEMA = { type: "object", properties: { role: { enum: ["stop", "pause", "resume"] }, action: ACTION_REFERENCE_SCHEMA, input: { type: "object" }, summary: { type: "string", maxLength: 1000 } },
  required: ["role", "action", "input", "summary"], additionalProperties: false } as const;

const count = { type: "integer", minimum: 0 } as const;
export const WORK_LINE_EVENT_SCHEMA = { ...WORK_EVENT_SCHEMA, properties: { ...WORK_EVENT_SCHEMA.properties, id: { type: "string", minLength: 1, maxLength: 1000 }, source, origin: WORK_EVENT_SOURCE_SCHEMA,
  wing: { enum: ["done", "now", "next"] }, rank: count, line_state: WORK_EVENT_SCHEMA.properties.state, waiting: { type: "boolean" }, suggestion: WORK_ITEM_NEXT_STEP_SCHEMA,
  tasks: { type: "object", properties: { running: count, waiting: count, refs: { type: "array", items: ACTION_SUBJECT_SCHEMA } }, required: ["running", "waiting", "refs"], additionalProperties: false } },
  required: [...WORK_EVENT_SCHEMA.required, "id", "source", "origin", "wing", "rank", "waiting", "tasks"] };

const ITEM_ID_SCHEMA = { type: "string", minLength: 1, maxLength: 200 } as const;
/** The line of one project, or with `item` only what is in that work item (contract-design §5). */
export type WorkLineReadRequest = WorkEventWindow & { item?: string };
export interface WorkLineContainsRequest { subject: ActionSubject; window: WorkEventWindow }
const WORK_LINE_READ_SCHEMA = { ...WORK_EVENT_WINDOW_SCHEMA, properties: { ...WORK_EVENT_WINDOW_SCHEMA.properties, item: ITEM_ID_SCHEMA } } as const;

const metadata = { scope: "project" as const, scheduling: "concurrent" as const, subject_kinds: [] };
const TASK_TABLE_SCHEMA = { type: "object", properties: { tasks: { type: "array", items: BACKGROUND_TASK_ROW_SCHEMA }, issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["tasks", "issues"], additionalProperties: false } as const;

export const mainlineActions = {
  /**
   * The line of one project: every registrant asked once in parallel, the task table read once in the same call, each event placed
   * and ordered; the task table comes with it, so a page that shows both reads once. The same shape serves an Agent, while only the
   * person's protected page may get original held review proposals in the table.
   */
  line: { capability_id: "mainline.line.read", version: /* @version action.mainline.line.read */ 1, operation: "query", action: { ...metadata,
    title: "事项线", description: "从这个项目里已授权的登记方读取当前窗口里的事件，标出每件在线上的位置、先后和背后在办或等你的任务（只算调用方自己读得到的任务）；只读，不会执行事件上的动作。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "mcp"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<WorkLineReadRequest>()(WORK_LINE_READ_SCHEMA),
    output_schema: { type: "object", properties: { events: { type: "array", items: WORK_LINE_EVENT_SCHEMA }, table: TASK_TABLE_SCHEMA, issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["events", "table", "issues"], additionalProperties: false } } } as ActionDefinition<WorkLineReadRequest, WorkLineReadResult>,
  contains: { capability_id: "mainline.line.contains", version: /* @version action.mainline.line.contains */ 1, operation: "query", action: { ...metadata,
    title: "核对事项线事件", description: "核对这个对象是否仍在本人当前时间范围内可读的事项线上。",
    kind: "query", effect: "read", audiences: ["user"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<WorkLineContainsRequest>()({ type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, window: WORK_EVENT_WINDOW_SCHEMA },
      required: ["subject", "window"], additionalProperties: false }),
    output_schema: { type: "object", properties: { on_line: { type: "boolean" } }, required: ["on_line"], additionalProperties: false } } } as ActionDefinition<WorkLineContainsRequest, { on_line: boolean }>,
  /**
   * What waits on the person, merged at read time from the line and the task table of the same call, each object once. What the
   * Attention entries and missed runs say reaches it through their registrants and task providers, not through a read of its own.
   */
  waiting: { capability_id: "attention.waiting.read", version: /* @version action.attention.waiting.read */ 1, operation: "query", action: { ...metadata,
    title: "等你处理的", description: "读取这个项目里此刻等你处理的事件与后台任务，同一个对象只算一次，供线头的数字、事件上的标记与后台任务面板共用；只读。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "mcp"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<WorkEventWindow>()(WORK_EVENT_WINDOW_SCHEMA),
    output_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, source: { enum: ["event", "task"] },
      event_id: { type: "string", minLength: 1, maxLength: 1000 }, task: ACTION_SUBJECT_SCHEMA, since: { type: "string", minLength: 1, maxLength: 64 }, open: { anyOf: [{ type: "null" }, OPEN_TARGET_SCHEMA] } },
      required: ["subject", "source", "since", "open"], additionalProperties: false } }, counts: { type: "object", properties: { total: count }, required: ["total"], additionalProperties: false },
      issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["items", "counts", "issues"], additionalProperties: false } } } as ActionDefinition<WorkEventWindow, WaitingReadResult>,
  /**
   * Placement and its later change: the owner of the task is found by its `serves` declaration and asked as the caller. Nothing of
   * the task's authority, budget or data scope is touched, and the service keeps no record of its own.
   */
  place: { capability_id: "mainline.place", version: /* @version action.mainline.place */ 1, operation: "command", action: { ...metadata,
    title: "安放后台任务", description: "改变后台任务所服务的事件（to）或所属事项（item），至少传其中一项；写动作，只改归属关联，任务继续运行且授权、预算与数据范围不变。调整事项归属需同时具备 mainline:arrange；事件不可读、事项不存在或任务类型不支持安放时拒绝。",
    kind: "operation", effect: "write", audiences: ["user", "agent", "mcp"], permissions: [MAINLINE_PLACE_PERMISSION],
    input_schema: inputSchemaFor<TaskPlaceRequest>()({ type: "object", properties: { task: ACTION_SUBJECT_SCHEMA,
      to: { type: "object", properties: { kind: { enum: ["event", "new_event", "none"] }, subject: ACTION_SUBJECT_SCHEMA }, required: ["kind"], additionalProperties: false }, window: WORK_EVENT_WINDOW_SCHEMA,
      item: { type: "object", properties: { kind: { enum: ["item", "none"] }, item_id: ITEM_ID_SCHEMA }, required: ["kind"], additionalProperties: false } },
      required: ["task"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { task: ACTION_SUBJECT_SCHEMA, serves: { type: "array", maxItems: 20, items: ACTION_SUBJECT_SCHEMA }, items: { type: "array", maxItems: 20, items: ACTION_SUBJECT_SCHEMA } }, required: ["task", "serves"], additionalProperties: false } } } as ActionDefinition<TaskPlaceRequest, TaskPlaceResult>,
  /** The task panel's read: every provider of the table in this project, asked once each in parallel through the caller's client. */
  tasks: { capability_id: "background.tasks.read", version: /* @version action.background.tasks.read */ 1, operation: "query", action: { ...metadata,
    title: "后台任务", description: "从这个项目里已授权的提供方读取正在办、或等着你处理的后台任务，保留各自的对象与提供方身份；只读，不会执行任务上的动作。",
    // The providers answer the person alone (S-49), so only the person has anything to read here.
    kind: "query", effect: "read", audiences: ["user"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<Record<string, never>>()({ type: "object", properties: {}, additionalProperties: false }),
    output_schema: TASK_TABLE_SCHEMA } } as ActionDefinition<Record<string, never>, BackgroundTasksReadResult>,
  /**
   * Stop, pause or resume a task: the provider is asked again, and the command is run only if the task still offers exactly it.
   * The command's action is then called as the caller, so its own audience, permissions and diagnostics apply; only the person may ask.
   */
  command: { capability_id: "background.tasks.command", version: /* @version action.background.tasks.command */ 1, operation: "command", action: { ...metadata,
    title: "对后台任务执行命令", description: "重新读取任务的提供方，确认这条停止、暂停或继续的命令仍由它给出后，以本人身份调用它写明的动作。",
    kind: "operation", effect: "write", audiences: ["user"], permissions: [MAINLINE_CONTROL_PERMISSION],
    input_schema: inputSchemaFor<BackgroundTaskCommandRequest>()({ type: "object", properties: { source, subject: ACTION_SUBJECT_SCHEMA, command: COMMAND_SCHEMA }, required: ["source", "subject", "command"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { role: { enum: ["stop", "pause", "resume"] }, output: {} }, required: ["role", "output"], additionalProperties: false } } } as ActionDefinition<BackgroundTaskCommandRequest, BackgroundTaskCommandResult>,
  /**
   * Answer what a task asks: the provider is asked again, and the answer is run only if the task still asks exactly this and still
   * offers it. The answer's action is the provider's own and is called as the caller; only the person may ask.
   */
  /**
   * Where an object opens (specs/work-line/contract-design.md §7): asked of the reader its owner declared, as the caller, so an
   * object the caller cannot read gives no place. A notification, a reminder, a search hit, a result named on a card and an
   * address written from a reference (`objectLink`) all open through it.
   */
  open: { capability_id: "objects.open", version: /* @version action.objects.open */ 1, operation: "query", action: { ...metadata,
    title: "对象打开到哪里", description: "按对象主人声明的读取器，读出这个对象在工作台上打开到哪个位置；调用方读不到的对象不给位置，对象没有自己的页面时位置为空；只读。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "mcp"], permissions: [MAINLINE_READ_PERMISSION],
    input_schema: inputSchemaFor<ObjectOpenRequest>()({ type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, title: { type: "string", minLength: 1, maxLength: 1000 }, target: { anyOf: [{ type: "null" }, OPEN_TARGET_SCHEMA] } },
      required: ["subject", "title", "target"], additionalProperties: false } } } as ActionDefinition<ObjectOpenRequest, ObjectOpenResult>,
  decide: { capability_id: "background.tasks.decide", version: /* @version action.background.tasks.decide */ 1, operation: "command", action: { ...metadata,
    title: "回答后台任务要你定的事", description: "重新读取任务，确认它还在等这项决定。插件自己的问题交给它的动作，Agent 待审操作由本人按卡上版本交给平台审批。",
    kind: "operation", effect: "write", audiences: ["user"], permissions: [MAINLINE_CONTROL_PERMISSION],
    input_schema: inputSchemaFor<BackgroundTaskDecideRequest>()({ type: "object", properties: { source, subject: ACTION_SUBJECT_SCHEMA, decision: id, role: { enum: ["approve", "revise", "reject"] },
      note: { type: "string", minLength: 1, maxLength: 2000 }, review_version: { ...id, maxLength: 240 } }, required: ["source", "subject", "decision", "role"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { role: { enum: ["approve", "revise", "reject"] }, output: {} }, required: ["role", "output"], additionalProperties: false } } } as ActionDefinition<BackgroundTaskDecideRequest, BackgroundTaskDecideResult>,
};

const itemName = { type: "string", minLength: 1, maxLength: MAINLINE_LIMITS.name } as const;
const revision = { type: "string", minLength: 1, maxLength: 200 } as const;
const WORK_ITEM_SCHEMA = { type: "object", properties: { item_id: ITEM_ID_SCHEMA, name: itemName, source: ACTION_SUBJECT_SCHEMA, created_at: { type: "string", minLength: 1, maxLength: 64 } },
  required: ["item_id", "created_at"], additionalProperties: false } as const;
const GROUP_SCHEMA = { type: "object", properties: { group_id: ITEM_ID_SCHEMA, default: { enum: ["now", "next", "waiting"] }, name: itemName,
  items: { type: "array", maxItems: MAINLINE_LIMITS.open_items, items: { type: "object", properties: { item_id: ITEM_ID_SCHEMA, pinned: { type: "boolean" } }, required: ["item_id", "pinned"], additionalProperties: false } } },
  required: ["group_id", "items"], additionalProperties: false } as const;
export const MAINLINE_SCHEMA = { type: "object", properties: { revision, items: { type: "array", items: WORK_ITEM_SCHEMA }, groups: { type: "array", maxItems: MAINLINE_LIMITS.groups, items: GROUP_SCHEMA },
  completed: { type: "array", maxItems: MAINLINE_LIMITS.completed_read, items: ITEM_ID_SCHEMA }, completed_total: count, current: { anyOf: [{ type: "null" }, ITEM_ID_SCHEMA] },
  recent: { type: "array", maxItems: MAINLINE_LIMITS.recent, items: ITEM_ID_SCHEMA } },
  required: ["revision", "items", "groups", "completed", "completed_total", "current", "recent"], additionalProperties: false } as const;
const tally = { type: "object", additionalProperties: { type: "object", properties: { waiting: count, running: count }, required: ["waiting", "running"], additionalProperties: false } } as const;
const SOURCES_SCHEMA = { type: "array", items: { type: "object", properties: { kind: id, owner: id, create: { type: "boolean" }, next: { type: "boolean" } },
  required: ["kind", "owner", "create", "next"], additionalProperties: false } } as const;
const MAINLINE_RESULT_SCHEMA = { type: "object", properties: { mainline: MAINLINE_SCHEMA }, required: ["mainline"], additionalProperties: false } as const;
const ITEM_RESULT_SCHEMA = { type: "object", properties: { mainline: MAINLINE_SCHEMA, item: WORK_ITEM_SCHEMA }, required: ["mainline", "item"], additionalProperties: false } as const;
const arranged = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties: { expected_revision: revision, item_id: ITEM_ID_SCHEMA, ...properties },
  required: ["expected_revision", "item_id", ...required], additionalProperties: false }) as const;

const reads = { ...metadata, kind: "query" as const, effect: "read" as const, audiences: ["user" as const, "agent" as const, "workflow" as const, "mcp" as const], permissions: [MAINLINE_READ_PERMISSION] };
/** The person, an Agent and MCP arrange the same way (MLN-13); a workflow only reads. */
const writes = { ...metadata, kind: "operation" as const, effect: "write" as const, audiences: ["user" as const, "agent" as const, "mcp" as const], permissions: [MAINLINE_ARRANGE_PERMISSION] };
const holds = { kinds: [], permissions: [MAINLINE_ARRANGE_PERMISSION] };

/**
 * The work items of one person's mainline in one project (specs/work-mainline/contract-design.md §3), all on `system.mainline`. A write
 * that rearranges gives `expected_revision`; one that only adds (a new item, putting something in) and switching do not, so two windows
 * do not refuse each other. What waits on another owner (making or reading the source object) is checked again before it is written.
 */
export const mainlineItemActions = {
  read: { capability_id: "mainline.read", version: /* @version action.mainline.read */ 1, operation: "query", action: { ...reads,
    title: "主线", description: "读取本人在这个项目里的主线：事项、分组与顺序、当前事项、最近切过的和已完成的；带 counts 时一次给出每件事项与每组等你、在跑的数。只读。",
    input_schema: inputSchemaFor<MainlineReadRequest>()({ type: "object", properties: { counts: { type: "boolean" } }, additionalProperties: false } as const),
    output_schema: { type: "object", properties: { mainline: MAINLINE_SCHEMA, sources: SOURCES_SCHEMA, counts: { type: "object", properties: { items: tally, groups: tally, task_items: { type: "array", items: { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, item_id: { type: "string" } }, required: ["subject", "item_id"], additionalProperties: false } } }, required: ["items", "groups"], additionalProperties: false } },
      required: ["mainline", "sources"], additionalProperties: false } } } as ActionDefinition<MainlineReadRequest, MainlineReadResult>,
  subject: defineSubjectContextAction("mainline.subject.read", /* @version action.mainline.subject.read */ 1, WORK_ITEM_KIND, "事项", [MAINLINE_READ_PERMISSION]),
  create: { capability_id: "mainline.items.create", version: /* @version action.mainline.items.create */ 1, operation: "command", action: { ...writes,
    title: "新建事项", description: "新建一件轻量事项（name）、把已有对象设为事项（from），或在来源插件里新建对象后设为事项（create_as），默认排在首组末尾；写动作。from 会先以调用方身份核验可读性，create_as 重试传相同 request_id 幂等；同一对象已成事项、超出上限或对象不可读时拒绝。",
    input_schema: inputSchemaFor<MainlineItemCreateRequest>()({ type: "object", properties: { name: itemName, from: ACTION_SUBJECT_SCHEMA,
      create_as: { type: "object", properties: { kind: id, name: itemName }, required: ["kind", "name"], additionalProperties: false }, group_id: ITEM_ID_SCHEMA,
      request_id: id }, additionalProperties: false } as const),
    output_schema: ITEM_RESULT_SCHEMA } } as ActionDefinition<MainlineItemCreateRequest, MainlineItemResult>,
  convert: { capability_id: "mainline.items.convert", version: /* @version action.mainline.items.convert */ 1, operation: "command", action: { ...writes,
    title: "把事项变成对象", description: "在来源插件里新建指定类型（kind）的对象并绑定到这件轻量事项，写动作；原装入内容保持不变，事项名改由来源读取。须传最新 expected_revision（重试可传 request_id 幂等）；版本冲突、事项已绑定来源、事项不存在或来源不可用时拒绝。",
    input_schema: inputSchemaFor<MainlineItemConvertRequest>()(arranged({ kind: id, request_id: id }, ["kind"]) as never), output_schema: ITEM_RESULT_SCHEMA } } as ActionDefinition<MainlineItemConvertRequest, MainlineItemResult>,
  rename: { capability_id: "mainline.items.rename", version: /* @version action.mainline.items.rename */ 1, operation: "command", action: { ...writes,
    title: "给事项改名", description: "修改轻量事项的名称，写动作，仅改主线记录。须先读取主线并传最新 expected_revision；版本冲突、事项不存在，或该事项已绑定来源对象（名称归来源插件管理）时拒绝。",
    input_schema: inputSchemaFor<MainlineItemRenameRequest>()(arranged({ name: itemName }, ["name"]) as never), output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineItemRenameRequest, MainlineResult>,
  move: { capability_id: "mainline.items.move", version: /* @version action.mainline.items.move */ 1, operation: "command", action: { ...writes,
    title: "移动事项", description: "把一件未完成事项移到指定分组（group_id）的指定序号（index），并可设置是否置顶（pinned）；写动作，不改来源对象。须传最新 expected_revision；版本冲突、事项或分组不存在时拒绝。",
    input_schema: inputSchemaFor<MainlineItemMoveRequest>()(arranged({ group_id: ITEM_ID_SCHEMA, index: count, pinned: { type: "boolean" } }, ["group_id", "index"]) as never),
    output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineItemMoveRequest, MainlineResult>,
  complete: { capability_id: "mainline.items.complete", version: /* @version action.mainline.items.complete */ 1, operation: "command", action: { ...writes,
    title: "收进已完成", description: "将一件事项标记为已完成并移入已完成区，或撤销完成放回原分组；写动作，仅调整主线编排，不改变来源对象或装入对象的状态。须传最新 expected_revision；版本冲突或事项不存在时拒绝。",
    input_schema: inputSchemaFor<MainlineItemCompleteRequest>()(arranged({ completed: { type: "boolean" } }, ["completed"]) as never), output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineItemCompleteRequest, MainlineResult>,
  remove: { capability_id: "mainline.items.remove", version: /* @version action.mainline.items.remove */ 1, operation: "command", action: { ...writes,
    title: "从主线移出事项", description: "从本人主线移除这件事项及其「装进事项」关联；写动作，只删主线条目与关联，不会删除来源对象或装入其中的任何对象。须传最新 expected_revision；版本冲突或事项不存在时拒绝。",
    input_schema: inputSchemaFor<MainlineItemRemoveRequest>()(arranged({}, []) as never), output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineItemRemoveRequest, MainlineResult>,
  groups: { capability_id: "mainline.groups.edit", version: /* @version action.mainline.groups.edit */ 1, operation: "command", action: { ...writes,
    title: "编辑分组", description: "新增、重命名、删除或移动主线分组（op）；写动作，删组时原组内事项会自动并入相邻分组且不丢失任何对象。须传最新 expected_revision；版本冲突、分组不存在、超出分组上限或删除最后一个分组时拒绝。",
    input_schema: inputSchemaFor<MainlineGroupEditRequest>()({ type: "object", properties: { expected_revision: revision, op: { enum: ["add", "rename", "delete", "move"] },
      group_id: ITEM_ID_SCHEMA, name: itemName, index: count }, required: ["expected_revision", "op"], additionalProperties: false } as never),
    output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineGroupEditRequest, MainlineResult>,
  switch: { capability_id: "mainline.switch", version: /* @version action.mainline.switch */ 1, operation: "command", action: { ...writes,
    title: "切换当前事项", description: "切换本人在当前项目里的当前工作事项（传 item_id 选中，传 null 清空），并记入最近切换记录；写动作，不需 expected_revision、不改动对象内容。事项不存在或已收进已完成时拒绝。",
    input_schema: inputSchemaFor<MainlineSwitchRequest>()({ type: "object", properties: { item_id: { anyOf: [{ type: "null" }, ITEM_ID_SCHEMA] } }, required: ["item_id"], additionalProperties: false } as const),
    output_schema: MAINLINE_RESULT_SCHEMA } } as ActionDefinition<MainlineSwitchRequest, MainlineResult>,
  contents: { capability_id: "mainline.items.contents", version: /* @version action.mainline.items.contents */ 1, operation: "query", action: { ...reads,
    title: "这件事的东西", description: "读取一件事项装进的对象，和来源插件说与它相关的对象；只给引用，标题与形态由组合服务取。只读。",
    input_schema: inputSchemaFor<MainlineContentsRequest>()({ type: "object", properties: { item_id: ITEM_ID_SCHEMA }, required: ["item_id"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { held: { type: "array", maxItems: MAINLINE_LIMITS.held, items: ACTION_SUBJECT_SCHEMA },
      related: { type: "array", items: { type: "object", properties: { source, subjects: { type: "array", maxItems: WORK_ITEM_LIMITS.related, items: ACTION_SUBJECT_SCHEMA } }, required: ["source", "subjects"], additionalProperties: false } },
      issues: { type: "array", items: ISSUE_SCHEMA } }, required: ["held", "related", "issues"], additionalProperties: false } } } as ActionDefinition<MainlineContentsRequest, MainlineContentsResult>,
  /** 「装进事项」 as placement's relation (§3): an object may be in several items; it is read as the caller before it goes in. */
  holdsList: definePlacementRelationAction(MAINLINE_HOLDS_RELATION, "list", "mainline.holds.list", /* @version action.mainline.holds.list */ 1, { ...holds, permissions: [MAINLINE_READ_PERMISSION],
    title: "装在哪些事项里", description: "查询指定对象当前装在本人的哪些主线事项中，只读、无副作用；不修改对象或主线。对象不存在或未装入任何事项时返回空列表。", target: { kind: WORK_ITEM_KIND, noun: "事项" } }),
  holdsBind: definePlacementRelationAction(MAINLINE_HOLDS_RELATION, "bind", "mainline.holds.bind", /* @version action.mainline.holds.bind */ 1, { ...holds,
    title: "放进事项", description: "把指定对象装进一件主线事项，写动作（同一对象可同时装进多件事项），不移动也不复制对象本身。写入前以调用方身份核验该对象可读；对象不可读、事项不存在或超过单项容量上限时拒绝。" }),
  holdsRelease: definePlacementRelationAction(MAINLINE_HOLDS_RELATION, "release", "mainline.holds.release", /* @version action.mainline.holds.release */ 1, { ...holds,
    title: "从事项里拿出", description: "将指定对象从一件主线事项中移出，写动作；仅解除主线关联，不删除也不修改该对象本身。关联不存在或事项不存在时按幂等或未找到处理。" }),
  holdsCandidates: definePlacementRelationAction(MAINLINE_HOLDS_RELATION, "candidates", "mainline.holds.candidates", /* @version action.mainline.holds.candidates */ 1, { ...holds, permissions: [MAINLINE_READ_PERMISSION],
    title: "可放进的事项", description: "列出当前项目里可用于「放进事项」的未完成主线事项，当前事项排在首位，供选择目标；只读、无副作用。" }),
  holdsCreate: definePlacementRelationAction(MAINLINE_HOLDS_RELATION, "create", "mainline.holds.create", /* @version action.mainline.holds.create */ 1, { ...holds,
    title: "新建事项并放进", description: "新建一件轻量主线事项并立刻把指定对象装进去，写动作；不移动也不复制原对象。会先以调用方身份核验对象可读；对象不可读或超过主线事项上限时拒绝。" }),
};
