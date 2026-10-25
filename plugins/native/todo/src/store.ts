import type { HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TodoChange, TodoItem } from "@molis-ai/molis-work-contracts/modules/todo";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { addDays } from "./dates.js";
import { todoErrors } from "./error.js";
import { TODO_DATABASE } from "./database.js";
export { TODO_DATABASE };
import { TodoStoreWrites } from "./store-writes.js";
import { changeFromRow, changeRows, invalid, restore } from "./store-support.js";
import type { TodoAccess, TodoBatchChange, TodoFields } from "./store-types.js";

export { todoRequestKey } from "./store-types.js";
export type { TodoAccess, TodoBatchChange, TodoCreateInput, TodoFields, TodoLinkInput, TodoSql, TodoSqlValue } from "./store-types.js";

const MAX_BATCH = 200;

/** Where the actions read and write: reads run on their own; a write waits for the call's authority and is one transaction. */
export interface TodoStores {
  read<T>(run: (store: TodoStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: TodoStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run (`withStore`), by a process with its own connection: tests, maintenance. */
export function ownTodoStores(withStore: <T>(run: (store: TodoStore) => T) => T): TodoStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

export class TodoStore extends TodoStoreWrites {
  /**
   * Reminders whose time has come and that the person has not acknowledged, for todos still open. A reminder
   * older than the stale window is not delivered late; `late` marks one that passed while nobody was looking.
   */
  dueReminders(access: TodoAccess, now: Date = this.now(), staleHours = 48): { item: TodoItem; late: boolean }[] {
    const at = now.getTime();
    return this.list(access)
      .filter(item => item.remind_at && item.reminder_acknowledged_at === null && item.archived_at === null
        && ["open", "doing", "waiting"].includes(item.status))
      .map(item => ({ item, time: Date.parse(item.remind_at!) }))
      .filter(entry => entry.time <= at && entry.time >= at - staleHours * 3_600_000)
      .sort((a, b) => a.time - b.time)
      .map(entry => ({ item: entry.item, late: entry.time < at - 30 * 60_000 }));
  }

  /** “知道了”: this reminder stops showing. Not a change to the todo itself, so its revision stays. */
  acknowledgeReminder(id: string, access: TodoAccess): TodoItem {
    const current = this.get(id, access);
    if (!current.remind_at) throw todoErrors.invalid("这件待办没有提醒");
    if (current.reminder_acknowledged_at) return current;
    const at = this.now().toISOString();
    this.db.run("UPDATE todo_items SET reminder_acknowledged_at = ? WHERE id = ? AND revision = ?", [at, id, current.revision]);
    return { ...current, reminder_acknowledged_at: at };
  }

  /** One change applied to several todos, all or nothing; undone together through its batch id. */
  batch(ids: readonly string[], change: TodoBatchChange, expected: Readonly<Record<string, number>> | undefined, access: TodoAccess): { items: TodoItem[]; batch_id: string } {
    const unique = [...new Set(ids)];
    if (!unique.length) throw invalid("先选中要处理的待办");
    if (unique.length > MAX_BATCH) throw invalid(`一次最多处理 ${MAX_BATCH} 件`);
    const batchId = crypto.randomUUID();
    const items: TodoItem[] = [];
    this.transaction(() => {
      for (const id of unique) {
        const revision = expected?.[id];
        if ("status" in change) items.push(this.applyStatus(id, change.status, revision, access, batchId).item);
        else if ("archive" in change) items.push(this.applyArchive(id, change.archive, revision, access, batchId).item);
        else if ("shift_days" in change) {
          if (!Number.isInteger(change.shift_days) || Math.abs(change.shift_days) > 366) throw invalid("推后的天数无效");
          const current = this.get(id, access);
          const from = current.planned_date ?? current.due_date;
          if (!from) { items.push(current); continue; }
          const patch: TodoFields = current.planned_date ? { planned_date: addDays(current.planned_date, change.shift_days) } : { due_date: addDays(from, change.shift_days) };
          items.push(this.applyUpdate(id, patch, revision, access, batchId).item);
        } else items.push(this.applyUpdate(id, change, revision, access, batchId).item);
      }
    });
    return { items, batch_id: batchId };
  }

  /**
   * Undo one change, or every change of a batch. Refused when the todo changed afterwards, so an undo
   * never throws away a later edit. Undoing a create removes the todo it created.
   */
  revert(target: { change_id?: string; batch_id?: string }, access: TodoAccess): { items: TodoItem[]; removed_ids: string[] } {
    const rows = target.batch_id
      ? changeRows(this.db.all("SELECT * FROM todo_changes WHERE batch_id = ? ORDER BY rowid", [target.batch_id]))
      : changeRows(this.db.all("SELECT * FROM todo_changes WHERE change_id = ?", [target.change_id ?? ""]));
    if (!rows.length) throw todoErrors.not_found("找不到要撤销的修改");
    const changes = rows.map(changeFromRow);
    if (changes.some(change => change.reverted_by)) throw todoErrors.conflict("这次修改已经撤销过了");
    if (changes.some(change => change.kind === "revert")) throw invalid("撤销本身不能再撤销，请直接修改");
    // One todo may have several changes in a batch (created, then linked); they are undone together, newest first.
    const groups = new Map<string, TodoChange[]>();
    for (const change of changes) groups.set(change.item_id, [...(groups.get(change.item_id) ?? []), change]);
    const items: TodoItem[] = [];
    const removed: string[] = [];
    this.transaction(() => {
      for (const [itemId, group] of groups) {
        const current = this.get(itemId, access);
        const latest = Math.max(...group.map(change => change.revision_after));
        if (current.revision !== latest) throw todoErrors.conflict(`「${current.title}」之后又被改过，不能撤销这次修改`);
        if (group.some(change => change.kind === "create")) {
          this.db.run("DELETE FROM todo_changes WHERE item_id = ?", [current.id]);
          this.db.run("DELETE FROM todo_requests WHERE item_id = ?", [current.id]);
          this.db.run("DELETE FROM todo_items WHERE id = ?", [current.id]);
          removed.push(current.id);
          continue;
        }
        const at = this.now().toISOString();
        let next = current;
        for (const change of [...group].reverse()) next = restore(next, change, at);
        this.write(current, next);
        const revertId = crypto.randomUUID();
        this.record({ change_id: revertId, item_id: current.id, batch_id: null, kind: "revert", actor: access.actor, at,
          before: Object.assign({}, ...group.map(change => change.after)), after: Object.assign({}, ...[...group].reverse().map(change => change.before ?? {})), revision_after: next.revision });
        for (const change of group) this.db.run("UPDATE todo_changes SET reverted_by = ? WHERE change_id = ?", [revertId, change.change_id]);
        items.push(next);
      }
    });
    return { items, removed_ids: removed };
  }
}


/** This plugin's store in the Home's store registry (W4-11): `todo/todo.db` at its one baseline. */
export const TODO_HOME_STORE: HomeStoreDeclaration = { path: TODO_DATABASE.store_name, library: { baseline: TODO_DATABASE } };
