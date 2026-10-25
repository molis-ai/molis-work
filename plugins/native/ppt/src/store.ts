import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PptRecord, PptSlide, PptSlideInput } from "./contract.js";
import type { PptPublicationIntent, PptPublicationSnapshot } from "./promote.js";
import { pptErrors } from "./error.js";
import { PPT_DATABASE } from "./database.js";
export { PPT_DATABASE };

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
  publication_pending_json?: string | null;
}

const DEFAULT_PRIMARY = "#5e6ad2";
const DEFAULT_BACKGROUND = "#FCFCFB";
const DEFAULT_TEXT = "#292A2E";

/** The SQL the store runs: its own connection, or the library the Runtime gives the plugin, read or inside one write transaction. */
export type PptSqlValue = string | number | null;
export interface PptSql {
  get(sql: string, parameters?: readonly PptSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly PptSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly PptSqlValue[]): { changes: number | bigint };
}

/** Where the actions read and write: reads run on their own; a write waits for the call's authority. Each writing Store operation is already one transaction through the injected `atomically`; the Runtime adapter will bind the Store inside its one `database.transaction`. */
export interface PptStores {
  read<T>(run: (store: PptStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: PptStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run, for tests and maintenance; the caller's beforeEffect is awaited, and the Store's own `atomically` still wraps each business operation. */
export function ownPptStores(withStore: <T>(run: (store: PptStore) => T) => T): PptStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

export class PptStore {
  constructor(private readonly db: PptSql, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  list(projectId: string): PptRecord[] {
    const project_id = normalizeProjectId(projectId);
    return this.rows("SELECT * FROM presentations WHERE project_id = ? ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE", [project_id]).map(fromRow);
  }

  get(id: string, projectId?: string): PptRecord {
    const row = this.rows("SELECT * FROM presentations WHERE id = ?", [id])[0];
    if (!row) throw pptErrors.not_found("找不到这份演示稿");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw pptErrors.not_found("找不到这份演示稿");
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
    slides?: readonly PptSlideInput[];
    expected_version?: number;
  }, projectId?: string): PptRecord {
    const current = this.get(id, projectId);
    this.assertVersion(current, patch.expected_version);
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
    this.write(next, false, current.version);
    return next;
  }

  delete(id: string, projectId?: string, expectedVersion?: number): void {
    this.atomically(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      if (current.publication_pending) throw pptErrors.publication_pending("请先恢复上次成果发布，再删除演示稿");
      this.db.run("DELETE FROM presentations WHERE id = ?", [id]);
    });
  }

  /**
   * Move one deck to another partition (the personal space or a project); its id stays, so links keep finding it.
   * Fixed versions already saved stay with the old place's results, so the numbering starts again here.
   */
  relocate(id: string, from: string, to: string): PptRecord {
    const target = normalizeProjectId(to);
    return this.atomically(() => {
      const current = this.get(id, from);
      if (current.publication_pending) throw pptErrors.publication_pending("上次固定版本还没存完，请先在原位置恢复，再移动");
      // A move is not an edit: the content and its version stay as they were, so work that recorded this version still matches.
      const result = this.db.run("UPDATE presentations SET project_id = ?, artifact_id = '', artifact_version = 0 WHERE id = ? AND version = ?", [target, id, current.version]);
      if (result.changes !== 1) throw pptErrors.conflict("演示稿刚被修改，请重新读取后再移动");
      return this.get(id, target);
    });
  }

  /** An independent copy in another partition; the same request always returns the same copy. */
  duplicate(id: string, from: string, to: string, requestId: string): PptRecord {
    const target = normalizeProjectId(to);
    return this.atomically(() => {
      const prior = this.db.get("SELECT target_id FROM presentation_copies WHERE project_id = ? AND request_id = ?", [target, requestId]);
      if (prior) return this.get(String(prior.target_id), target);
      const source = this.get(id, from);
      const now = new Date().toISOString();
      const copy: PptRecord = { ...source, id: crypto.randomUUID(), project_id: target, created_at: now, updated_at: now, version: 1, artifact_id: "", artifact_version: 0,
        slides: source.slides.map(slide => ({ ...slide, id: crypto.randomUUID() })) };
      delete (copy as { publication_pending?: unknown }).publication_pending;
      this.write(copy, true);
      this.db.run("INSERT INTO presentation_copies (project_id, request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)", [target, requestId, id, copy.id, now]);
      return copy;
    });
  }

  /** A deck made from an outline another plugin hands over; one delivery makes one deck. */
  receive(projectId: string, requestId: string, title: string, slides: readonly PptSlideInput[]): PptRecord {
    const target = normalizeProjectId(projectId);
    return this.atomically(() => {
      const prior = this.db.get("SELECT target_id FROM presentation_copies WHERE project_id = ? AND request_id = ?", [target, "receive:" + requestId]);
      if (prior) return this.get(String(prior.target_id), target);
      const created = this.create({ title, project_id: target });
      const filled = this.update(created.id, { slides, expected_version: created.version }, target);
      this.db.run("INSERT INTO presentation_copies (project_id, request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)", [target, "receive:" + requestId, "", filled.id, filled.updated_at]);
      return filled;
    });
  }

  beginPublication(id: string, projectId: string, actorId: string, expectedVersion?: number, existing?: PptPublicationSnapshot, version?: number): PptPublicationIntent {
    return this.atomically(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      const pending = this.publicationIntent(id);
      if (pending) {
        if (pending.actor_id !== actorId) throw pptErrors.publication_owner("请由上次发布的发起者恢复，原快照已保留");
        return pending;
      }
      const intent: PptPublicationIntent = { content: existing ?? { title: current.title, description: current.description, color_primary: current.color_primary, color_background: current.color_background, color_text: current.color_text, slides: current.slides },
        version: version ?? current.artifact_version + 1, source_version: current.version, actor_id: actorId };
      this.db.run("UPDATE presentations SET publication_pending_json = ? WHERE id = ?", [JSON.stringify(intent), id]);
      return intent;
    });
  }

  completePublication(id: string, projectId: string, intent: PptPublicationIntent, artifact: { artifact_id: string; version: number }): PptRecord {
    return this.atomically(() => {
      const current = this.get(id, projectId);
      if (current.artifact_id === artifact.artifact_id && current.artifact_version >= intent.version) return current;
      if (JSON.stringify(this.publicationIntent(id)) !== JSON.stringify(intent)) throw pptErrors.publication_conflict("发布记录已改变，请重新读取演示稿");
      this.db.run("UPDATE presentations SET artifact_id = ?, artifact_version = ?, updated_at = ?, version = version + 1, publication_pending_json = NULL WHERE id = ?",
        [artifact.artifact_id, artifact.version, new Date().toISOString(), id]);
      return this.get(id, projectId);
    });
  }

  private publicationIntent(id: string): PptPublicationIntent | null {
    const row = this.db.get("SELECT publication_pending_json FROM presentations WHERE id = ?", [id]);
    const pending = row?.publication_pending_json;
    return typeof pending === "string" && pending ? JSON.parse(pending) as PptPublicationIntent : null;
  }
  private assertVersion(current: PptRecord, expectedVersion?: number): void {
    if (expectedVersion !== undefined && expectedVersion !== current.version) throw pptErrors.conflict("演示稿已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
  }
  /** The one cast from the SQL rows to this store's row shape: the columns are the schema's. */
  private rows(sql: string, parameters?: readonly PptSqlValue[]): PptRow[] {
    return this.db.all(sql, parameters) as unknown as PptRow[];
  }

  private write(record: PptRecord, insert: boolean, expectedVersion = record.version - 1): void {
    if (insert) {
      this.db.run("INSERT INTO presentations (id, project_id, title, description, color_primary, color_background, color_text, slides_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [record.id, record.project_id, record.title, record.description, record.color_primary,
          record.color_background, record.color_text, JSON.stringify(record.slides), record.created_at, record.updated_at, record.version]);
      return;
    }
    const result = this.db.run("UPDATE presentations SET title = ?, description = ?, color_primary = ?, color_background = ?, color_text = ?, slides_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
      [record.title, record.description, record.color_primary, record.color_background,
        record.color_text, JSON.stringify(record.slides), record.updated_at, record.version, record.id, expectedVersion]);
    if (result.changes !== 1) throw pptErrors.conflict("演示稿已改变，请重新读取后保存");
  }
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
    ...(row.publication_pending_json ? { publication_pending: ((intent: PptPublicationIntent) => ({ version: intent.version, source_version: intent.source_version }))(JSON.parse(row.publication_pending_json)) } : {}),
  };
}

