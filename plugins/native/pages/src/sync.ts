import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PluginSyncError, type PluginSyncSnapshot, type PluginSyncSnapshotAdapter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { StorageSpace } from "@molis-ai/molis-work-contracts/platform/storage";
import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/pages";
import { parsePagesBody } from "./document.js";
import { pagesSyncDeclaration } from "./sync-declaration.js";
import { replicaTransaction } from '@molis-ai/molis-work-storage';

/** Trusted local Host callbacks, never values deserialized from HTTP or a snapshot. */
export interface PagesSyncContext {
  readonly spaceId: string;
  readonly projectId: string;
  /** Recheck current account, selected policy, plugin lifetime and project authority. Must be synchronous. */
  readonly authorize: (operation: "read" | "apply") => void;
  readonly hasReference: (reference: { owner: "goals" | "artifacts"; assetId: string; version?: number }) => boolean;
}

interface Folder { id: string; title: string; created_at: string; updated_at: string }
interface Document extends Folder {
  body: PagesBody; folder_id: string; starred: boolean; goal_id: string;
  artifact_id: string; artifact_version: number;
}
interface Payload { folders: Folder[]; documents: Document[] }
const identity = { plugin_id: PAGES_PLUGIN_ID, publisher_id: "molis", publisher_signature: "official-pages-binding" } as const;
const MAX_RECORDS = 1000;
const MAX_BYTES = 16 * 1024 * 1024;

