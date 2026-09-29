import type { ContractDescriptor } from "../platform/package.js";

export const modulesTodoContract = {
  contractId: "io.molis.work.module.todo.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const TODO_PLUGIN_ID = "io.molis.work.todo";
export const TODO_PROJECT_PLUGIN_ID = "todo";
/** The subject kind other modules (search, the Assistant's work relations) use for one todo. */
export const TODO_SUBJECT_KIND = "todo_item";

/**
 * What the person is doing about it. Archiving is a separate flag (tucked away, state unchanged);
 * "someone is working on it" (an Assistant work) is shown beside the status and never changes it.
 */
export type TodoStatus = "open" | "doing" | "waiting" | "done" | "cancelled";
export const TODO_STATUSES: readonly TodoStatus[] = ["open", "doing", "waiting", "done", "cancelled"];

/** Where it belongs. `unassigned` is a normal state: recorded first, placed later. */
export type TodoPlacement = "personal" | "project" | "unassigned";

/** Who is being waited on, for what, and when the person intends to follow up. */
export interface TodoWaiting {
  readonly who: string;
  readonly what: string;
  /** YYYY-MM-DD, or null when no follow-up is agreed. */
  readonly follow_up_on: string | null;
}

/** Where a todo came from and why it is one. Materials are referenced, never copied in full. */
export interface TodoSource {
  readonly source_id: string;
  readonly kind: "manual" | "material" | "assistant" | "onboarding" | "inbox";
  /** Where it was created or what it came from: "你在 Todo 创建", a mail subject, a file name. */
  readonly title: string;
  /** The passage the todo rests on, bounded. Empty for a manual todo. */
  readonly excerpt: string;
  /** Why this is something to do ("原文要求你周五前发送"). */
  readonly reason: string;
  /** The original object, when it can be opened. */
  readonly subject: { readonly kind: string; readonly id: string } | null;
  readonly open: { readonly surface: string; readonly id: string } | null;
  readonly added_at: string;
}

export type TodoLinkKind = "goal" | "material" | "todo" | "outcome" | "work";
/** How a linked todo relates to this one. */
export type TodoRelation = "blocked_by" | "blocks" | "split_from" | "merged" | "related";

export interface TodoLink {
  readonly link_id: string;
  readonly kind: TodoLinkKind;
  readonly subject: { readonly kind: string; readonly id: string };
  readonly title: string;
  /** Only for kind "todo". */
  readonly relation: TodoRelation | null;
  /** Only for kind "outcome": a draft, or an action that really happened (sent, shared). */
  readonly outcome: "draft" | "done" | null;
  readonly open: { readonly surface: string; readonly id: string } | null;
  readonly added_at: string;
}

/** Fields the person can edit; the ones they edited by hand are protected from later automatic updates. */
export type TodoEditableField = "title" | "notes" | "due_date" | "due_time" | "planned_date" | "remind_at" | "placement" | "important" | "waiting";

export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly notes: string;
  readonly status: TodoStatus;
  readonly placement: TodoPlacement;
  /** Set only when placement is "project". */
  readonly project_id: string | null;
  /** The latest date it must be done by, usually someone else's requirement. YYYY-MM-DD. */
  readonly due_date: string | null;
  /** Optional time of day for the due date, HH:MM; a date alone means all day. */
  readonly due_time: string | null;
  /** The day the person means to work on it. YYYY-MM-DD. */
  readonly planned_date: string | null;
  /** When to remind, an instant with its offset. */
  readonly remind_at: string | null;
  /** The person saw the current reminder and said “知道了”; cleared whenever the reminder time changes. */
  readonly reminder_acknowledged_at: string | null;
  /** Set only by the person. */
  readonly important: boolean;
  readonly waiting: TodoWaiting | null;
  readonly sources: readonly TodoSource[];
  readonly links: readonly TodoLink[];
  /** Fields the person changed by hand. */
  readonly edited_fields: readonly TodoEditableField[];
  readonly archived_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly revision: number;
}

/** Who made a change: the person themself, the Assistant for them, or another caller. */
export type TodoActorKind = "user" | "assistant" | "other";

export interface TodoChange {
  readonly change_id: string;
  readonly item_id: string;
  /** Changes made together (a batch) share one id and are undone together. */
  readonly batch_id: string | null;
  readonly kind: "create" | "update" | "status" | "archive" | "unarchive" | "link" | "revert";
  readonly actor: TodoActorKind;
  readonly at: string;
  /** Only the fields that changed; null before a create. */
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>>;
  readonly revision_after: number;
  /** Set once undone; an undone change cannot be undone again. */
  readonly reverted_by: string | null;
}

/** How long a reminder the person never saw stays worth showing; older ones are not delivered late. */
export const TODO_REMINDER_STALE_HOURS = 48;

/** The views the Todo page offers; each answers one question. */
export type TodoView = "today" | "waiting" | "unscheduled" | "upcoming" | "all" | "closed";