function blankSlide(order: number): PptSlide {
  return { id: crypto.randomUUID(), title: "", bullets: [], notes: "", order };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw pptErrors.invalid("缺少项目");
  if (id.length > 80) throw pptErrors.invalid("项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名演示稿";
  if (title.length > 80) throw pptErrors.invalid("标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if (value.length > 2000) throw pptErrors.invalid("说明须为 0 到 2000 个字");
  return value;
}

function normalizeColor(value: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/u.test(value)) throw pptErrors.invalid("颜色须为 #RRGGBB");
  return value.toLowerCase();
}

function normalizeSlides(value: readonly PptSlideInput[]): PptSlide[] {
  if (!Array.isArray(value)) throw pptErrors.invalid("幻灯片须是列表");
  if (value.length === 0) throw pptErrors.invalid("至少保留一页");
  if (value.length > 40) throw pptErrors.invalid("最多 40 页");
  const identities = value.map(slide => slide.id).filter(Boolean);
  if (new Set(identities).size !== identities.length) throw pptErrors.invalid("幻灯片标识不能重复");
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
  if (!Array.isArray(value)) throw pptErrors.invalid("要点须是列表");
  if (value.length > 12) throw pptErrors.invalid("每页最多 12 条要点");
  return value.map((item) => String(item ?? "").trim().slice(0, 200)).filter((item) => item.length > 0);
}

/** This plugin's store in the Home's store registry (W4-11): `ppt/ppt.db` at its one baseline. */
export const PPT_HOME_STORE: HomeStoreDeclaration = { path: "ppt", library: { baseline: PPT_DATABASE } };
