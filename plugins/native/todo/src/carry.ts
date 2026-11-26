import type { PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { exceedsCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { TODO_STATUSES, type TodoChange, type TodoItem } from "./contract.js";
import { isTodoDate, isTodoInstant, isTodoTime } from "./dates.js";
import { todoErrors } from "./error.js";
import { changeFromRow, fromRow, toRow, type ChangeRow, type ItemRow } from "./store-support.js";

/**
 * A todo as placement carries it between partitions (specs/archive/work-placement, batch 108): the row as Todo keeps it, without its id
 * (the move names the id, a copy makes a new one), and its history as JSON text. Request receipts stay where they were made.
 */
const ITEM_COLUMNS = ["title", "notes", "status", "due_date", "due_time", "planned_date", "remind_at", "important", "waiting_json", "sources_json",
  "links_json", "edited_fields_json", "archived_at", "completed_at", "created_at", "updated_at", "revision", "reminder_acknowledged_at"] as const;
const CHANGE_KINDS = ["create", "update", "status", "archive", "unarchive", "link", "source", "revert"];

export function todoRecord(item: TodoItem, changes: readonly TodoChange[]): PlacementRecord {
  const [, ...values] = toRow(item);
  const record: Record<string, unknown> = Object.fromEntries(ITEM_COLUMNS.map((column, index) => [column, values[index] ?? null]));
  // `toRow` puts `reminder_acknowledged_at` last, as `ITEM_COLUMNS` does.
  record.changes_json = JSON.stringify(changes.map(change => ({ change_id: change.change_id, batch_id: change.batch_id, kind: change.kind, actor: change.actor,
    at: change.at, before: change.before, after: change.after, revision_after: change.revision_after, reverted_by: change.reverted_by })));
  return record;
}

/**
 * The todo a carried record makes here, checked as Todo checks its own rows. A link to another todo stays behind (that todo is not here),
 * and so does the change that added it. `id` is the move's target id; a copy is given a placeholder its `create` replaces.
 */
export function carriedTodo(record: PlacementRecord, id: string | null): { item: TodoItem; changes: TodoChange[] } {
  const keys = Object.keys(record).sort(), expected = [...ITEM_COLUMNS, "changes_json"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid();
  const row = { id: id ?? "carried", ...Object.fromEntries(ITEM_COLUMNS.map(column => [column, record[column]])) } as ItemRow;
  if (typeof row.title !== "string" || !row.title.trim() || exceedsCharacters(row.title, 200) || typeof row.notes !== "string" || [...row.notes].length > 10_000
    || !TODO_STATUSES.includes(row.status as TodoItem["status"]) || ![0, 1].includes(row.important) || !Number.isSafeInteger(row.revision) || row.revision < 1
    || !optional(row.due_date, isTodoDate) || !optional(row.planned_date, isTodoDate) || !optional(row.due_time, isTodoTime) || (row.due_time !== null && row.due_date === null)
    || !optional(row.remind_at, isTodoInstant) || !optional(row.reminder_acknowledged_at, isTodoInstant) || !optional(row.archived_at, isTodoInstant)
    || !optional(row.completed_at, isTodoInstant) || !isTodoInstant(row.created_at) || !isTodoInstant(row.updated_at)) invalid();
  let item: TodoItem;
  try {
    item = fromRow(row);
  } catch {
    return invalid();
  }
  if (!Array.isArray(item.sources) || !Array.isArray(item.links) || !Array.isArray(item.edited_fields) || (item.waiting !== null && typeof item.waiting !== "object")) invalid();
  const droppedLinks = new Set(item.links.filter(link => link.kind === "todo").map(link => link.link_id));
  item = { ...item, links: item.links.filter(link => !droppedLinks.has(link.link_id)) };
  let history: unknown;
  try { history = JSON.parse(String(record.changes_json)); } catch { return invalid(); }
  if (!Array.isArray(history) || history.length > 10_000) invalid();
  const changes = history.map(entry => {
    const change = entry as Record<string, unknown>;
    if (!change || typeof change !== "object" || typeof change.change_id !== "string" || !change.change_id || change.change_id.length > 100
      || !CHANGE_KINDS.includes(String(change.kind)) || !["user", "assistant", "other"].includes(String(change.actor)) || typeof change.at !== "string"
      || !Number.isSafeInteger(change.revision_after) || Number(change.revision_after) < 1 || Number(change.revision_after) > item.revision
      || (change.batch_id !== null && typeof change.batch_id !== "string") || (change.reverted_by !== null && typeof change.reverted_by !== "string")
      || !change.after || typeof change.after !== "object") invalid();
    return changeFromRow({ change_id: change.change_id as string, item_id: item.id, batch_id: change.batch_id as string | null, kind: String(change.kind), actor: String(change.actor),
      at: change.at as string, before_json: change.before === null || change.before === undefined ? null : JSON.stringify(change.before), after_json: JSON.stringify(change.after),
      revision_after: Number(change.revision_after), reverted_by: change.reverted_by as string | null } satisfies ChangeRow);
  }).filter(change => !(change.kind === "link" && droppedLinks.has(String((change.after as { link_added?: { link_id?: string } }).link_added?.link_id))));
  return { item, changes };
}

function optional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === null || check(value);
}
function invalid(): never {
  throw todoErrors.invalid("带来的待办内容不完整，没有放进来");
}
