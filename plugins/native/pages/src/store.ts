import { ensureSqliteColumn, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type { PagesBody, PagesFolder, PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { pagesTemplateById } from "./templates.js";

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

export class PagesStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
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

  update(id: string, patch: {
    title?: string;
    body?: PagesBody;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    artifact_id?: string;
    artifact_version?: number;
  }, projectId?: string): PagesRecord {
    const current = this.get(id, projectId);
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
    this.db.prepare(
      "UPDATE pages SET title = ?, body_json = ?, folder_id = ?, starred = ?, goal_id = ?, artifact_id = ?, artifact_version = ?, updated_at = ?, version = ? WHERE id = ?",
    ).run(
      next.title, JSON.stringify(next.body), next.folder_id, next.starred ? 1 : 0,
      next.goal_id, next.artifact_id, next.artifact_version,
      next.updated_at, next.version, id,
    );
    return next;
  }

  delete(id: string, projectId?: string): void {
    this.get(id, projectId);
    this.db.prepare("DELETE FROM pages WHERE id = ?").run(id);
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
    this.getFolder(id, projectId);
    this.db.prepare("UPDATE pages SET folder_id = '' WHERE folder_id = ?").run(id);
    this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
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
  return new PagesStore(db);
}

function fromPageRow(row: PagesRow): PagesRecord {
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
