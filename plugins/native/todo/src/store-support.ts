import type { TodoActorKind, TodoChange, TodoEditableField, TodoItem, TodoLink, TodoPlacement, TodoSource, TodoStatus, TodoWaiting } from "./contract.js";
import { todoErrors } from "./error.js";
import type { TodoAccess } from "./store-types.js";

export interface ItemRow {
  id: string; title: string; notes: string; status: string; placement: string; project_id: string | null;
  due_date: string | null; due_time: string | null; planned_date: string | null; remind_at: string | null;
  important: number; reminder_acknowledged_at: string | null; waiting_json: string | null; sources_json: string; links_json: string; edited_fields_json: string;
  archived_at: string | null; completed_at: string | null; created_at: string; updated_at: string; revision: number;
}
export interface ChangeRow {
  change_id: string; item_id: string; batch_id: string | null; kind: string; actor: string; at: string;
  before_json: string | null; after_json: string; revision_after: number; reverted_by: string | null;
}

export function visible(item: TodoItem, access: TodoAccess): boolean {
  return item.project_id === null || item.project_id === access.projectId || access.projectIds.includes(item.project_id);
}

/** Put back the fields a change touched, as they were before it. */
export function restore(current: TodoItem, change: TodoChange, at: string): TodoItem {
  const before = (change.before ?? {}) as Record<string, unknown>;
  if (change.kind === "source") {
    const added = (change.after as { source_added?: TodoSource }).source_added;
    return { ...current, sources: added ? current.sources.filter(source => source.source_id !== added.source_id) : current.sources, updated_at: at, revision: current.revision + 1 };
  }
  if (change.kind === "link") {
    const added = (change.after as { link_added?: TodoLink }).link_added;
    const removed = before.link_added as TodoLink | undefined;
    const links = added ? current.links.filter(link => link.link_id !== added.link_id) : removed ? [...current.links, removed] : current.links;
    return { ...current, links, updated_at: at, revision: current.revision + 1 };
  }
  const restored = { ...current, ...(before as Partial<TodoItem>), updated_at: at, revision: current.revision + 1 };
  return "remind_at" in before ? { ...restored, reminder_acknowledged_at: null } : restored;
}

export function assertRevision(item: TodoItem, expected: number | undefined): void {
  if (expected !== undefined && item.revision !== expected) throw conflict(item.title);
}

export const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const invalid = (message: string) => todoErrors.invalid(message);
export const conflict = (title?: string) => todoErrors.conflict(title ? `「${title}」已在别处修改，请重新读取后再改` : "待办已在别处修改，请重新读取后再改");

/** The SQL layer hands back untyped rows; these name the shapes the schema gives `todo_items` and `todo_changes`. */
export const itemRows = (rows: readonly (Readonly<Record<string, unknown>> | undefined)[]): ItemRow[] => rows.flatMap(row => { const typed = row as ItemRow | undefined; return typed ? [typed] : []; });
export const changeRows = (rows: readonly (Readonly<Record<string, unknown>> | undefined)[]): ChangeRow[] => rows.flatMap(row => { const typed = row as ChangeRow | undefined; return typed ? [typed] : []; });

export function fromRow(row: ItemRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TodoStatus,
    placement: row.placement as TodoPlacement,
    project_id: row.project_id,
    due_date: row.due_date,
    due_time: row.due_time,
    planned_date: row.planned_date,
    remind_at: row.remind_at,
    reminder_acknowledged_at: row.reminder_acknowledged_at ?? null,
    important: row.important === 1,
    waiting: row.waiting_json ? JSON.parse(row.waiting_json) as TodoWaiting : null,
    sources: JSON.parse(row.sources_json) as TodoSource[],
    links: JSON.parse(row.links_json) as TodoLink[],
    edited_fields: JSON.parse(row.edited_fields_json) as TodoEditableField[],
    archived_at: row.archived_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revision: row.revision,
  };
}

export function toRow(item: TodoItem): (string | number | null)[] {
  return [item.id, item.title, item.notes, item.status, item.placement, item.project_id, item.due_date, item.due_time, item.planned_date, item.remind_at,
    item.important ? 1 : 0, item.waiting ? JSON.stringify(item.waiting) : null, JSON.stringify(item.sources), JSON.stringify(item.links),
    JSON.stringify(item.edited_fields), item.archived_at, item.completed_at, item.created_at, item.updated_at, item.revision, item.reminder_acknowledged_at];
}

export function changeFromRow(row: ChangeRow): TodoChange {
  return { change_id: row.change_id, item_id: row.item_id, batch_id: row.batch_id, kind: row.kind as TodoChange["kind"], actor: row.actor as TodoActorKind,
    at: row.at, before: row.before_json ? JSON.parse(row.before_json) : null, after: JSON.parse(row.after_json), revision_after: row.revision_after, reverted_by: row.reverted_by };
}
