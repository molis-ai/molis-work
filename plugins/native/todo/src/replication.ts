import type { DatabaseSync } from "node:sqlite";
import { TODO_STATUSES } from "@molis-ai/molis-work-contracts/modules/todo";
import { PluginSyncError, type PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica, initializeReplica, readDatabaseSpace, replicaMarkSql, replicaTransaction,
  type AggregateReplicaContext,
} from "@molis-ai/molis-work-storage";
import { isTodoDate, isTodoInstant, isTodoTime } from "./dates.js";

export const todoSync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "todo_items", title: "待办与修改历史", schema_version: 1, requires: [] }],
};

type Row = Record<string, string | number | null>;
const itemColumns = [
  "id", "title", "notes", "status", "placement", "project_id", "due_date", "due_time",
  "planned_date", "remind_at", "important", "waiting_json", "sources_json", "links_json",
  "edited_fields_json", "archived_at", "completed_at", "created_at", "updated_at", "revision",
  "reminder_acknowledged_at",
] as const;
const changeColumns = [
  "change_id", "item_id", "batch_id", "kind", "actor", "at", "before_json",
  "after_json", "revision_after", "reverted_by",
] as const;
const requestColumns = ["request_id", "item_id", "created_at"] as const;
const LIMIT = 512 * 1024;

/** Journal the item's transaction; its history and request receipts are written in that same transaction. */
export function initializeTodoReplication(db: DatabaseSync): void {
  if (readDatabaseSpace(db)?.kind !== "personal") return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    db.exec("CREATE TABLE IF NOT EXISTS todo_editor_versions(id TEXT PRIMARY KEY,revision INTEGER NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS todo_imported_changes(change_id TEXT PRIMARY KEY)");
    db.exec("INSERT INTO todo_editor_versions SELECT id,revision FROM todo_items WHERE 1 ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)");
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='todo_replica_insert'").get()) {
      db.exec("INSERT INTO replica_changes(key) SELECT json_array('todo',id) FROM todo_items ORDER BY id");
      for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
        const row = event === "DELETE" ? "OLD" : "NEW";
        db.exec("CREATE TRIGGER todo_replica_" + event.toLowerCase() + " AFTER " + event + " ON todo_items BEGIN " +
          replicaMarkSql("json_array('todo'," + row + ".id)") +
          (event === "DELETE" ? "" : "INSERT INTO todo_editor_versions VALUES (" + row + ".id," + row + ".revision) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision);") +
          " END");
      }
    }
  });
}

export function isImportedTodoChange(db: DatabaseSync, id: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='todo_imported_changes'").get() &&
    !!db.prepare("SELECT 1 FROM todo_imported_changes WHERE change_id=?").get(id);
}

export function createTodoReplica(db: DatabaseSync, context: AggregateReplicaContext): SyncReplicaAdapter {
  const space = readDatabaseSpace(db);
  if (space?.kind !== "personal" || space.spaceId !== context.spaceId) invalid("同步空间不匹配", "sync.scope");
  const decode = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== "todo" ||
      typeof parts[1] !== "string" || !parts[1] || parts[1].length > 100) invalid();
    return parts[1] as string;
  };
  return createSqliteReplica(db, {
    authorize: context.authorize,
    read(key) {
      const id = decode(key);
      const item = db.prepare("SELECT * FROM todo_items WHERE id=?").get(id) as Row | undefined;
      if (!item) return null;
      const changes = db.prepare("SELECT * FROM todo_changes WHERE item_id=? ORDER BY at,change_id").all(id) as Row[];
      const requests = db.prepare("SELECT * FROM todo_requests WHERE item_id=? ORDER BY request_id").all(id) as Row[];
      const project = item.project_id ? { id: item.project_id, title: context.project(String(item.project_id)).title } : null;
      const value = { format: 1, spaceId: context.spaceId, project, item, changes, requests };
      validate(value, id, context.spaceId);
      size(value);
      return value;
    },
    apply(key, value) {
      const id = decode(key);
      if (value === null) {
        db.prepare("DELETE FROM todo_imported_changes WHERE change_id IN (SELECT change_id FROM todo_changes WHERE item_id=?)").run(id);
        db.prepare("DELETE FROM todo_changes WHERE item_id=?").run(id);
        db.prepare("DELETE FROM todo_requests WHERE item_id=?").run(id);
        db.prepare("DELETE FROM todo_items WHERE id=?").run(id);
        return;
      }
      size(value);
      const wire = validate(value, id, context.spaceId);
      if (wire.project) context.project(wire.project.id);
      const old = db.prepare("SELECT revision FROM todo_items WHERE id=?").get(id) as { revision: number } | undefined;
      const high = db.prepare("SELECT revision FROM todo_editor_versions WHERE id=?").get(id) as { revision: number } | undefined;
      wire.item.revision = Math.max(Number(wire.item.revision), old?.revision ?? 0, high?.revision ?? 0) + 1;
      db.prepare("DELETE FROM todo_imported_changes WHERE change_id IN (SELECT change_id FROM todo_changes WHERE item_id=?)").run(id);
      db.prepare("DELETE FROM todo_changes WHERE item_id=?").run(id);
      db.prepare("DELETE FROM todo_requests WHERE item_id=?").run(id);
      upsert(db, "todo_items", itemColumns, "id", wire.item);
      for (const change of wire.changes) {
        insert(db, "todo_changes", changeColumns, change);
        db.prepare("INSERT OR IGNORE INTO todo_imported_changes(change_id) VALUES (?)").run(change.change_id as string);
      }
      for (const request of wire.requests) insert(db, "todo_requests", requestColumns, request);
    },
  });
}

