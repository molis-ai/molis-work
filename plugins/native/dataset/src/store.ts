import { ensureSqliteColumn, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type {
  DatasetColumn,
  DatasetColumnInput,
  DatasetColumnType,
  DatasetRecord,
  DatasetRow,
  DatasetRowInput,
  DatasetVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/dataset";
import { DatasetError } from "./error.js";
import type { DatasetPublicationIntent, DatasetPublicationSnapshot } from "./promote.js";

interface DatasetRowDb {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  columns_json: string;
  rows_json: string;
  created_at: string;
  updated_at: string;
  version: number;
  artifact_id?: string;
  artifact_version?: number;
  publication_pending_json?: string | null;
}

const COLUMN_TYPES: readonly DatasetColumnType[] = ["text", "number", "date"];

export class DatasetStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): DatasetRecord[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM datasets WHERE project_id = ? ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE",
    ).all(project_id) as unknown as DatasetRowDb[];
    return rows.map(fromRow);
  }

  get(id: string, projectId?: string): DatasetRecord {
    const row = this.db.prepare("SELECT * FROM datasets WHERE id = ?").get(id) as DatasetRowDb | undefined;
    if (!row) throw new DatasetError("dataset.not_found", "找不到这张表");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new DatasetError("dataset.not_found", "找不到这张表");
    }
    return fromRow(row);
  }

  create(input: { title?: string; project_id: string }): DatasetRecord {
    const now = new Date().toISOString();
    const record: DatasetRecord = {
      id: crypto.randomUUID(),
      project_id: normalizeProjectId(input.project_id),
      title: normalizeTitle(input.title ?? "未命名数据表"),
      description: "",
      status: "draft",
      columns: [],
      rows: [],
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
    columns?: readonly DatasetColumnInput[];
    rows?: readonly DatasetRowInput[];
    expected_version?: number;
  }, projectId?: string): DatasetRecord {
    const current = this.get(id, projectId);
    this.assertVersion(current, patch.expected_version);
    const columns = patch.columns !== undefined ? normalizeColumns(patch.columns) : current.columns;
    const rows = normalizeRows(patch.rows !== undefined ? patch.rows : current.rows, columns);
    const next: DatasetRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      description: patch.description !== undefined ? normalizeDescription(patch.description) : current.description,
      status: columns.length > 0 ? "ready" : "draft",
      columns,
      rows,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    this.write(next, false);
    return next;
  }

  /** Move to another partition; the id and saved versions go with it. Fixed versions already published stay with the old place. */
  relocate(id: string, from: string, to: string): DatasetRecord {
    const target = normalizeProjectId(to);
    return this.transaction(() => {
      const current = this.get(id, from);
      if (current.publication_pending) throw new DatasetError("dataset.publication_pending", "上次固定版本还没存完，请先在原位置恢复，再移动");
      const result = this.db.prepare("UPDATE datasets SET project_id = ?, artifact_id = '', artifact_version = 0, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
        .run(target, new Date().toISOString(), id, current.version);
      if (result.changes !== 1) throw new DatasetError("dataset.conflict", "数据表刚被修改，请重新读取后再移动");
      return this.get(id, target);
    });
  }

  /** An independent copy of the current table (not its saved versions) in another partition; the same request returns the same copy. */
  duplicate(id: string, from: string, to: string, requestId: string): DatasetRecord {
    return this.once(normalizeProjectId(to), "copy:" + requestId, () => {
      const source = this.get(id, from);
      const created = this.create({ title: source.title, project_id: to });
      return this.update(created.id, { description: source.description, columns: source.columns, rows: source.rows, expected_version: created.version }, to);
    });
  }

  /** A table made from CSV another plugin hands over (a form's responses); one delivery makes one table. */
  receiveCsv(projectId: string, requestId: string, title: string, csv: string): DatasetRecord {
    return this.once(normalizeProjectId(projectId), "receive:" + requestId, () => {
      const parsed = parseCsv(csv);
      if (parsed.columns.length === 0) throw new DatasetError("dataset.invalid", "收到的内容不是带表头的 CSV");
      const created = this.create({ title: title.slice(0, 80) || "未命名数据表", project_id: projectId });
      return this.update(created.id, { columns: parsed.columns, rows: parsed.rows, expected_version: created.version }, projectId);
    });
  }

  private once(projectId: string, requestId: string, make: () => DatasetRecord): DatasetRecord {
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT dataset_id FROM dataset_receipts WHERE project_id = ? AND request_id = ?").get(projectId, requestId) as { dataset_id: string } | undefined;
      if (prior) return this.get(prior.dataset_id, projectId);
      const made = make();
      this.db.prepare("INSERT INTO dataset_receipts (project_id, request_id, dataset_id, created_at) VALUES (?, ?, ?, ?)").run(projectId, requestId, made.id, new Date().toISOString());
      return made;
    });
  }

  delete(id: string, projectId?: string, expectedVersion?: number): void {
    this.transaction(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      if (current.publication_pending) throw new DatasetError("dataset.publication_pending", "请先恢复上次发布，再删除数据表");
      this.db.prepare("DELETE FROM dataset_versions WHERE dataset_id = ?").run(id);
      this.db.prepare("DELETE FROM datasets WHERE id = ?").run(id);
    });
  }

  generateColumn(id: string, prompt: string, projectId?: string, expectedVersion?: number): DatasetRecord {
    const current = this.get(id, projectId);
    const name = prompt.trim() || `列 ${current.columns.length + 1}`;
    if (name.length > 80) throw new DatasetError("dataset.invalid", "列名须为 1 到 80 个字");
    const column: DatasetColumn = {
      id: crypto.randomUUID(),
      name,
      type: "text",
      order: current.columns.length + 1,
    };
    return this.update(id, { columns: [...current.columns, column], expected_version: expectedVersion ?? current.version }, projectId);
  }

  importCsv(id: string, csv: string, projectId?: string, expectedVersion?: number): DatasetRecord {
    const parsed = parseCsv(csv);
    if (parsed.columns.length === 0) throw new DatasetError("dataset.invalid", "CSV 至少要有表头");
    return this.update(id, { columns: parsed.columns, rows: parsed.rows, expected_version: expectedVersion }, projectId);
  }

  saveVersion(id: string, note?: string, projectId?: string, expectedVersion?: number): DatasetVersionRecord {
    return this.transaction(() => {
    const snapshot = this.get(id, projectId);
    this.assertVersion(snapshot, expectedVersion);
    const record: DatasetVersionRecord = {
      id: crypto.randomUUID(),
      dataset_id: id,
      note: (note ?? "").trim().slice(0, 80),
      snapshot,
      created_at: new Date().toISOString(),
    };
    this.db.prepare(
      "INSERT INTO dataset_versions (id, dataset_id, note, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(record.id, record.dataset_id, record.note, JSON.stringify(record.snapshot), record.created_at);
    return record;
    });
  }

  listVersions(id: string, projectId?: string): DatasetVersionRecord[] {
    this.get(id, projectId);
    const rows = this.db.prepare(
      "SELECT id, dataset_id, note, snapshot_json, created_at FROM dataset_versions WHERE dataset_id = ? ORDER BY datetime(created_at) DESC",
    ).all(id) as Array<{ id: string; dataset_id: string; note: string; snapshot_json: string; created_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      dataset_id: row.dataset_id,
      note: row.note,
      snapshot: JSON.parse(row.snapshot_json) as DatasetRecord,
      created_at: row.created_at,
    }));
  }

  rollback(id: string, versionId: string, projectId?: string, expectedVersion?: number): DatasetRecord {
    const versions = this.listVersions(id, projectId);
    const target = versions.find((item) => item.id === versionId);
    if (!target) throw new DatasetError("dataset.not_found", "找不到这个版本");
    return this.update(id, {
      title: target.snapshot.title,
      description: target.snapshot.description,
      columns: target.snapshot.columns,
      rows: target.snapshot.rows,
      expected_version: expectedVersion,
    }, projectId);
  }

  beginPublication(id: string, projectId: string, actorId: string, expectedVersion?: number, existing?: DatasetPublicationSnapshot): DatasetPublicationIntent {
    return this.transaction(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      const pending = this.publicationIntent(id);
      if (pending) {
        if (pending.actor_id !== actorId) throw new DatasetError("dataset.publication_owner", "请由上次发布的发起者恢复，原快照已保留");
        return pending;
      }
      const intent: DatasetPublicationIntent = { content: existing ?? { title: current.title, description: current.description, columns: current.columns, rows: current.rows },
        version: current.artifact_version + 1, source_version: current.version, actor_id: actorId };
      this.db.prepare("UPDATE datasets SET publication_pending_json = ? WHERE id = ?").run(JSON.stringify(intent), id);
      return intent;
    });
  }

  completePublication(id: string, projectId: string, intent: DatasetPublicationIntent, artifact: { artifact_id: string; version: number }): DatasetRecord {
    return this.transaction(() => {
      const current = this.get(id, projectId);
      if (current.artifact_id === artifact.artifact_id && current.artifact_version >= intent.version) return current;
      if (JSON.stringify(this.publicationIntent(id)) !== JSON.stringify(intent)) throw new DatasetError("dataset.publication_conflict", "发布记录已改变，请重新读取数据表");
      this.db.prepare("UPDATE datasets SET artifact_id = ?, artifact_version = ?, updated_at = ?, version = version + 1, publication_pending_json = NULL WHERE id = ?")
        .run(artifact.artifact_id, artifact.version, new Date().toISOString(), id);
      return this.get(id, projectId);
    });
  }

  private publicationIntent(id: string): DatasetPublicationIntent | null {
    const row = this.db.prepare("SELECT publication_pending_json FROM datasets WHERE id = ?").get(id) as { publication_pending_json: string | null };
    return row.publication_pending_json ? JSON.parse(row.publication_pending_json) as DatasetPublicationIntent : null;
  }
  private assertVersion(current: DatasetRecord, expectedVersion?: number): void {
    if (expectedVersion !== undefined && expectedVersion !== current.version) throw new DatasetError("dataset.conflict", "数据表已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = run(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private write(record: DatasetRecord, insert: boolean): void {
    if (insert) {
      this.db.prepare(
      "INSERT INTO datasets (id, project_id, title, description, status, columns_json, rows_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
        record.id, record.project_id, record.title, record.description, record.status,
        JSON.stringify(record.columns), JSON.stringify(record.rows),
        record.created_at, record.updated_at, record.version,
      );
      return;
    }
    const result = this.db.prepare(
      "UPDATE datasets SET title = ?, description = ?, status = ?, columns_json = ?, rows_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
    ).run(
      record.title, record.description, record.status,
      JSON.stringify(record.columns), JSON.stringify(record.rows),
      record.updated_at, record.version, record.id, record.version - 1,
    );
    if (result.changes !== 1) throw new DatasetError("dataset.conflict", "数据表已改变，请重新读取后保存");
  }
}