/** Counter only, NOT an incremental journal. Triggers cover every existing SQL mutation path. */
export function initializePagesSyncRevision(db: DatabaseSync): void {
  transaction(db, () => {
    db.exec("CREATE TABLE IF NOT EXISTS pages_sync_revisions (project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL)");
    // Preserve a high-water mark for pre-adapter data, including stale editor versions.
    db.exec(`INSERT OR IGNORE INTO pages_sync_revisions(project_id, revision)
      SELECT project_id, SUM(weight) FROM (
        SELECT project_id, version AS weight FROM pages UNION ALL SELECT project_id, 1 AS weight FROM folders
      ) GROUP BY project_id`);
    for (const table of ["pages", "folders"]) {
      const bump = (row: "NEW" | "OLD") => `INSERT INTO pages_sync_revisions(project_id, revision) VALUES (${row}.project_id, 1)
        ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;`;
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_sync_insert AFTER INSERT ON ${table} BEGIN ${bump("NEW")} END;
        CREATE TRIGGER IF NOT EXISTS ${table}_sync_delete AFTER DELETE ON ${table} BEGIN ${bump("OLD")} END;
        CREATE TRIGGER IF NOT EXISTS ${table}_sync_update AFTER UPDATE ON ${table} BEGIN
          ${bump("NEW")}
          INSERT INTO pages_sync_revisions(project_id, revision) SELECT OLD.project_id, 1 WHERE OLD.project_id <> NEW.project_id
            ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
        END;
      `);
    }
  });
}

/** Owner implementation; not exported as a SQL-taking API from the package entrypoint. */
export function createPagesSyncAdapter(db: DatabaseSync, storedSpace: StorageSpace | undefined, caller: PagesSyncContext): PluginSyncSnapshotAdapter {
  if (!storedSpace || storedSpace.kind !== "personal" || storedSpace.spaceId !== caller.spaceId) {
    throw new PluginSyncError("sync.scope", "仅支持已绑定的个人空间，不迁移本地空间数据");
  }
  // Capture immutable identity and trusted functions; later mutation of caller cannot switch scope.
  const { spaceId, projectId, authorize, hasReference } = caller;
  text(projectId, 80);
  if (typeof authorize !== "function" || typeof hasReference !== "function") invalid("缺少宿主校验");
  const check = (operation: "read" | "apply") => {
    const result: unknown = authorize(operation);
    if (result !== undefined) invalid("宿主授权检查必须同步完成");
  };
  const revision = () => {
    const value = (db.prepare("SELECT revision FROM pages_sync_revisions WHERE project_id = ?").get(projectId) as { revision: number } | undefined)?.revision ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) throw new PluginSyncError("sync.limit", "本地修订计数无效");
    return String(value);
  };
  const snapshot = (): PluginSyncSnapshot => ({ protocol_version: 1, ...identity, spaceId, projectId,
    collection_id: "documents", schema_version: 1, source_revision: revision(), payload: readPayload(db, projectId) });
  const idle = () => {
    if (db.prepare("SELECT 1 FROM pages WHERE project_id = ? AND publication_pending_json IS NOT NULL LIMIT 1").get(projectId)
      || db.prepare("SELECT 1 FROM page_generations WHERE project_id = ? AND json_extract(record_json, '$.status') = 'running' LIMIT 1").get(projectId)) {
      throw new PluginSyncError("sync.busy", "请先完成或恢复文档生成、成果发布");
    }
  };
  return Object.freeze({
    declaration: pagesSyncDeclaration,
    read(collectionId: string): PluginSyncSnapshot {
      check("read");
      if (collectionId !== "documents") throw new PluginSyncError("sync.unsupported", "不支持这个同步集合");
      return transaction(db, () => { idle(); const result = snapshot(); check("read"); return result; });
    },
    apply(input: PluginSyncSnapshot, expectedRevision: string) {
      check("apply");
      if (!input || input.spaceId !== spaceId || input.projectId !== projectId
        || input.plugin_id !== identity.plugin_id || input.publisher_id !== identity.publisher_id
        || input.publisher_signature !== identity.publisher_signature) throw new PluginSyncError("sync.scope", "快照不属于当前空间、项目或插件身份");
      if (input.protocol_version !== 1 || input.collection_id !== "documents" || input.schema_version !== 1) {
        throw new PluginSyncError("sync.unsupported", "快照数据格式不兼容，原数据已保留");
      }
      text(input.source_revision, 100);
      if (typeof expectedRevision !== "string" || !/^(0|[1-9]\d*)$/.test(expectedRevision)) invalid("缺少目标设备的修订前提");
      const payload = parsePayload(input.payload);
      return transaction(db, () => {
        idle();
        for (const document of payload.documents) {
          if (document.goal_id && hasReference({ owner: "goals", assetId: document.goal_id }) !== true) missing("关联目标尚未到达");
          if (document.artifact_id && hasReference({ owner: "artifacts", assetId: document.artifact_id, version: document.artifact_version }) !== true) missing("关联成果版本尚未到达");
        }
        const current = readPayload(db, projectId);
        check("apply");
        if (digest(current) === digest(payload)) return { status: "unchanged" as const, revision: revision() };
        if (revision() !== expectedRevision) throw new PluginSyncError("sync.conflict", "本地文档已改变，原内容已保留");
        // IDs are global within this owner Store; never steal another project's record.
        for (const [table, records] of [["folders", payload.folders], ["pages", payload.documents]] as const) {
          for (const record of records) {
            const existing = db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).get(record.id) as { project_id: string } | undefined;
            if (existing && existing.project_id !== projectId) throw new PluginSyncError("sync.scope", "资产标识与其他项目冲突");
          }
        }
        const documents = new Set(payload.documents.map(row => row.id));
        const folders = new Set(payload.folders.map(row => row.id));
        for (const row of current.documents) if (!documents.has(row.id)) db.prepare("DELETE FROM pages WHERE id = ? AND project_id = ?").run(row.id, projectId);
        for (const row of current.folders) if (!folders.has(row.id)) db.prepare("DELETE FROM folders WHERE id = ? AND project_id = ?").run(row.id, projectId);
        const oldFolders = new Map(current.folders.map(row => [row.id, row]));
        for (const row of payload.folders) {
          if (oldFolders.has(row.id) && digest(oldFolders.get(row.id)) === digest(row)) continue;
          db.prepare(`INSERT INTO folders(id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, created_at=excluded.created_at, updated_at=excluded.updated_at`)
            .run(row.id, projectId, row.title, row.created_at, row.updated_at);
        }
        const oldDocuments = new Map(current.documents.map(row => [row.id, row]));
        for (const row of payload.documents) {
          if (oldDocuments.has(row.id) && digest(oldDocuments.get(row.id)) === digest(row)) continue;
          db.prepare(`INSERT INTO pages(id, project_id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, body_json=excluded.body_json, folder_id=excluded.folder_id,
              starred=excluded.starred, goal_id=excluded.goal_id, artifact_id=excluded.artifact_id, artifact_version=excluded.artifact_version,
              created_at=excluded.created_at, updated_at=excluded.updated_at, version=pages.version + 1`)
            .run(row.id, projectId, row.title, JSON.stringify(row.body), row.folder_id, row.starred ? 1 : 0,
              row.goal_id, row.artifact_id, row.artifact_version, row.created_at, row.updated_at, Number(revision()) + 1);
        }
        check("apply");
        return { status: "applied" as const, revision: revision() };
      });
    },
  });
}

function readPayload(db: DatabaseSync, projectId: string): Payload {
  for (const table of ["pages", "folders"]) {
    const count = db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE project_id = ?`).get(projectId) as { total: number };
    if (count.total > MAX_RECORDS) throw new PluginSyncError("sync.limit", "集合过大，需等待分页增量同步支持");
  }
  const size = db.prepare("SELECT COALESCE(SUM(length(CAST(body_json AS BLOB))), 0) AS bytes FROM pages WHERE project_id = ?").get(projectId) as { bytes: number };
  if (size.bytes > MAX_BYTES) throw new PluginSyncError("sync.limit", "快照过大，需等待分页增量同步支持");
  const folders = db.prepare("SELECT id, title, created_at, updated_at FROM folders WHERE project_id = ? ORDER BY id").all(projectId);
  const documents = db.prepare(`SELECT id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at
    FROM pages WHERE project_id = ? ORDER BY id`).all(projectId).map(row => {
      const { body_json, starred, ...rest } = row;
      return { ...rest, body: JSON.parse(String(body_json)), starred: Boolean(starred) };
    });
  return parsePayload({ folders, documents });
}

function parsePayload(input: unknown): Payload {
  let encoded: string;
  try { encoded = JSON.stringify(input); } catch { invalid("快照不是 JSON 数据"); }
  if (!encoded) invalid("缺少快照内容");
  if (Buffer.byteLength(encoded, "utf8") > MAX_BYTES) throw new PluginSyncError("sync.limit", "快照过大");
  const object = record(JSON.parse(encoded), ["folders", "documents"]);
  if (!Array.isArray(object.folders) || !Array.isArray(object.documents)
    || object.folders.length > MAX_RECORDS || object.documents.length > MAX_RECORDS) invalid("快照集合不合法");
  const base = (row: Record<string, unknown>, titleLimit: number): Folder => ({ id: text(row.id, 80), title: text(row.title, titleLimit),
    created_at: date(row.created_at), updated_at: date(row.updated_at) });
  const folders = object.folders.map(value => base(record(value, ["id", "title", "created_at", "updated_at"]), 40));
  unique(folders);
  const folderIds = new Set(folders.map(row => row.id));
  const documents = object.documents.map((value): Document => {
    const row = record(value, ["id", "title", "created_at", "updated_at", "body", "folder_id", "starred", "goal_id", "artifact_id", "artifact_version"]);
    const folder_id = text(row.folder_id, 80, true);
    if (folder_id && !folderIds.has(folder_id)) missing("快照缺少文档所属文件夹");
    const artifact_id = text(row.artifact_id, 80, true);
    if (typeof row.starred !== "boolean" || !Number.isSafeInteger(row.artifact_version)
      || Number(row.artifact_version) < 0 || (artifact_id ? Number(row.artifact_version) < 1 : row.artifact_version !== 0)) invalid("文档元数据不合法");
    if (!row.body) invalid("快照缺少文档正文");
    portable(row.body, 0);
    const body = parsePagesBody(row.body);
    return { ...base(row, 80), body, folder_id, starred: row.starred, goal_id: text(row.goal_id, 80, true), artifact_id, artifact_version: Number(row.artifact_version) };
  });
  unique(documents);
  const sort = (a: Folder, b: Folder) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return { folders: folders.sort(sort), documents: documents.sort(sort) };
}

function portable(value: unknown, depth: number): void {
  if (depth > 64) invalid("文档嵌套过深");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "src" || key === "href") && typeof child === "string" && child
      && !/^(https?:\/\/|mailto:|#|data:image\/(png|jpeg|gif|webp);base64,)/i.test(child)) {
      throw new PluginSyncError("sync.dependencies", "文档包含本机或相对链接，需先转换为可同步资源引用");
    }
    portable(child, depth + 1);
  }
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("快照字段须是对象");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row))) invalid("快照字段不匹配");
  return row;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || value !== value.trim()) invalid("快照文字字段不合法");
  return value;
}
function date(value: unknown): string {
  const result = text(value, 40);
  if (!Number.isFinite(Date.parse(result)) || !/(Z|[+-]\d{2}:\d{2})$/.test(result)) invalid("快照时间不合法");
  return result;
}
function unique(rows: Folder[]): void { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid("快照包含重复资产"); }
function digest(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, stable(child)])) : item;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function transaction<T>(db: DatabaseSync, work: () => T): T {
  return replicaTransaction(db, work);
}
function invalid(message: string): never { throw new PluginSyncError("sync.invalid", message); }
function missing(message: string): never { throw new PluginSyncError("sync.dependencies", message); }
