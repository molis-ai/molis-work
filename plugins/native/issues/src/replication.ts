import type { DatabaseSync } from "node:sqlite";
import { PluginSyncError, type PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica, initializeReplica, openBaselineHomeSqlite, readDatabaseSpace,
  replicaMarkSql, replicaTransaction, type AggregateReplicaContext,
} from "@molis-ai/molis-work-storage";
import { validateIssueImages, type IssueImage } from "./images.js";
import { ISSUES_DATABASE } from "./store.js";

export const issuesSync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "issues", title: "Issue 记录", schema_version: 1, requires: [] }],
};
const columns = [
  "id", "title", "type", "description", "context_json", "images_json",
  "submitter_id", "entered_via", "created_at", "updated_at", "version",
] as const;
const LIMIT = 512 * 1024;
type Row = Record<string, string | number | null>;

/** A sync-only view of Issue's existing Host-owned PluginDatabase file. */
export function openIssuesSyncStore(home: string, owner: string): {
  close(): void; replica(context: AggregateReplicaContext): SyncReplicaAdapter;
} {
  const db = openBaselineHomeSqlite(home, ISSUES_DATABASE.store_name, ISSUES_DATABASE);
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    initializeIssuesReplication(db, owner);
    return { close: () => db.close(), replica: context => createIssuesReplica(db, owner, context) };
  } catch (error) { db.close(); throw error; }
}

export function initializeIssuesReplication(db: DatabaseSync, owner: string): void {
  const space = readDatabaseSpace(db);
  if (space?.kind !== "personal" || space.ownerUserId !== owner) return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    db.exec("CREATE TABLE IF NOT EXISTS issue_sync_owner(id INTEGER PRIMARY KEY CHECK(id=1),owner_id TEXT NOT NULL)");
    db.prepare("INSERT OR IGNORE INTO issue_sync_owner(id,owner_id) VALUES (1,?)").run(owner);
    const saved = db.prepare("SELECT owner_id FROM issue_sync_owner WHERE id=1").get() as { owner_id: string };
    if (saved.owner_id !== owner) invalid("Issue 同步所有者不匹配", "sync.scope");
    db.exec("CREATE TABLE IF NOT EXISTS issue_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL)");
    db.exec("INSERT INTO issue_editor_versions SELECT id,version FROM issues WHERE 1 ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version)");
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='issues_replica_insert'").get()) {
      db.prepare("INSERT INTO replica_changes(key) SELECT json_array('issue',id) FROM issues WHERE submitter_id=? ORDER BY id").run(owner);
      for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
        const row = event === "DELETE" ? "OLD" : "NEW";
        db.exec("CREATE TRIGGER issues_replica_" + event.toLowerCase() + " AFTER " + event + " ON issues BEGIN " +
          replicaMarkSql("json_array('issue'," + row + ".id)", row + ".submitter_id=(SELECT owner_id FROM issue_sync_owner WHERE id=1)") +
          (event === "DELETE" ? "" : "INSERT INTO issue_editor_versions VALUES (" + row + ".id," + row + ".version) ON CONFLICT(id) DO UPDATE SET version=MAX(version,excluded.version);") +
          " END");
      }
    }
  });
}

export function createIssuesReplica(db: DatabaseSync, owner: string, context: AggregateReplicaContext): SyncReplicaAdapter {
  const space = readDatabaseSpace(db);
  if (space?.kind !== "personal" || space.spaceId !== context.spaceId || space.ownerUserId !== owner) invalid("Issue 同步空间不匹配", "sync.scope");
  const decode = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== "issue" ||
      typeof parts[1] !== "string" || !parts[1] || parts[1].length > 100) invalid();
    return parts[1] as string;
  };
  return createSqliteReplica(db, {
    authorize: context.authorize,
    read(key) {
      const id = decode(key);
      const row = db.prepare("SELECT * FROM issues WHERE id=? AND submitter_id=?").get(id, owner) as Row | undefined;
      if (!row) return null;
      const value = { format: 1, spaceId: context.spaceId, record: row };
      validate(value, id, owner, context.spaceId);
      size(value);
      return value;
    },
    apply(key, value) {
      const id = decode(key);
      if (value === null) {
        db.prepare("DELETE FROM issues WHERE id=? AND submitter_id=?").run(id, owner);
        return;
      }
      size(value);
      const row = validate(value, id, owner, context.spaceId);
      const current = db.prepare("SELECT submitter_id,version FROM issues WHERE id=?").get(id) as { submitter_id: string; version: number } | undefined;
      if (current && current.submitter_id !== owner) invalid("Issue 标识属于其他用户", "sync.scope");
      const high = db.prepare("SELECT version FROM issue_editor_versions WHERE id=?").get(id) as { version: number } | undefined;
      row.version = Math.max(Number(row.version), current?.version ?? 0, high?.version ?? 0) + 1;
      db.prepare("INSERT INTO issues (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") +
        ") ON CONFLICT(id) DO UPDATE SET " + columns.filter(column => column !== "id").map(column => column + "=excluded." + column).join(","))
        .run(...columns.map(column => row[column] as string | number | null));
    },
  });
}

function validate(value: unknown, id: string, owner: string, spaceId: string): Row {
  const envelope = object(value);
  exact(envelope, ["format", "spaceId", "record"]);
  if (envelope.format !== 1 || envelope.spaceId !== spaceId) invalid("Issue 同步空间不匹配", "sync.scope");
  const row = object(envelope.record) as Row;
  exact(row, columns);
  if (row.id !== id || row.submitter_id !== owner || typeof row.title !== "string" ||
    !row.title.trim() || row.title.length > 200 || typeof row.description !== "string" ||
    row.description.length > 100_000 || !["bug", "experience", "feature"].includes(String(row.type)) ||
    !["manual", "assistant", "mcp"].includes(String(row.entered_via)) ||
    !Number.isSafeInteger(row.version) || Number(row.version) < 1 ||
    !stamp(row.created_at) || !stamp(row.updated_at)) invalid();
  const context = object(parse(row.context_json));
  exact(context, ["recorded_at", "page", "caller"]);
  if (!stamp(context.recorded_at)) invalid();
  const actor = object(context.caller);
  exact(actor, ["actor_id", "audience"]);
  if (typeof actor.actor_id !== "string" || !actor.actor_id || actor.actor_id.length > 200 ||
    typeof actor.audience !== "string" || actor.audience.length > 40) invalid();
  if (context.page !== null) {
    const page = object(context.page);
    exact(page, ["url", "title", "provenance"]);
    if ((page.url !== null && (typeof page.url !== "string" || page.url.length > 2048)) ||
      (page.title !== null && (typeof page.title !== "string" || page.title.length > 500)) ||
      !["host_snapshot", "client_reported"].includes(String(page.provenance))) invalid();
  }
  const images = parse(row.images_json);
  try { validateIssueImages(images as IssueImage[]); } catch { invalid("Issue 图片内容不合法"); }
  return row;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) invalid();
}
function parse(value: unknown): unknown {
  if (typeof value !== "string") invalid();
  try { return JSON.parse(value); } catch { return invalid(); }
}
function stamp(value: unknown): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("Issue 记录超过当前同步上限（512 KiB），原数据仍保留在本机", "sync.limit");
}
function invalid(message = "Issue 同步数据不合法", code: ConstructorParameters<typeof PluginSyncError>[0] = "sync.invalid"): never {
  throw new PluginSyncError(code, message);
}
