import type { TodoChange, TodoItem, TodoLink } from "./contract.js";
import { todoErrors } from "./error.js";
import { changeFromRow, changeRows, conflict, fromRow, itemRows, toRow, visible, type ItemRow } from "./store-support.js";
import type { TodoAccess, TodoSql } from "./store-types.js";

/** The todo store's connection and plumbing: reading, and the three statements every write is made of. */
export abstract class TodoStoreBase {
  /** `atomically` runs a write that takes several statements as one: a transaction of its own, or nothing more inside one. */
  constructor(protected readonly db: TodoSql, protected readonly atomically: <T>(run: () => T) => T = run => run(),
    protected readonly release: () => void = () => {}, protected readonly now: () => Date = () => new Date()) {}

  close(): void {
    this.release();
  }

  /** Every todo this caller may see; views and search filter from here. */
  list(access: TodoAccess): TodoItem[] {
    const rows = itemRows(this.db.all("SELECT * FROM todo_items ORDER BY created_at"));
    return rows.map(fromRow).filter(item => visible(item, access));
  }

  get(id: string, access: TodoAccess): TodoItem {
    const row = this.db.get("SELECT * FROM todo_items WHERE id = ?", [id]) as ItemRow | undefined;
    const item = row ? fromRow(row) : null;
    if (!item || !visible(item, access)) throw todoErrors.not_found("找不到这件待办，可能已被删除");
    return item;
  }

  /** Other todos whose links point at this one, so the relation reads from both ends. */
  backlinks(id: string, access: TodoAccess): { item: TodoItem; link: TodoLink }[] {
    return this.list(access).flatMap(item => item.links
      .filter(link => link.kind === "todo" && link.subject.id === id)
      .map(link => ({ item, link })));
  }

  history(id: string, access: TodoAccess): TodoChange[] {
    this.get(id, access);
    const rows = changeRows(this.db.all("SELECT * FROM todo_changes WHERE item_id = ? ORDER BY at DESC, rowid DESC LIMIT 100", [id]));
    return rows.map(changeFromRow);
  }

  /** Run several store operations as one transaction (organizing applies a person's choices this way). */
  inTransaction<T>(run: () => T): T {
    return this.atomically(run);
  }

  /** The same database, for the organizing records that live beside the todos. */
  database(): TodoSql {
    return this.db;
  }

  clock(): Date {
    return this.now();
  }

  protected insert(item: TodoItem): void {
    this.db.run(`INSERT INTO todo_items (id, title, notes, status, placement, project_id, due_date, due_time, planned_date, remind_at, important,
      waiting_json, sources_json, links_json, edited_fields_json, archived_at, completed_at, created_at, updated_at, revision, reminder_acknowledged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, toRow(item));
  }

  protected write(current: TodoItem, next: TodoItem): void {
    const values = toRow(next);
    const result = this.db.run(`UPDATE todo_items SET id = ?, title = ?, notes = ?, status = ?, placement = ?, project_id = ?, due_date = ?, due_time = ?,
      planned_date = ?, remind_at = ?, important = ?, waiting_json = ?, sources_json = ?, links_json = ?, edited_fields_json = ?, archived_at = ?,
      completed_at = ?, created_at = ?, updated_at = ?, revision = ?, reminder_acknowledged_at = ? WHERE id = ? AND revision = ?`, [...values, current.id, current.revision]);
    if (result.changes !== 1) throw conflict();
  }

  protected record(change: Omit<TodoChange, "reverted_by">): void {
    this.db.run(`INSERT INTO todo_changes (change_id, item_id, batch_id, kind, actor, at, before_json, after_json, revision_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [change.change_id, change.item_id, change.batch_id, change.kind, change.actor, change.at,
      change.before === null ? null : JSON.stringify(change.before), JSON.stringify(change.after), change.revision_after]);
  }

  protected transaction(run: () => void): void {
    this.atomically(run);
  }
}