export function openDatasetStore(homeDirectory: string): DatasetStore {
  const db = openHomeSqliteDatabase(homeDirectory, "dataset");
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      columns_json TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL DEFAULT '',
      artifact_version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS dataset_versions (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      note TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  ensureSqliteColumn(db, "datasets", "project_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "datasets", "artifact_id", "TEXT NOT NULL DEFAULT ''");
  ensureSqliteColumn(db, "datasets", "artifact_version", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(db, "datasets", "publication_pending_json", "TEXT");
  db.exec("CREATE TABLE IF NOT EXISTS dataset_receipts (project_id TEXT NOT NULL, request_id TEXT NOT NULL, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id))");
  return new DatasetStore(db);
}

export function parseCsv(text: string): { columns: DatasetColumn[]; rows: DatasetRow[] } {
  // Spreadsheet exports (ours included) start with a byte-order mark; it is not part of the first column's name.
  const lines = csvRecords(text.replace(/^\ufeff/u, ""));
  if (lines.length === 0) return { columns: [], rows: [] };
  const headers = lines[0]!;
  const columns = headers.map((name, index) => ({
    id: `col-${index + 1}`,
    name: name.trim() || `列 ${index + 1}`,
    type: "text" as DatasetColumnType,
    order: index + 1,
  }));
  const rows = lines.slice(1).map((cells) => {
    return {
      id: crypto.randomUUID(),
      cells: Object.fromEntries(columns.map((column, index) => [column.id, cells[index] ?? ""])),
    };
  });
  return {
    columns: columns.map((column) => ({
      ...column,
      type: inferColumnType(rows.map((row) => row.cells[column.id] ?? "")),
    })),
    rows,
  };
}

function inferColumnType(values: readonly string[]): DatasetColumnType {
  const filled = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (filled.length === 0) return "text";
  if (filled.every((value) => /^-?\d+(?:\.\d+)?$/.test(value))) return "number";
  if (filled.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return "date";
  return "text";
}

export function toCsv(record: DatasetRecord): string {
  const header = record.columns.map((column) => csvEscape(column.name)).join(",");
  const lines = record.rows.map((row) =>
    record.columns.map((column) => csvEscape(row.cells[column.id] ?? "")).join(","),
  );
  return [header, ...lines].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false, started = false;
  const endRow = () => { if (started || row.length || cell) records.push([...row, cell]); row = []; cell = ""; closed = false; started = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
      continue;
    }
    if (char === ",") { row.push(cell); cell = ""; closed = false; started = true; }
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else if (char === '"' && cell === "" && !closed) { quoted = true; started = true; }
    else {
      if (closed || char === '"') throw new DatasetError("dataset.invalid", "CSV 引号格式无效");
      cell += char; started = true;
    }
  }
  if (quoted) throw new DatasetError("dataset.invalid", "CSV 引号未闭合");
  endRow();
  return records;
}

function fromRow(row: DatasetRowDb): DatasetRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as DatasetPublicationIntent : null;
  return {
    id: row.id,
    project_id: row.project_id ?? "",
    title: row.title,
    description: row.description,
    status: row.status as DatasetRecord["status"],
    columns: JSON.parse(row.columns_json) as DatasetColumn[],
    rows: JSON.parse(row.rows_json) as DatasetRow[],
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
    artifact_id: row.artifact_id ?? "",
    artifact_version: Number(row.artifact_version) || 0,
    ...(pending ? { publication_pending: { version: pending.version, source_version: pending.source_version } } : {}),
  };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new DatasetError("dataset.invalid", "缺少项目");
  if (id.length > 80) throw new DatasetError("dataset.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名数据表";
  if (title.length > 80) throw new DatasetError("dataset.invalid", "标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if (value.length > 2000) throw new DatasetError("dataset.invalid", "说明须为 0 到 2000 个字");
  return value;
}

function normalizeColumns(value: readonly DatasetColumnInput[]): DatasetColumn[] {
  if (!Array.isArray(value)) throw new DatasetError("dataset.invalid", "列须是列表");
  if (value.length > 40) throw new DatasetError("dataset.invalid", "最多 40 列");
  return value.map((column, index) => ({
    id: column.id || crypto.randomUUID(),
    name: String(column.name ?? "").trim() || `列 ${index + 1}`,
    type: column.type && COLUMN_TYPES.includes(column.type) ? column.type : "text",
    order: index + 1,
  }));
}

function normalizeRows(rows: readonly DatasetRowInput[], columns: readonly DatasetColumn[]): DatasetRow[] {
  if (!Array.isArray(rows)) throw new DatasetError("dataset.invalid", "行须是列表");
  if (rows.length > 2000) throw new DatasetError("dataset.invalid", "最多 2000 行");
  return rows.map((row) => ({
    id: row.id || crypto.randomUUID(),
    cells: Object.fromEntries(columns.map((column) => [column.id, String(row.cells?.[column.id] ?? "")])),
  }));
}
