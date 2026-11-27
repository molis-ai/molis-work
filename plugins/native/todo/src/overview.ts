import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, type OverviewTaskRow, type PluginDueOutcome } from "@molis-ai/molis-work-contracts/platform/plugin";
import { overviewRows, type OverviewRowsWriter } from "@molis-ai/molis-work-plugin-sdk";
import { TODO_PROJECT_PLUGIN_ID, type TodoItem } from "./contract.js";

/**
 * Todo's rows in the platform's overview table (specs/unified-partition-plugins §6.1, batch 108): one `task` row per todo still to do (open,
 * doing or waiting, not archived), written in the same transaction as the todo. The row's reminder column is the todo's reminder while the
 * person has not said “知道了”: the platform reads it into the due registry, and when it falls due wakes Todo in this partition only
 * (`todoDue`). A done, cancelled, archived or deleted todo has no row.
 *
 * A kind holds at most {@link OVERVIEW_ROW_LIMIT} rows. When a new todo would pass it, the row of the todo written longest ago that has no
 * reminder makes room; when every row has one, the new todo is left out of the overview (its page still has it) rather than silencing a
 * reminder already set.
 */
export function todoOverviewRow(item: TodoItem): OverviewTaskRow | null {
  if (item.archived_at !== null || item.status === "done" || item.status === "cancelled") return null;
  return {
    row_id: item.id, title: item.title, status: "open", updated_at: item.updated_at,
    due_at: item.due_date ? dueInstant(item.due_date, item.due_time) : null,
    remind_at: item.remind_at && item.reminder_acknowledged_at === null ? item.remind_at : null,
    priority: item.important ? 3 : null,
    tags: item.status === "open" ? [] : [item.status],
  };
}

/** The local end of a due day, or its time when there is one, as an instant with its offset. */
function dueInstant(date: string, time: string | null): string {
  return new Date(`${date}T${time ?? "23:59"}:00`).toISOString();
}

/** Writes (or removes) the overview row of `item` in the transaction `db` belongs to. */
export function writeTodoOverview(db: OverviewRowsWriter, item: TodoItem): void {
  const rows = overviewRows(db), row = todoOverviewRow(item);
  if (row === null) {
    rows.remove("task", item.id);
    return;
  }
  if (!db.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = 'task' AND row_id = ?`, [item.id])
    && Number((db.get(`SELECT count(*) AS total FROM ${OVERVIEW_TABLE} WHERE kind = 'task'`) as { total: number }).total) >= OVERVIEW_ROW_LIMIT) {
    const room = db.get(`SELECT row_id FROM ${OVERVIEW_TABLE} WHERE kind = 'task' AND remind_at IS NULL ORDER BY updated_at, row_id LIMIT 1`) as { row_id: string } | undefined;
    if (!room) return;
    rows.remove("task", room.row_id);
  }
  rows.upsert("task", row);
}

export function removeTodoOverview(db: OverviewRowsWriter, id: string): void {
  overviewRows(db).remove("task", id);
}

/**
 * What a fallen-due reminder of this partition says (the platform's `onDue`): the todo, when it is still to do and its reminder is still
 * that time and not seen; otherwise nothing, so a reminder changed or settled since the overview was read does not ring.
 */
export function todoDue(entryKey: string, dueAt: string, find: (id: string) => TodoItem | null): PluginDueOutcome {
  if (!entryKey.startsWith("task:")) return { reminder: null };
  const item = find(entryKey.slice("task:".length));
  const row = item ? todoOverviewRow(item) : null;
  if (!item || !row?.remind_at || Date.parse(row.remind_at) !== Date.parse(dueAt)) return { reminder: null };
  return { reminder: { title: [...item.title].slice(0, 300).join(""), open: { surface: TODO_PROJECT_PLUGIN_ID, id: item.id } } };
}
