import { ensureSqliteColumn, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type { PptRecord, PptSlide } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";

interface PptRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  color_primary: string;
  color_background: string;
  color_text: string;
  slides_json: string;
  created_at: string;
  updated_at: string;
  version: number;
  artifact_id?: string;
  artifact_version?: number;
}

const DEFAULT_PRIMARY = "#5e6ad2";
const DEFAULT_BACKGROUND = "#FCFCFB";
const DEFAULT_TEXT = "#292A2E";

export class PptStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): PptRecord[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM presentations WHERE project_id = ? ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE",
    ).all(project_id) as unknown as PptRow[];
    return rows.map(fromRow);
  }

  get(id: string, projectId?: string): PptRecord {
    const row = this.db.prepare("SELECT * FROM presentations WHERE id = ?").get(id) as PptRow | undefined;
    if (!row) throw new PptError("ppt.not_found", "找不到这份演示稿");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new PptError("ppt.not_found", "找不到这份演示稿");
    }
    return fromRow(row);
  }

  create(input: { title?: string; project_id: string }): PptRecord {
    const now = new Date().toISOString();
    const record: PptRecord = {
      id: crypto.randomUUID(),
      project_id: normalizeProjectId(input.project_id),
      title: normalizeTitle(input.title ?? "未命名演示稿"),
      description: "",
      color_primary: DEFAULT_PRIMARY,
      color_background: DEFAULT_BACKGROUND,
      color_text: DEFAULT_TEXT,
      slides: [blankSlide(1)],
      created_at: now,
      updated_at: now,
      version: 1,
      artifact_id: "",
      artifact_version: 0,
    };
    this.write(record, true);
    return record;
  }

  update(id: string, patch: {
    title?: string;
    description?: string;
    color_primary?: string;
    color_background?: string;
    color_text?: string;
    slides?: readonly PptSlide[];
  }, projectId?: string): PptRecord {
    const current = this.get(id, projectId);
    const next: PptRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      description: patch.description !== undefined ? normalizeDescription(patch.description) : current.description,
      color_primary: patch.color_primary !== undefined ? normalizeColor(patch.color_primary) : current.color_primary,
      color_background: patch.color_background !== undefined ? normalizeColor(patch.color_background) : current.color_background,
      color_text: patch.color_text !== undefined ? normalizeColor(patch.color_text) : current.color_text,
      slides: patch.slides !== undefined ? normalizeSlides(patch.slides) : current.slides,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    this.write(next, false);
    return next;
  }

  rememberArtifact(id: string, artifactId: string, artifactVersion: number, projectId?: string): PptRecord {
    const current = this.get(id, projectId);
    const updated_at = new Date().toISOString();
    this.db.prepare(
      "UPDATE presentations SET artifact_id = ?, artifact_version = ?, updated_at = ?, version = ? WHERE id = ?",
    ).run(artifactId, artifactVersion, updated_at, current.version + 1, id);
    return this.get(id, projectId);
  }

  delete(id: string, projectId?: string): void {
    this.get(id, projectId);
    this.db.prepare("DELETE FROM presentations WHERE id = ?").run(id);
  }

  private write(record: PptRecord, insert: boolean): void {
    if (insert) {
      this.db.prepare(
      "INSERT INTO presentations (id, project_id, title, description, color_primary, color_background, color_text, slides_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
        record.id, record.project_id, record.title, record.description, record.color_primary,
        record.color_background, record.color_text, JSON.stringify(record.slides),
        record.created_at, record.updated_at, record.version,
      );
      return;
    }
    this.db.prepare(
      "UPDATE presentations SET title = ?, description = ?, color_primary = ?, color_background = ?, color_text = ?, slides_json = ?, updated_at = ?, version = ? WHERE id = ?",
    ).run(
      record.title, record.description, record.color_primary, record.color_background,
      record.color_text, JSON.stringify(record.slides), record.updated_at, record.version, record.id,
    );
  }
}

export function openPptStore(homeDirectory: string): PptStore {
  const db = openHomeSqliteDatabase(homeDirectory, "ppt");
  db.exec(`
    CREATE TABLE IF NOT EXISTS presentations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      color_primary TEXT NOT NULL,
      color_background TEXT NOT NULL,
      color_text TEXT NOT NULL,
      slides_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL DEFAULT '',
      artifact_version INTEGER NOT NULL DEFAULT 0
    );
  `);
  ensureSqliteColumn(db, "presentations", "project_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "presentations", "artifact_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "presentations", "artifact_version", "INTEGER NOT NULL DEFAULT 0");
  return new PptStore(db);
}

function fromRow(row: PptRow): PptRecord {
  return {
    id: row.id,
    project_id: row.project_id ?? "",
    title: row.title,
    description: row.description,
    color_primary: row.color_primary,
    color_background: row.color_background,
    color_text: row.color_text,
    slides: JSON.parse(row.slides_json) as PptSlide[],
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
    artifact_id: row.artifact_id ?? "",
    artifact_version: Number(row.artifact_version) || 0,
  };
}

function blankSlide(order: number): PptSlide {
  return { id: crypto.randomUUID(), title: "", bullets: [], notes: "", order };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new PptError("ppt.invalid", "缺少项目");
  if (id.length > 80) throw new PptError("ppt.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名演示稿";
  if (title.length > 80) throw new PptError("ppt.invalid", "标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if (value.length > 2000) throw new PptError("ppt.invalid", "说明须为 0 到 2000 个字");
  return value;
}

function normalizeColor(value: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/u.test(value)) throw new PptError("ppt.invalid", "颜色须为 #RRGGBB");
  return value.toLowerCase();
}

function normalizeSlides(value: readonly PptSlide[]): PptSlide[] {
  if (!Array.isArray(value)) throw new PptError("ppt.invalid", "幻灯片须是列表");
  if (value.length === 0) throw new PptError("ppt.invalid", "至少保留一页");
  if (value.length > 40) throw new PptError("ppt.invalid", "最多 40 页");
  return value.map((slide, index) => ({
    id: slide.id || crypto.randomUUID(),
    title: String(slide.title ?? "").trim().slice(0, 80),
    bullets: normalizeBullets(slide.bullets),
    notes: String(slide.notes ?? "").slice(0, 2000),
    order: index + 1,
  }));
}

function normalizeBullets(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new PptError("ppt.invalid", "要点须是列表");
  if (value.length > 12) throw new PptError("ppt.invalid", "每页最多 12 条要点");
  return value.map((item) => String(item ?? "").trim().slice(0, 200)).filter((item) => item.length > 0);
}
