import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import { ensureSqliteColumn, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type { PagesBody, PagesFolder, PagesRecord, PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { pagesTemplateById } from "./templates.js";
import type { PagesPublicationIntent, PagesPublicationSnapshot } from "./promote.js";

interface PagesRow {
  id: string;
  project_id: string;
  title: string;
  body_json: string;
  folder_id: string;
  starred: number;
  goal_id: string;
  artifact_id: string;
  artifact_version: number;
  publication_pending_json?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface FolderRow {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface PagesImportDocumentsInput {
  readonly project_id: string;
  readonly request_id: string;
  readonly request_hash: string;
  readonly folder_id?: string;
  readonly documents: readonly { readonly title: string; readonly body: PagesBody }[];
}

export class PagesStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  hasProjectData(projectId: string): boolean {
    return ["pages", "folders", "page_generations", "page_imports"].some(table => Boolean(this.db.prepare(`SELECT 1 FROM ${table} WHERE project_id = ? LIMIT 1`).get(projectId)));
  }

  /** Host must prove the old partition belongs uniquely to this project before calling. */
  migrateProjectScope(previous: string, projectId: string): void {
    if (previous === projectId) return;
    normalizeProjectId(previous); normalizeProjectId(projectId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const generations = this.generations(previous);
      if (generations.some(record => record.status === "running" && Date.now() - Date.parse(record.updated_at) < 180_000)) throw new PagesError("pages.legacy_running", "旧文稿仍在生成，请完成后重新打开");
      for (const table of ["page_generations", "page_imports"]) {
        const collision = this.db.prepare(`SELECT 1 FROM ${table} a JOIN ${table} b ON a.request_id = b.request_id WHERE a.project_id = ? AND b.project_id = ? LIMIT 1`).get(previous, projectId);
        if (collision) throw new PagesError("pages.legacy_conflict", "旧文稿请求与当前项目冲突，原数据已保留，请先修复关联");
      }
      for (const page of this.list(previous)) {
        const rewrite = (node: unknown): unknown => {
          if (Array.isArray(node)) return node.map(rewrite);
          if (!node || typeof node !== "object") return node;
          const record = node as Record<string, unknown>;
          return Object.fromEntries(Object.entries(record).map(([key, value]) => [key,
            key === "href" && typeof value === "string" && value.startsWith(`/projects/${encodeURIComponent(previous)}/?inbox_entry=`)
              ? `/projects/${encodeURIComponent(projectId)}/` + value.slice(`/projects/${encodeURIComponent(previous)}/`.length) : rewrite(value)]));
        };
        this.db.prepare("UPDATE pages SET project_id = ?, body_json = ?, version = version + 1 WHERE id = ?").run(projectId, JSON.stringify(rewrite(page.body)), page.id);
      }
      this.db.prepare("UPDATE folders SET project_id = ? WHERE project_id = ?").run(projectId, previous);
      this.db.prepare("UPDATE page_imports SET project_id = ? WHERE project_id = ?").run(projectId, previous);
      for (const record of generations) {
        const next = { ...record, project_id: projectId, ...(record.status === "running" ? { status: "failed" as const, error: "上次生成已中断，材料已保留，请重试" } : {}) };
        this.saveGeneration(next);
      }
      this.db.prepare("DELETE FROM page_generations WHERE project_id = ?").run(previous);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  generation(projectId: string, requestId: string): PagesGenerationRecord | null {
    const row = this.db.prepare("SELECT record_json FROM page_generations WHERE project_id = ? AND request_id = ?")
      .get(projectId, requestId) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) as PagesGenerationRecord : null;
  }

  generations(projectId: string): PagesGenerationRecord[] {
    return (this.db.prepare("SELECT record_json FROM page_generations WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as Array<{ record_json: string }>).map((row) => JSON.parse(row.record_json) as PagesGenerationRecord);
  }

  beginGeneration(record: PagesGenerationRecord): PagesGenerationRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.generation(record.project_id, record.request_id);
      if (prior?.request_hash && prior.request_hash !== record.request_hash) throw new PagesError("pages.invalid", "同一个请求的材料或要求已改变，请重新生成");
      if (prior?.status === "completed") { this.db.exec("COMMIT"); return prior; }
      if (prior?.status === "running" && Date.now() - Date.parse(prior.updated_at) < 180_000) throw new PagesError("pages.unavailable", "这份文稿仍在生成，请稍后查看结果");
      const next = { ...(prior ?? record), status: "running" as const, error: null, updated_at: new Date(Math.max(Date.now(), prior ? Date.parse(prior.updated_at) + 1 : 0)).toISOString() };
      this.saveGeneration(next);
      this.db.exec("COMMIT");
      return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  completeGeneration(record: PagesGenerationRecord, body: PagesBody): PagesRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.generation(record.project_id, record.request_id);
      if (prior?.status === "completed" && prior.document_id) {
        const document = this.get(prior.document_id, record.project_id);
        this.db.exec("COMMIT"); return document;
      }
      if (!prior || prior.status !== "running" || prior.updated_at !== record.updated_at) throw new PagesError("pages.unavailable", "此请求已由另一次处理接续，请查看最新结果");
      const document = this.create({ project_id: record.project_id, title: record.title, body });
      this.saveGeneration({ ...record, status: "completed", document_id: document.id, error: null, updated_at: new Date().toISOString() });
      this.db.exec("COMMIT");
      return document;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  failGeneration(record: PagesGenerationRecord, message: string): void {
    const next = { ...record, status: "failed", error: message.slice(0, 500), updated_at: new Date(Math.max(Date.now(), Date.parse(record.updated_at) + 1)).toISOString() };
    this.db.prepare("UPDATE page_generations SET updated_at = ?, record_json = ? WHERE project_id = ? AND request_id = ? AND updated_at = ? AND json_extract(record_json, '$.status') = 'running'")
      .run(next.updated_at, JSON.stringify(next), record.project_id, record.request_id, record.updated_at);
  }

  private saveGeneration(record: PagesGenerationRecord): void {
    this.db.prepare("INSERT INTO page_generations (project_id, request_id, updated_at, record_json) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, request_id) DO UPDATE SET updated_at = excluded.updated_at, record_json = excluded.record_json")
      .run(record.project_id, record.request_id, record.updated_at, JSON.stringify(record));
  }

  list(projectId: string): PagesRecord[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM pages WHERE project_id = ? ORDER BY starred DESC, datetime(updated_at) DESC, title COLLATE NOCASE",
    ).all(project_id) as unknown as PagesRow[];
    return rows.map(fromPageRow);
  }

  listFolders(projectId: string): PagesFolder[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM folders WHERE project_id = ? ORDER BY title COLLATE NOCASE",
    ).all(project_id) as unknown as FolderRow[];
    return rows.map(fromFolderRow);
  }

  get(id: string, projectId?: string): PagesRecord {
    const row = this.db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as PagesRow | undefined;
    if (!row) throw new PagesError("pages.not_found", "找不到这篇文档");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new PagesError("pages.not_found", "找不到这篇文档");
    }
    return fromPageRow(row);
  }

  create(input: {
    title?: string;
    project_id: string;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    template_id?: string;
    body?: PagesBody;
  }): PagesRecord {
    const now = new Date().toISOString();
    const template = input.template_id ? pagesTemplateById(input.template_id) : undefined;
    if (input.template_id && !template) throw new PagesError("pages.invalid", "找不到这份模板");
    const project_id = normalizeProjectId(input.project_id);
    const folder_id = normalizeFolderId(input.folder_id, this, project_id);
    const rawBody = input.body ?? template?.body ?? { type: "doc", content: [...(EMPTY_PAGES_BODY.content ?? [])] };
    const record: PagesRecord = {
      id: crypto.randomUUID(),
      project_id,
      title: normalizeTitle(input.title ?? template?.title ?? "未命名文档"),
      body: parsePagesBody(JSON.parse(JSON.stringify(rawBody))),
      folder_id,
      starred: Boolean(input.starred),
      goal_id: normalizeGoalId(input.goal_id),
      artifact_id: "",
      artifact_version: 0,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    this.db.prepare(
      "INSERT INTO pages (id, project_id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      record.id, record.project_id, record.title, JSON.stringify(record.body),
      record.folder_id, record.starred ? 1 : 0, record.goal_id, record.artifact_id, record.artifact_version,
      record.created_at, record.updated_at, record.version,
    );
    return record;
  }

  /** Create a selected batch once; a retry returns current records without overwriting edits. */
  importDocuments(input: PagesImportDocumentsInput): PagesRecord[] {
    const project_id = normalizeProjectId(input.project_id);
    if (!input.documents.length || input.documents.length > 100) throw new PagesError("pages.invalid", "请选择 1 到 100 篇文档");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db.prepare("SELECT request_hash, document_ids_json FROM page_imports WHERE project_id = ? AND request_id = ?")
        .get(project_id, input.request_id) as { request_hash: string; document_ids_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== input.request_hash) {
          throw new PagesError("pages.unavailable", "这次导入的文件、选择或文件夹已改变，请重新预览后导入");
        }
        const ids = JSON.parse(prior.document_ids_json) as string[];
        const documents = ids.map((id) => {
          try { return this.get(id, project_id); }
          catch (error) {
            if (error instanceof PagesError && error.code === "pages.not_found") {
              throw new PagesError("pages.unavailable", "这批导入已完成，但部分文档已删除；不会重新创建");
            }
            throw error;
          }
        });
        this.db.exec("COMMIT");
        return documents;
      }
      const folder_id = normalizeFolderId(input.folder_id, this, project_id);
      const documents = input.documents.map((document) => this.create({
        project_id,
        folder_id,
        title: document.title,
        body: document.body,
      }));
      this.db.prepare("INSERT INTO page_imports (project_id, request_id, request_hash, document_ids_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(project_id, input.request_id, input.request_hash, JSON.stringify(documents.map((document) => document.id)), new Date().toISOString());
      this.db.exec("COMMIT");
      return documents;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  update(id: string, patch: {
    title?: string;
    body?: PagesBody;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    artifact_id?: string;
    artifact_version?: number;
    expected_version?: number;
  }, projectId?: string): PagesRecord {
    const current = this.get(id, projectId);
    if (patch.expected_version !== undefined && patch.expected_version !== current.version) throw new PagesError("pages.conflict", "文档已被其他窗口修改，请重新读取后保存");
    const next: PagesRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      body: patch.body !== undefined ? parsePagesBody(patch.body) : current.body,
      folder_id: patch.folder_id !== undefined
        ? normalizeFolderId(patch.folder_id, this, current.project_id)
        : current.folder_id,
      starred: patch.starred !== undefined ? Boolean(patch.starred) : current.starred,
      goal_id: patch.goal_id !== undefined ? normalizeGoalId(patch.goal_id) : current.goal_id,
      artifact_id: patch.artifact_id !== undefined ? String(patch.artifact_id) : current.artifact_id,
      artifact_version: patch.artifact_version !== undefined ? Number(patch.artifact_version) || 0 : current.artifact_version,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.prepare(
      "UPDATE pages SET title = ?, body_json = ?, folder_id = ?, starred = ?, goal_id = ?, artifact_id = ?, artifact_version = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
    ).run(
      next.title, JSON.stringify(next.body), next.folder_id, next.starred ? 1 : 0,
      next.goal_id, next.artifact_id, next.artifact_version,
      next.updated_at, next.version, id, current.version,
    );
    if (result.changes !== 1) throw new PagesError("pages.conflict", "文档已被其他窗口修改，请重新读取后保存");
    return next;
  }

  beginPublication(id: string, projectId: string, actorId: string, goalId?: string, expectedVersion?: number, existing?: PagesPublicationSnapshot): PagesPublicationIntent {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(id, projectId);
      const pending = this.publicationIntent(id);
      if (expectedVersion !== undefined && current.version !== expectedVersion) throw new PagesError("pages.conflict", "文档已改变，请重新读取后保存成果");
      if (pending) {
        if (pending.actor_id !== actorId) throw new PagesError("pages.publication_owner", "请由上次保存的发起者恢复发布，原快照已保留");
        if (goalId !== undefined && goalId !== pending.goal_id) throw new PagesError("pages.publication_pending", "请先恢复上次保存的成果，再关联新的 Goal");
        this.db.exec("COMMIT"); return pending;
      }
      const intent: PagesPublicationIntent = { title: existing?.title ?? current.title, body: existing?.body ?? current.body,
        goal_id: existing?.goal_id ?? normalizeGoalId(goalId ?? current.goal_id), original_goal_id: existing?.goal_id ?? current.goal_id,
        version: current.artifact_version + 1, source_version: current.version, actor_id: actorId };
      this.db.prepare("UPDATE pages SET publication_pending_json = ? WHERE id = ?").run(JSON.stringify(intent), id);
      this.db.exec("COMMIT"); return intent;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  completePublication(id: string, projectId: string, intent: PagesPublicationIntent, artifact: { artifact_id: string; version: number }): PagesRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(id, projectId);
      if (current.artifact_id === artifact.artifact_id && current.artifact_version >= intent.version) {
        this.db.exec("COMMIT"); return current;
      }
      const pending = this.publicationIntent(id);
      if (!pending || JSON.stringify(pending) !== JSON.stringify(intent)) throw new PagesError("pages.publication_conflict", "保存记录已改变，请重新读取文稿");
      this.update(id, { artifact_id: artifact.artifact_id, artifact_version: artifact.version,
        ...(current.goal_id === intent.original_goal_id ? { goal_id: intent.goal_id } : {}), expected_version: current.version }, projectId);
      this.db.prepare("UPDATE pages SET publication_pending_json = NULL WHERE id = ?").run(id);
      const document = this.get(id, projectId);
      this.db.exec("COMMIT"); return document;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private publicationIntent(id: string): PagesPublicationIntent | null {
    const row = this.db.prepare("SELECT publication_pending_json FROM pages WHERE id = ?").get(id) as { publication_pending_json: string | null } | undefined;
    return row?.publication_pending_json ? JSON.parse(row.publication_pending_json) as PagesPublicationIntent : null;
  }

  delete(id: string, projectId?: string): void {
    this.get(id, projectId);
    this.db.prepare("DELETE FROM pages WHERE id = ?").run(id);
  }

  extract(id: string, projectId: string): { document: PagesRecord; cards: number; created: PagesRecord[] } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(id, projectId);
      const extracted = extractFromPagesBody(current.title, current.body);
      const document = this.update(id, { body: extracted.body, expected_version: current.version }, projectId);
      const created = unpublishedKnowledgePages(this.list(projectId).map(page => page.title), extracted.knowledge)
        .map(page => this.create({ ...page, project_id: projectId, folder_id: current.folder_id }));
      this.db.exec("COMMIT");
      return { document, cards: extracted.cards, created };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  createFolder(input: { title?: string; project_id: string }): PagesFolder {
    const now = new Date().toISOString();
    const folder: PagesFolder = {
      id: crypto.randomUUID(),
      project_id: normalizeProjectId(input.project_id),
      title: normalizeFolderTitle(input.title ?? "未命名文件夹"),
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(
      "INSERT INTO folders (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(folder.id, folder.project_id, folder.title, folder.created_at, folder.updated_at);
    return folder;
  }

  getFolder(id: string, projectId?: string): PagesFolder {
    const row = this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as FolderRow | undefined;
    if (!row) throw new PagesError("pages.not_found", "找不到这个文件夹");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new PagesError("pages.not_found", "找不到这个文件夹");
    }
    return fromFolderRow(row);
  }

  updateFolder(id: string, patch: { title?: string }, projectId?: string): PagesFolder {
    const current = this.getFolder(id, projectId);
    const next: PagesFolder = {
      ...current,
      title: patch.title !== undefined ? normalizeFolderTitle(patch.title) : current.title,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare("UPDATE folders SET title = ?, updated_at = ? WHERE id = ?").run(next.title, next.updated_at, id);
    return next;
  }

  deleteFolder(id: string, projectId?: string): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.getFolder(id, projectId);
      this.db.prepare("UPDATE pages SET folder_id = '', version = version + 1, updated_at = ? WHERE folder_id = ?").run(new Date().toISOString(), id);
      this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

export function openPagesStore(homeDirectory: string): PagesStore {
  const db = openHomeSqliteDatabase(homeDirectory, "pages");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      body_json TEXT NOT NULL,
      folder_id TEXT NOT NULL DEFAULT '',
      starred INTEGER NOT NULL DEFAULT 0,
      goal_id TEXT NOT NULL DEFAULT '',
      artifact_id TEXT NOT NULL DEFAULT '',
      artifact_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureSqliteColumn(db, "pages", "folder_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "pages", "starred", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(db, "pages", "goal_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "pages", "artifact_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "pages", "artifact_version", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(db, "pages", "publication_pending_json", "TEXT");
  db.exec("CREATE TABLE IF NOT EXISTS page_generations (project_id TEXT NOT NULL, request_id TEXT NOT NULL, updated_at TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(project_id, request_id))");
  db.exec("CREATE TABLE IF NOT EXISTS page_imports (project_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id, request_id))");
  return new PagesStore(db);
}

function fromPageRow(row: PagesRow): PagesRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as PagesPublicationIntent : null;
  return {
    id: row.id,
    project_id: row.project_id ?? "",
    title: row.title,
    body: parsePagesBody(JSON.parse(row.body_json)),
    folder_id: row.folder_id ?? "",
    starred: Boolean(row.starred),
    goal_id: row.goal_id ?? "",
    artifact_id: row.artifact_id ?? "",
    artifact_version: Number(row.artifact_version) || 0,
    ...(pending ? { publication_pending: { version: pending.version, source_version: pending.source_version, goal_id: pending.goal_id } } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

function fromFolderRow(row: FolderRow): PagesFolder {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new PagesError("pages.invalid", "缺少项目");
  if (id.length > 80) throw new PagesError("pages.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名文档";
  if (title.length > 80) throw new PagesError("pages.invalid", "标题须为 1 到 80 个字");
  return title;
}

function normalizeFolderTitle(value: string): string {
  const title = value.trim() || "未命名文件夹";
  if (title.length > 40) throw new PagesError("pages.invalid", "文件夹名须为 1 到 40 个字");
  return title;
}

function normalizeGoalId(value: string | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new PagesError("pages.invalid", "Goal 须为文字");
  const id = value.trim();
  if (id.length > 80) throw new PagesError("pages.invalid", "Goal 标识过长");
  return id;
}

function normalizeFolderId(value: string | undefined, store: PagesStore, projectId: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new PagesError("pages.invalid", "文件夹须为文字");
  const id = value.trim();
  if (!id) return "";
  store.getFolder(id, projectId);
  return id;
}
