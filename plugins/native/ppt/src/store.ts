import { sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { PPT_SUBJECT_KIND, type PptRecord, type PptSlide, type PptSlideInput } from "./contract.js";
import { pptErrors } from "./error.js";
import { PPT_DATABASE } from "./database.js";
export { PPT_DATABASE };

type PptRow = {
  id: string;
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
};

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

/** One partition's decks: the library is that partition's own, so a record's `project_id` is the partition this store was opened for. */
export class PptStore {
  constructor(private readonly db: PptSql, readonly partition: string, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  list(): PptRecord[] {
    return this.rows("SELECT * FROM presentations ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE").map(row => fromRow(row, this.partition));
  }

  get(id: string): PptRecord {
    const row = this.rows("SELECT * FROM presentations WHERE id = ?", [id])[0];
    if (!row) throw pptErrors.not_found("找不到这份演示稿");
    return fromRow(row, this.partition);
  }

  create(input: { title?: string }): PptRecord {
    const now = new Date().toISOString();
    const record: PptRecord = {
      id: crypto.randomUUID(),
      project_id: this.partition,
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
  }): PptRecord {
    const current = this.get(id);
    assertPptVersion(current, patch.expected_version);
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

  delete(id: string, expectedVersion?: number): void {
    this.atomically(() => {
      const current = this.get(id); assertPptVersion(current, expectedVersion);
      if (current.publication_pending) throw pptErrors.publication_pending("请先恢复上次成果发布，再删除演示稿");
      this.db.run("DELETE FROM presentations WHERE id = ?", [id]);
    });
  }

  /** One deck as the record placement carries to another partition (`placement.export`); its pinned versions stay with this place's results. */
  exportRecord(id: string): PlacementExport {
    const current = this.get(id);
    const { title, description, color_primary, color_background, color_text, slides, created_at, updated_at, version } = current;
    return { subject: { kind: PPT_SUBJECT_KIND, id }, revision: String(version),
      record: { title, description, color_primary, color_background, color_text, slides_json: JSON.stringify(slides), created_at, updated_at, version } };
  }

  /**
   * Writes a carried deck here (`placement.put`). With `targetId` (a move) it keeps its id and version, so links and recorded versions still
   * find it, replacing what an earlier attempt of the same move put; without (a copy) it is a new deck, and the same request makes the same one.
   * Pinned versions belonged to where it came from, so the numbering starts again here.
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): PptRecord {
    const carried = carriedDeck(record);
    return this.atomically(() => {
      if (targetId === undefined) {
        const prior = this.db.get("SELECT target_id FROM presentation_copies WHERE request_id = ?", ["copy:" + requestId]);
        if (prior) return this.get(String(prior.target_id));
        const now = new Date().toISOString();
        const copy: PptRecord = { ...carried, id: crypto.randomUUID(), project_id: this.partition, created_at: now, updated_at: now, version: 1,
          artifact_id: "", artifact_version: 0, slides: carried.slides.map(slide => ({ ...slide, id: crypto.randomUUID() })) };
        this.write(copy, true);
        this.db.run("INSERT INTO presentation_copies (request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?)", ["copy:" + requestId, "", copy.id, now]);
        return copy;
      }
      // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept (conflict).
      if (this.db.get("SELECT 1 FROM presentations WHERE id = ?", [targetId])) {
        // Compared with what this put would write (its own normalizing included), so a retry of the same move is found the same.
        const written = { ...record, title: carried.title, description: carried.description, color_primary: carried.color_primary,
          color_background: carried.color_background, color_text: carried.color_text, slides_json: JSON.stringify(carried.slides) };
        if (sameCarriedRecord(this.exportRecord(targetId).record, written)) return this.get(targetId);
        throw pptErrors.conflict("目标位置已经有这份演示稿，而且内容不同；没有覆盖它");
      }
      this.write({ ...carried, id: targetId, project_id: this.partition, artifact_id: "", artifact_version: 0 }, true);
      return this.get(targetId);
    });
  }

  /** Lets a deck that went to another partition go from here (`placement.remove`), only while it is still the version carried. */
  removeCarried(id: string, revision: string): boolean {
    return this.atomically(() => {
      const row = this.db.get("SELECT version, publication_pending_json FROM presentations WHERE id = ?", [id]);
      if (!row) return false;
      if (row.publication_pending_json) throw pptErrors.publication_pending("上次固定版本还没存完，请先在原位置恢复，再移动");
      if (String(row.version) !== revision) throw pptErrors.conflict("演示稿刚被修改，请重新读取后再移动");
      return this.db.run("DELETE FROM presentations WHERE id = ? AND version = ?", [id, row.version as number]).changes === 1;
    });
  }

  /** A deck made from an outline another plugin hands over; one delivery makes one deck. */
  receive(requestId: string, title: string, slides: readonly PptSlideInput[]): PptRecord {
    return this.atomically(() => {
      const prior = this.db.get("SELECT target_id FROM presentation_copies WHERE request_id = ?", ["receive:" + requestId]);
      if (prior) return this.get(String(prior.target_id));
      const created = this.create({ title });
      const filled = this.update(created.id, { slides, expected_version: created.version });
      this.db.run("INSERT INTO presentation_copies (request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?)", ["receive:" + requestId, "", filled.id, filled.updated_at]);
      return filled;
    });
  }

  /** The one cast from the SQL rows to this store's row shape: the columns are the schema's. */
  private rows(sql: string, parameters?: readonly PptSqlValue[]): PptRow[] {
    return this.db.all(sql, parameters) as unknown as PptRow[];
  }

  private write(record: PptRecord, insert: boolean, expectedVersion = record.version - 1): void {
    if (insert) {
      this.db.run("INSERT INTO presentations (id, title, description, color_primary, color_background, color_text, slides_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [record.id, record.title, record.description, record.color_primary,
          record.color_background, record.color_text, JSON.stringify(record.slides), record.created_at, record.updated_at, record.version]);
      return;
    }
    const result = this.db.run("UPDATE presentations SET title = ?, description = ?, color_primary = ?, color_background = ?, color_text = ?, slides_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
      [record.title, record.description, record.color_primary, record.color_background,
        record.color_text, JSON.stringify(record.slides), record.updated_at, record.version, record.id, expectedVersion]);
    if (result.changes !== 1) throw pptErrors.conflict("演示稿已改变，请重新读取后保存");
  }
}


export function assertPptVersion(current: PptRecord, expectedVersion?: number): void {
  if (expectedVersion !== undefined && expectedVersion !== current.version) throw pptErrors.conflict("演示稿已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
}

export function fromRow(row: PptRow, partition: string): PptRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as NonNullable<PptRecord["publication_pending"]> : null;
  return {
    id: row.id,
    project_id: partition,
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
    ...(pending ? { publication_pending: { version: pending.version, source_version: pending.source_version } } : {}),
  };
}

function blankSlide(order: number): PptSlide {
  return { id: crypto.randomUUID(), title: "", bullets: [], notes: "", order };
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名演示稿";
  if ([...title].length > 80) throw pptErrors.invalid("标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if ([...value].length > 2000) throw pptErrors.invalid("说明须为 0 到 2000 个字");
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
    title: [...String(slide.title ?? "").trim()].slice(0, 80).join(""),
    bullets: normalizeBullets(slide.bullets),
    notes: [...String(slide.notes ?? "")].slice(0, 2000).join(""),
    order: index + 1,
  }));
}

