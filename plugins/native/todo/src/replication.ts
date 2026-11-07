import { syncError } from './sync-errors.js';
import type { PluginSyncCollectionDefinition, PluginSyncBusinessDatabase } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { TODO_STATUSES } from "./contract.js";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isTodoDate, isTodoInstant, isTodoTime } from "./dates.js";



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
const LIMIT = 100000000;

export function isImportedTodoChange(db: PluginSyncBusinessDatabase, id: string): boolean {
  return !!db.prepare("SELECT 1 FROM todo_imported_changes WHERE change_id=?").get(id);
}

export const todoCollection: PluginSyncCollectionDefinition = {
 tracking:[{table:"todo_items",key:[{literal:"todo"},{column:"id"}],revision:{table:"todo_editor_versions",key:[{column:"id",rowColumn:"id"}],column:"revision",rowColumn:"revision"}}],
 create(db,context){
  const decode = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== "todo" ||
      typeof parts[1] !== "string" || !parts[1] || parts[1].length > 100) invalid();
    return parts[1] as string;
  };
  const localProject=(id:string)=>db.prepare('SELECT project_id FROM todo_items WHERE id=?').get(id)
    ?? db.prepare('SELECT project_id FROM todo_deleted_projects WHERE id=?').get(id);
  return {
    authorizeKey(key,value){
      const id=decode(key),current=localProject(id);
      context.authorize();
      if(current?.project_id)context.project(String(current.project_id));
      if(value!==undefined&&value!==null){
        const project=object(value).project;
        if(project!==undefined&&project!==null){const id=object(project).id;if(typeof id!=='string'||!id||id.length>80)invalid();context.project(id);}
      }
    },
    canUpload(key){const project=localProject(decode(key))?.project_id;return !project||context.canUploadProject(String(project));},
    belongsToProject(key,projectId,retained){
      const id=decode(key);
      const current=db.prepare('SELECT project_id FROM todo_items WHERE id=?').get(id)
        ?? db.prepare('SELECT project_id FROM todo_deleted_projects WHERE id=?').get(id);
      if(current?.project_id===projectId)return true;
      return retained().some(event=>{
        if(event.key!==key)invalid('待办保留记录标识不一致');
        return event.value!==null&&validate(event.value,id,context.spaceId).project?.id===projectId;
      });
    },
    read(key) {
      const id = decode(key);
      const item = db.prepare("SELECT * FROM todo_items WHERE id=?").get(id) as Row | undefined;
      if (!item) return null;
      const changes = db.prepare("SELECT * FROM todo_changes WHERE item_id=? ORDER BY revision_after,at,change_id").all(id) as Row[];
      const requests = db.prepare("SELECT * FROM todo_requests WHERE item_id=? ORDER BY request_id").all(id) as Row[];
      const project = item.project_id ? { id: item.project_id, title: context.project(String(item.project_id)).title } : null;
      const value = { format: /* @version format.todo.portable */ 1, spaceId: context.spaceId, project, item, changes, requests };
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
      const sourceRevision = Number(wire.item.revision);
      const revision = Math.max(sourceRevision, old?.revision ?? 0, high?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) invalid("待办编辑版本超出安全范围");
      // Rebase history with the item: preserve undo eligibility and gaps, while invalidating stale editors.
      const offset = revision - sourceRevision;
      db.prepare("DELETE FROM todo_imported_changes WHERE change_id IN (SELECT change_id FROM todo_changes WHERE item_id=?)").run(id);
      db.prepare("DELETE FROM todo_changes WHERE item_id=?").run(id);
      db.prepare("DELETE FROM todo_requests WHERE item_id=?").run(id);
      upsert(db, "todo_items", itemColumns, "id", { ...wire.item, revision });
      for (const change of wire.changes) {
        insert(db, "todo_changes", changeColumns, { ...change, revision_after: Number(change.revision_after) + offset });
        db.prepare("INSERT OR IGNORE INTO todo_imported_changes(change_id,item_id) VALUES (?,?)").run(change.change_id as string,id);
      }
      for (const request of wire.requests) insert(db, "todo_requests", requestColumns, request);
    },
  };
 }
};

function validate(value: unknown, id: string, spaceId: string): {
  project: { id: string; title: string } | null; item: Row; changes: Row[]; requests: Row[];
} {
  const wire = object(value);
  exact(wire, ["format", "spaceId", "project", "item", "changes", "requests"]);
  if (wire.format !== /* @version format.todo.portable */ 1 || wire.spaceId !== spaceId) invalid("同步空间不匹配", "scope");
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

function insert(db: PluginSyncBusinessDatabase, table: string, columns: readonly string[], row: Row): void {
  db.prepare("INSERT INTO " + table + " (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") + ")")
    .run(...columns.map(column => row[column] as string | number | null));
}
function upsert(db: PluginSyncBusinessDatabase, table: string, columns: readonly string[], identity: string, row: Row): void {
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
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("待办及历史超过账号容量上限（100 MB），原数据仍保留在本机", "limit");
}
function invalid(message = "待办同步数据不合法", code: Parameters<typeof syncError>[0] = "invalid"): never {
  throw syncError(code, message);
}

export const todoSync: PluginSyncDeclaration = {
  protocol_version: /* @version sync.protocol */ 1,
  collections: [{ id: "todo_items", title: "待办与修改历史", schema_version: /* @version sync.collection.todo.todo_items */ 1, requires: [], tracking: todoCollection.tracking }],
};
