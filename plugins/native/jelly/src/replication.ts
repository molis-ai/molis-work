import type { DatabaseSync } from "node:sqlite";
import type { JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { PluginSyncError, type PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica, initializeReplica, readDatabaseSpace, replicaMarkSql, replicaTransaction,
  type AggregateReplicaContext,
} from "@molis-ai/molis-work-storage";
import { validateJellyWorkspace } from "./calendar.js";
import { jellyHash, validateJellyContent } from "./content.js";

export const jellySync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "jelly_workspace", title: "Jelly 日历与笔记", schema_version: 1, requires: [] }],
};

const KEY = JSON.stringify(["jelly", "workspace"]);
const LIMIT = 512 * 1024;
type Row = { revision: number; body: string; checksum: string };

/** The editable workspace is portable; temporary previews, undo history and source imports stay on their device. */
export function initializeJellyReplication(db: DatabaseSync): void {
  if (readDatabaseSpace(db)?.kind !== "personal") return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='jelly_replica_update'").get()) {
      const current = db.prepare("SELECT revision FROM jelly_workspace WHERE singleton=1").get() as { revision: number };
      if (current.revision > 0) db.prepare("INSERT INTO replica_changes(key) VALUES (?)").run(KEY);
      db.exec("CREATE TRIGGER jelly_replica_update AFTER UPDATE ON jelly_workspace BEGIN " +
        replicaMarkSql("'" + KEY + "'") + " END");
    }
  });
}

export function createJellyReplica(db: DatabaseSync, context: AggregateReplicaContext): SyncReplicaAdapter {
  const space = readDatabaseSpace(db);
  if (space?.kind !== "personal" || space.spaceId !== context.spaceId) invalid("同步空间不匹配", "sync.scope");
  const key = (value: string) => {
    if (value !== KEY) invalid();
  };
  return createSqliteReplica(db, {
    authorize: context.authorize,
    read(id) {
      key(id);
      const row = db.prepare("SELECT revision,body,checksum FROM jelly_workspace WHERE singleton=1").get() as Row | undefined;
      if (!row || jellyHash(row.body) !== row.checksum) invalid("Jelly 本地数据校验失败");
      const workspace = JSON.parse(row.body) as JellyWorkspace;
      validate(workspace);
      // The import receipt may contain a machine-specific source and is not needed to use the resulting notes.
      const { imported_sources: _localImportReceipts, ...portable } = workspace;
      const value = { format: 1, spaceId: context.spaceId, workspace: portable };
      size(value);
      return value;
    },
    apply(id, value) {
      key(id);
      if (value === null) invalid("Jelly 工作区不能由远端删除");
      size(value);
      const envelope = object(value);
      exact(envelope, ["format", "spaceId", "workspace"]);
      if (envelope.format !== 1 || envelope.spaceId !== context.spaceId) invalid("同步空间不匹配", "sync.scope");
      const wire = object(envelope.workspace);
      const allowed = ["schema_version", "revision", "categories", "items", "series", "notes", "relations", "relation_overrides", "task_links", "applied_plan_ids"];
      if (Object.keys(wire).some(field => !allowed.includes(field)) || Object.hasOwn(wire, "imported_sources")) invalid();
      const incoming: JellyWorkspace = JSON.parse(JSON.stringify(wire));
      validate(incoming);
      const local = db.prepare("SELECT revision,body,checksum FROM jelly_workspace WHERE singleton=1").get() as Row;
      if (jellyHash(local.body) !== local.checksum) invalid("Jelly 本地数据校验失败");
      const previous = JSON.parse(local.body) as JellyWorkspace;
      validate(previous);
      const next = { ...incoming, revision: Math.max(previous.revision, incoming.revision) + 1,
        imported_sources: previous.imported_sources };
      for (const note of next.notes) {
        const high = db.prepare("SELECT revision FROM jelly_note_versions WHERE id=?").get(note.id) as { revision: number } | undefined;
        note.revision = Math.max(note.revision, high?.revision ?? -1) + 1;
      }
      validate(next);
      const body = JSON.stringify(next);
      db.prepare("UPDATE jelly_workspace SET revision=?,body=?,checksum=? WHERE singleton=1").run(next.revision, body, jellyHash(body));
      for (const note of next.notes) db.prepare("INSERT INTO jelly_note_versions(id,revision) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)")
        .run(note.id, note.revision);
      db.exec("DELETE FROM jelly_history; DELETE FROM jelly_previews;");
    },
  });
}

function validate(workspace: JellyWorkspace): void {
  try { validateJellyWorkspace(workspace); validateJellyContent(workspace); }
  catch { invalid("Jelly 工作区数据无效"); }
}
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("Jelly 工作区超过当前同步上限（512 KiB），原数据仍保留在本机", "sync.limit");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, columns: readonly string[]): void {
  if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column))) invalid();
}
function invalid(message = "Jelly 同步数据不合法", code: ConstructorParameters<typeof PluginSyncError>[0] = "sync.invalid"): never {
  throw new PluginSyncError(code, message);
}