function validate(value: unknown, id: string, spaceId: string): {
  project: { id: string; title: string } | null; item: Row; changes: Row[]; requests: Row[];
} {
  const wire = object(value);
  exact(wire, ["format", "spaceId", "project", "item", "changes", "requests"]);
  if (wire.format !== 1 || wire.spaceId !== spaceId) invalid("同步空间不匹配", "sync.scope");
  const project = wire.project === null ? null : object(wire.project);
  if (project) {
    exact(project, ["id", "title"]);
    if (typeof project.id !== "string" || !project.id || project.id.length > 80 ||
      typeof project.title !== "string" || !project.title.trim() || project.title.length > 120) invalid();
  }
  const item = object(wire.item) as Row;
  exact(item, itemColumns);
  if (item.id !== id || typeof item.title !== "string" || !item.title || item.title.length > 200 ||
    typeof item.notes !== "string" || !TODO_STATUSES.includes(item.status as typeof TODO_STATUSES[number]) ||
    !["personal", "project", "unassigned"].includes(String(item.placement)) ||
    (item.placement === "project") !== !!project || item.project_id !== (project?.id ?? null) ||
    ![0, 1].includes(item.important as number) || !Number.isSafeInteger(item.revision) ||
    Number(item.revision) < 1 || !stamp(item.created_at) || !stamp(item.updated_at) ||
    !optionalDate(item.due_date) || !optionalDate(item.planned_date) ||
    !optionalTime(item.due_time) || !optionalInstant(item.remind_at) ||
    !optionalInstant(item.reminder_acknowledged_at) || !optionalInstant(item.archived_at) ||
    !optionalInstant(item.completed_at)) invalid();
  if (item.due_time && !item.due_date) invalid();
  const waiting = item.waiting_json === null ? null : parse(item.waiting_json);
  if (waiting !== null && (!waiting || typeof waiting !== "object" || Array.isArray(waiting))) invalid();
  for (const field of ["sources_json", "links_json", "edited_fields_json"] as const) {
    if (!Array.isArray(parse(item[field]))) invalid();
  }
  if (!Array.isArray(wire.changes) || !Array.isArray(wire.requests)) invalid();
  const changes = wire.changes.map(row => object(row) as Row);
  const requests = wire.requests.map(row => object(row) as Row);
  const seenChanges = new Set<string>(), seenRequests = new Set<string>();
  for (const change of changes) {
    exact(change, changeColumns);
    if (typeof change.change_id !== "string" || !change.change_id || change.change_id.length > 100 ||
      seenChanges.has(change.change_id) || change.item_id !== id ||
      !["create", "update", "status", "archive", "unarchive", "link", "source", "revert"].includes(String(change.kind)) ||
      !["user", "assistant", "other"].includes(String(change.actor)) || !stamp(change.at) ||
      !Number.isSafeInteger(change.revision_after) || Number(change.revision_after) < 1 ||
      Number(change.revision_after) > Number(item.revision) ||
      (change.batch_id !== null && typeof change.batch_id !== "string") ||
      (change.reverted_by !== null && typeof change.reverted_by !== "string") ||
      (change.before_json !== null && !plain(parse(change.before_json))) ||
      !plain(parse(change.after_json))) invalid();
    seenChanges.add(change.change_id);
  }
  for (const request of requests) {
    exact(request, requestColumns);
    if (typeof request.request_id !== "string" || !request.request_id ||
      request.request_id.length > 500 || seenRequests.has(request.request_id) ||
      request.item_id !== id || !stamp(request.created_at)) invalid();
    seenRequests.add(request.request_id);
  }
  return { project: project as { id: string; title: string } | null, item, changes, requests };
}

function insert(db: DatabaseSync, table: string, columns: readonly string[], row: Row): void {
  db.prepare("INSERT INTO " + table + " (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") + ")")
    .run(...columns.map(column => row[column] as string | number | null));
}
function upsert(db: DatabaseSync, table: string, columns: readonly string[], identity: string, row: Row): void {
  db.prepare("INSERT INTO " + table + " (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") +
    ") ON CONFLICT(" + identity + ") DO UPDATE SET " + columns.filter(column => column !== identity).map(column => column + "=excluded." + column).join(","))
    .run(...columns.map(column => row[column] as string | number | null));
}
function object(value: unknown): Record<string, unknown> {
  if (!plain(value)) invalid();
  return value as Record<string, unknown>;
}
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(row: Record<string, unknown>, columns: readonly string[]): void {
  if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column))) invalid();
}
function parse(value: unknown): unknown {
  if (typeof value !== "string") invalid();
  try { return JSON.parse(value); } catch { return invalid(); }
}
function stamp(value: unknown): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function optionalInstant(value: unknown): boolean { return value === null || typeof value === "string" && isTodoInstant(value); }
function optionalDate(value: unknown): boolean { return value === null || typeof value === "string" && isTodoDate(value); }
function optionalTime(value: unknown): boolean { return value === null || typeof value === "string" && isTodoTime(value); }
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("待办及历史超过当前同步上限（512 KiB），原数据仍保留在本机", "sync.limit");
}
function invalid(message = "待办同步数据不合法", code: ConstructorParameters<typeof PluginSyncError>[0] = "sync.invalid"): never {
  throw new PluginSyncError(code, message);
}
