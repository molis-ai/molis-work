import type { TodoChange, TodoItem } from "./contract.js";
import { sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { addDays } from "./dates.js";
import { todoErrors } from "./error.js";
import { TODO_DATABASE } from "./database.js";
export { TODO_DATABASE };
import { TodoStoreWrites } from "./store-writes.js";
import { assertRevision, changeFromRow, changeRows, invalid, restore, toRow } from "./store-support.js";
import { writeTodoOverview } from "./overview.js";
import { carriedTodo, todoRecord } from "./carry.js";
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
    return this.pendingReminders(access)
      .map(item => ({ item, time: Date.parse(item.remind_at!) }))
      .filter(entry => entry.time <= at && entry.time >= at - staleHours * 3_600_000)
      .sort((a, b) => a.time - b.time)
      .map(entry => ({ item: entry.item, late: entry.time < at - 30 * 60_000 }));
  }

  /** “知道了”: this reminder stops showing. Not a change to the todo itself, so its revision stays. */
  acknowledgeReminder(id: string, observedAt: string, access: TodoAccess): TodoItem {
    const current = this.get(id, access);
    if (current.remind_at !== observedAt) throw todoErrors.conflict("提醒时间已经改变，请刷新后再确认");
    if (current.reminder_acknowledged_at) return current;
    const at = this.now().toISOString();
    const written = this.db.run("UPDATE todo_items SET reminder_acknowledged_at = ? WHERE id = ? AND remind_at = ? AND revision = ? AND reminder_acknowledged_at IS NULL", [at, id, observedAt, current.revision]);
    if (Number(written.changes) !== 1) throw todoErrors.conflict("提醒已经改变，请刷新后再确认");
    const acknowledged = { ...current, reminder_acknowledged_at: at };
    writeTodoOverview(this.db, acknowledged);
    return acknowledged;
  }

  /** One change applied to several todos, all or nothing; undone together through its batch id. */
  batch(ids: readonly string[], change: TodoBatchChange, expected: Readonly<Record<string, number>> | undefined, access: TodoAccess): { items: TodoItem[]; changed_count: number; batch_id: string | null } {
    const unique = [...new Set(ids)];
    if (!unique.length) throw invalid("先选中要处理的待办");
    if (unique.length > MAX_BATCH) throw invalid(`一次最多处理 ${MAX_BATCH} 件`);
    const batchId = crypto.randomUUID();
    const items: TodoItem[] = [];
    let changed = 0;
    const collect = (result: { item: TodoItem; change_id: string | null }) => {
      items.push(result.item);
      if (result.change_id) changed++;
    };
    this.transaction(() => {
      for (const id of unique) {
        const revision = expected?.[id];
        if ("status" in change) collect(this.applyStatus(id, change.status, revision, access, batchId));
        else if ("archive" in change) collect(this.applyArchive(id, change.archive, revision, access, batchId));
        else if ("shift_days" in change) {
          if (!Number.isInteger(change.shift_days) || Math.abs(change.shift_days) > 366) throw invalid("推后的天数无效");
          const current = this.get(id, access);
          const from = current.planned_date ?? current.due_date;
          if (!from) { assertRevision(current, revision); items.push(current); continue; }
          const patch: TodoFields = current.planned_date ? { planned_date: addDays(current.planned_date, change.shift_days) } : { due_date: addDays(from, change.shift_days) };
          collect(this.applyUpdate(id, patch, revision, access, batchId));
        } else collect(this.applyUpdate(id, change, revision, access, batchId));
      }
    });
    return { items, changed_count: changed, batch_id: changed ? batchId : null };
  }

  /**
   * Undo one change, or every change of a batch. Refused when the todo changed afterwards, so an undo
   * never throws away a later edit. Undoing a create removes the todo it created.
   */
  revert(target: { change_id?: string; batch_id?: string }, access: TodoAccess): { items: TodoItem[]; removed_ids: string[] } {
    const rows = target.batch_id
      ? changeRows(this.db.all("SELECT * FROM todo_changes WHERE batch_id = ? ORDER BY revision_after, rowid", [target.batch_id]))
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
          this.overviewGone(current.id);
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

  /**
   * One todo as the record placement carries to another partition (`placement.export`): the todo and its history. The revision is the
   * todo's own, so it can be let go from here only while nobody changed it since (`removeCarried`).
   */
  exportRecord(id: string): PlacementExport {
    const item = this.get(id, { actor: "other", actorId: "" });
    // As the subject reader says (search.ts): an archived todo is gone from use, so placement neither moves nor copies it.
    if (item.archived_at) throw todoErrors.not_found("这件待办已归档");
    const changes = changeRows(this.db.all("SELECT * FROM todo_changes WHERE item_id = ? ORDER BY revision_after, at, rowid", [id])).map(changeFromRow);
    return { subject: { kind: "todo_item", id }, revision: String(item.revision), record: todoRecord(item, changes) };
  }

  /**
   * Writes a carried todo here (`placement.put`). With `targetId` (a move) it keeps its id, dates and history; without (a copy) it is a new
   * todo of the same words with a history of its own, and the same request makes the same one. Links to other todos stay behind (those
   * todos are not here).
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): TodoItem {
    const carried = carriedTodo(record, targetId ?? null);
    if (targetId === undefined) {
      const access = { actor: "user" as const, actorId: "placement" };
      const { item } = this.create({ title: carried.item.title, notes: carried.item.notes, status: carried.item.status, due_date: carried.item.due_date,
        due_time: carried.item.due_time, planned_date: carried.item.planned_date, remind_at: carried.item.remind_at, important: carried.item.important,
        waiting: carried.item.waiting, sources: carried.item.sources.map(({ source_id: _id, added_at: _at, ...source }) => source), request_id: `copy:${requestId}` }, access);
      return item;
    }
    let result!: TodoItem;
    this.transaction(() => {
      const here = this.find(targetId);
      if (here) {
        // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept.
        if (sameCarriedRecord(this.exportRecord(targetId).record, todoRecord(carried.item, carried.changes))) {
          result = here;
          return;
        }
        throw todoErrors.conflict("目标位置已经有这件待办，而且内容不同；没有覆盖它");
      }
      this.db.run(`INSERT INTO todo_items (id, title, notes, status, due_date, due_time, planned_date, remind_at, important,
        waiting_json, sources_json, links_json, edited_fields_json, archived_at, completed_at, created_at, updated_at, revision, reminder_acknowledged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, toRow(carried.item));
      for (const change of carried.changes) this.db.run(`INSERT INTO todo_changes (change_id, item_id, batch_id, kind, actor, at, before_json, after_json, revision_after, reverted_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [change.change_id, change.item_id, change.batch_id, change.kind, change.actor, change.at,
        change.before === null ? null : JSON.stringify(change.before), JSON.stringify(change.after), change.revision_after, change.reverted_by]);
      writeTodoOverview(this.db, carried.item);
      result = carried.item;
    });
    return result;
  }

  /** Lets a todo that went to another partition go from here (`placement.remove`) with its history, only while it is still the one carried. */
  removeCarried(id: string, revision: string): boolean {
    let removed = false;
    this.transaction(() => {
      const current = this.find(id);
      if (!current) return;
      if (String(current.revision) !== revision) throw todoErrors.conflict("这件待办刚被修改，请重新打开后再移动");
      this.db.run("DELETE FROM todo_changes WHERE item_id = ?", [id]);
      this.db.run("DELETE FROM todo_requests WHERE item_id = ?", [id]);
      removed = Number(this.db.run("DELETE FROM todo_items WHERE id = ? AND revision = ?", [id, current.revision]).changes) === 1;
      this.overviewGone(id);
    });
    return removed;
  }
}