function normalizeBullets(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw pptErrors.invalid("要点须是列表");
  if (value.length > 12) throw pptErrors.invalid("每页最多 12 条要点");
  return value.map((item) => [...String(item ?? "").trim()].slice(0, 200).join("")).filter((item) => item.length > 0);
}

/** A carried deck's record, as `exportRecord` wrote it; checked by the same rules an edit is, before a row is written. */
function carriedDeck(record: PlacementRecord): Omit<PptRecord, "id" | "project_id" | "artifact_id" | "artifact_version"> {
  const { title, description, color_primary, color_background, color_text, slides_json, created_at, updated_at, version } = record;
  if (typeof title !== "string" || typeof description !== "string" || typeof color_primary !== "string" || typeof color_background !== "string"
    || typeof color_text !== "string" || typeof slides_json !== "string" || typeof created_at !== "string" || typeof updated_at !== "string"
    || !Number.isSafeInteger(version) || (version as number) < 1) throw pptErrors.invalid("带来的演示稿内容不完整");
  let slides: unknown;
  try { slides = JSON.parse(slides_json); } catch { throw pptErrors.invalid("带来的演示稿内容不完整"); }
  // A carried colour is checked by the edit rule but kept as written: a deck moves as it is (the defaults are upper case, an edit lower case).
  const color = (value: string) => {
    normalizeColor(value);
    return value;
  };
  return { title: normalizeTitle(title), description: normalizeDescription(description), color_primary: color(color_primary),
    color_background: color(color_background), color_text: color(color_text), slides: normalizeSlides(slides as PptSlideInput[]),
    created_at, updated_at, version: version as number };
}
