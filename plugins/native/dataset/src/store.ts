import { sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  DatasetColumn,
  DatasetColumnInput,
  DatasetColumnType,
  DatasetRecord,
  DatasetRow,
  DatasetRowInput,
  DatasetVersionRecord,
} from "./contract.js";
import { datasetErrors } from "./error.js";
import { DATASET_DATABASE } from "./database.js";
export { DATASET_DATABASE };

type DatasetRowDb = {
  id: string;
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
};

const COLUMN_TYPES: readonly DatasetColumnType[] = ["text", "number", "date"];

/** The SQL the store runs: its own connection, or the library the Runtime gives the plugin, read or inside one write transaction. */
export type DatasetSqlValue = string | number | null;
export interface DatasetSql {
  get(sql: string, parameters?: readonly DatasetSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly DatasetSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly DatasetSqlValue[]): { changes: number | bigint };
}

/** Where the actions read and write: reads run on their own; a write waits for the call's authority and is one transaction. */
export interface DatasetStores {
  read<T>(run: (store: DatasetStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: DatasetStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run, for tests and maintenance. */
export function ownDatasetStores(withStore: <T>(run: (store: DatasetStore) => T) => T): DatasetStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

/** One partition's tables: the library is that partition's own, so a record's `project_id` is the partition this store was opened for. */
export class DatasetStore {
  constructor(private readonly db: DatasetSql, readonly partition: string, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  list(): DatasetRecord[] {
    return this.rows("SELECT * FROM datasets ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE").map(row => fromRow(row, this.partition));
  }

  get(id: string): DatasetRecord {
    const row = this.rows("SELECT * FROM datasets WHERE id = ?", [id])[0];
    if (!row) throw datasetErrors.not_found("找不到这张表");
    return fromRow(row, this.partition);
  }

  create(input: { title?: string }): DatasetRecord {
    const now = new Date().toISOString();
    const record: DatasetRecord = {
      id: crypto.randomUUID(),
      project_id: this.partition,
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
  }): DatasetRecord {
    const current = this.get(id);
    assertDatasetVersion(current, patch.expected_version);
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

  /** One table as the record placement carries to another partition (`placement.export`), with its saved versions; pinned versions stay here. */
  exportRecord(id: string): PlacementExport {
    const current = this.get(id);
    // A saved version travels without what only means something here (its table's id and partition, the pins): the put gives it the target's.
    const versions = this.db.all("SELECT id, note, snapshot_json, created_at FROM dataset_versions WHERE dataset_id = ? ORDER BY created_at, id", [id]).map(row => {
      const snapshot = JSON.parse(String(row.snapshot_json)) as Record<string, unknown>;
      for (const local of ["id", "project_id", "artifact_id", "artifact_version", "publication_pending"]) delete snapshot[local];
      return JSON.stringify({ ...row, snapshot_json: JSON.stringify(snapshot) });
    });
    const { title, description, columns, rows, created_at, updated_at, version } = current;
    return { subject: { kind: "dataset", id }, revision: String(version),
      record: { title, description, columns_json: JSON.stringify(columns), rows_json: JSON.stringify(rows), created_at, updated_at, version, versions } };
  }

  /**
   * Writes a carried table here (`placement.put`). With `targetId` (a move) it keeps its id, version and saved versions, replacing what an
   * earlier attempt of the same move put; without (a copy) it is an independent copy of the current table (not its saved versions), and the
   * same request makes the same one. Pinned versions belonged to where it came from, so the numbering starts again here.
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): DatasetRecord {
    const carried = carriedDataset(record);
    if (targetId === undefined) {
      return this.once("copy:" + requestId, () => {
        const created = this.create({ title: carried.title });
        return this.update(created.id, { description: carried.description, columns: carried.columns, rows: carried.rows, expected_version: created.version });
      });
    }
    return this.atomically(() => {
      const columns = normalizeColumns(carried.columns), rows = normalizeRows(carried.rows, columns);
      // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept (conflict).
      if (this.db.get("SELECT 1 FROM datasets WHERE id = ?", [targetId])) {
        // Compared with what this put would write (its own normalizing included), so a retry of the same move is found the same.
        const written = { ...record, title: carried.title, description: carried.description, columns_json: JSON.stringify(columns), rows_json: JSON.stringify(rows) };
        if (sameCarriedRecord(this.exportRecord(targetId).record, written)) return this.get(targetId);
        throw datasetErrors.conflict("目标位置已经有这张表，而且内容或保存的版本不同；没有覆盖它");
      }
      this.db.run("DELETE FROM dataset_versions WHERE dataset_id = ?", [targetId]);
      this.write({ id: targetId, project_id: this.partition, title: carried.title, description: carried.description, status: columns.length > 0 ? "ready" : "draft",
        columns, rows, created_at: carried.created_at, updated_at: carried.updated_at, version: carried.version, artifact_id: "", artifact_version: 0 }, true);
      for (const saved of carried.versions) {
        // A saved version is what the table was; here it is this partition's table, and none of the old place's pins come with it.
        const snapshot = { ...saved.snapshot, id: targetId, project_id: this.partition, artifact_id: "", artifact_version: 0 };
        delete (snapshot as { publication_pending?: unknown }).publication_pending;
        this.db.run("INSERT INTO dataset_versions (id, dataset_id, note, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)",
          [saved.id, targetId, saved.note, JSON.stringify(snapshot), saved.created_at]);
      }
      return this.get(targetId);
    });
  }

  /** Lets a table that went to another partition go from here (`placement.remove`), only while it is still the version carried. */
  removeCarried(id: string, revision: string): boolean {
    return this.atomically(() => {
      const row = this.db.get("SELECT version, publication_pending_json FROM datasets WHERE id = ?", [id]);
      if (!row) return false;
      if (row.publication_pending_json) throw datasetErrors.publication_pending("上次固定版本还没存完，请先在原位置恢复，再移动");
      if (String(row.version) !== revision) throw datasetErrors.conflict("数据表刚被修改，请重新读取后再移动");
      this.db.run("DELETE FROM dataset_versions WHERE dataset_id = ?", [id]);
      this.db.run("DELETE FROM dataset_source_bindings WHERE dataset_id = ?", [id]);
      return this.db.run("DELETE FROM datasets WHERE id = ? AND version = ?", [id, row.version as number]).changes === 1;
    });
  }

  /** A CSV delivery with a stable source updates its bound table in the current project. */
  receiveCsv(requestId: string, title: string, csv: string, sourceKey?: string): DatasetRecord {
    return this.once("receive:" + requestId, () => {
      const parsed = parseCsv(csv);
      if (parsed.columns.length === 0) throw datasetErrors.invalid("收到的内容不是带表头的 CSV");
      if (!sourceKey) {
        const created = this.create({ title: [...title].slice(0, 80).join("") });
        return this.update(created.id, { ...parsed, expected_version: created.version });
      }
      const binding = this.db.get(`SELECT dataset_source_bindings.dataset_id FROM dataset_source_bindings
        JOIN datasets ON datasets.id = dataset_source_bindings.dataset_id
        WHERE source_key = ?`, [sourceKey]);
      const existing = binding
        ? this.get(String(binding.dataset_id))
        : this.create({ title: [...title].slice(0, 80).join("") });
      const { columns, rows } = mergeAppendedCsvIntoDataset(existing, parsed);
      const dataset = rows.length === existing.rows.length && columns.length === existing.columns.length
        ? existing
        : this.update(existing.id, { columns, rows, expected_version: existing.version });
      const now = new Date().toISOString();
      this.db.run(`INSERT INTO dataset_source_bindings (source_key, dataset_id, created_at, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(source_key)
        DO UPDATE SET dataset_id = excluded.dataset_id, updated_at = excluded.updated_at`,
        [sourceKey, dataset.id, now, now]);
      return dataset;
    });
  }

  private once(requestId: string, make: () => DatasetRecord): DatasetRecord {
    return this.atomically(() => {
      const prior = this.db.get("SELECT dataset_id FROM dataset_receipts WHERE request_id = ?", [requestId]);
      if (prior) return this.get(String(prior.dataset_id));
      const made = make();
      this.db.run("INSERT INTO dataset_receipts (request_id, dataset_id, created_at) VALUES (?, ?, ?)", [requestId, made.id, new Date().toISOString()]);
      return made;
    });
  }

  delete(id: string, expectedVersion?: number): void {
    this.atomically(() => {
      const current = this.get(id); assertDatasetVersion(current, expectedVersion);
      if (current.publication_pending) throw datasetErrors.publication_pending("请先恢复上次发布，再删除数据表");
      this.db.run("DELETE FROM dataset_versions WHERE dataset_id = ?", [id]);
      this.db.run("DELETE FROM dataset_source_bindings WHERE dataset_id = ?", [id]);
      this.db.run("DELETE FROM datasets WHERE id = ?", [id]);
    });
  }

  generateColumn(id: string, prompt: string, expectedVersion?: number): DatasetRecord {
    const current = this.get(id);
    const name = prompt.trim() || `列 ${current.columns.length + 1}`;
    if ([...name].length > 80) throw datasetErrors.invalid("列名须为 1 到 80 个字");
    const column: DatasetColumn = {
      id: crypto.randomUUID(),
      name,
      type: "text",
      order: current.columns.length + 1,
    };
    return this.update(id, { columns: [...current.columns, column], expected_version: expectedVersion ?? current.version });
  }

  importCsv(id: string, csv: string, expectedVersion?: number): DatasetRecord {
    const parsed = parseCsv(csv);
    if (parsed.columns.length === 0) throw datasetErrors.invalid("CSV 至少要有表头");
    return this.update(id, { columns: parsed.columns, rows: parsed.rows, expected_version: expectedVersion });
  }

  saveVersion(id: string, note?: string, expectedVersion?: number): DatasetVersionRecord {
    return this.atomically(() => {
    const snapshot = this.get(id);
    assertDatasetVersion(snapshot, expectedVersion);
    const record: DatasetVersionRecord = {
      id: crypto.randomUUID(),
      dataset_id: id,
      note: [...(note ?? "").trim()].slice(0, 80).join(""),
      snapshot,
      created_at: new Date().toISOString(),
    };
    this.db.run("INSERT INTO dataset_versions (id, dataset_id, note, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)",
      [record.id, record.dataset_id, record.note, JSON.stringify(record.snapshot), record.created_at]);
    return record;
    });
  }

  listVersions(id: string): DatasetVersionRecord[] {
    this.get(id);
    const rows = this.db.all("SELECT id, dataset_id, note, snapshot_json, created_at FROM dataset_versions WHERE dataset_id = ? ORDER BY datetime(created_at) DESC", [id]);
    return rows.map((row) => ({
      id: String(row.id),
      dataset_id: String(row.dataset_id),
      note: String(row.note),
      snapshot: JSON.parse(String(row.snapshot_json)) as DatasetRecord,
      created_at: String(row.created_at),
    }));
  }

  rollback(id: string, versionId: string, expectedVersion?: number): DatasetRecord {
    const versions = this.listVersions(id);
    const target = versions.find((item) => item.id === versionId);
    if (!target) throw datasetErrors.not_found("找不到这个版本");
    return this.update(id, {
      title: target.snapshot.title,
      description: target.snapshot.description,
      columns: target.snapshot.columns,
      rows: target.snapshot.rows,
      expected_version: expectedVersion,
    });
  }

  /** The one cast from the SQL rows to this store's row shape: the columns are the schema's. */
  private rows(sql: string, parameters?: readonly DatasetSqlValue[]): DatasetRowDb[] {
    return this.db.all(sql, parameters) as unknown as DatasetRowDb[];
  }

  private write(record: DatasetRecord, insert: boolean): void {
    if (insert) {
      this.db.run("INSERT INTO datasets (id, title, description, status, columns_json, rows_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [record.id, record.title, record.description, record.status,
          JSON.stringify(record.columns), JSON.stringify(record.rows), record.created_at, record.updated_at, record.version]);
      return;
    }
    const result = this.db.run("UPDATE datasets SET title = ?, description = ?, status = ?, columns_json = ?, rows_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
      [record.title, record.description, record.status, JSON.stringify(record.columns), JSON.stringify(record.rows),
        record.updated_at, record.version, record.id, record.version - 1]);
    if (result.changes !== 1) throw datasetErrors.conflict("数据表已改变，请重新读取后保存");
  }
}


function mergeAppendedCsvIntoDataset(existing: DatasetRecord, parsed: { columns: DatasetColumn[]; rows: DatasetRow[] }) {
  const columns = [...existing.columns];
  const existingByName = new Map<string, DatasetColumn[]>();
  for (const column of existing.columns) {
    const name = column.name.trim();
    const matches = existingByName.get(name);
    if (matches) matches.push(column);
    else existingByName.set(name, [column]);
  }
  const isRequestId = (column: DatasetColumn) => column.name.trim().toLowerCase() === "request_id";
  const incomingKey = parsed.columns.find(isRequestId);
  const existingKey = existing.columns.find(isRequestId);
  const targetByIncomingId = new Map<string, string>();
  for (const incoming of parsed.columns) {
    const matches = existingByName.get(incoming.name.trim());
    const match = incoming === incomingKey && existingKey ? existingKey : matches?.find(column => column !== existingKey);
    if (match) {
      const matchList = existingByName.get(match.name.trim());
      if (matchList) matchList.splice(matchList.indexOf(match), 1);
      targetByIncomingId.set(incoming.id, match.id);
      continue;
    }
    const id = crypto.randomUUID();
    targetByIncomingId.set(incoming.id, id);
    columns.push({ ...incoming, id, order: columns.length + 1 });
  }

  const keys = new Set(existingKey ? existing.rows.map(row => (row.cells[existingKey.id] ?? "").trim()) : []);
  const rows = [...existing.rows];
  for (const row of parsed.rows) {
    const key = incomingKey ? (row.cells[incomingKey.id] ?? "").trim() : "";
    if (key && keys.has(key)) continue;
    if (key) keys.add(key);
    const cells = Object.fromEntries(columns.map(column => [column.id, ""]));
    for (const [incomingId, targetId] of targetByIncomingId) cells[targetId] = row.cells[incomingId] ?? "";
    rows.push({ id: row.id, cells });
  }
  if (rows.length > 2000) throw datasetErrors.invalid("追加后总行数超过 2000 行上限");
  return { columns, rows };
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
      if (closed || char === '"') throw datasetErrors.invalid("CSV 引号格式无效");
      cell += char; started = true;
    }
  }
  if (quoted) throw datasetErrors.invalid("CSV 引号未闭合");
  endRow();
  return records;
}

export function assertDatasetVersion(current: DatasetRecord, expectedVersion?: number): void {
  if (expectedVersion !== undefined && expectedVersion !== current.version) throw datasetErrors.conflict("数据表已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
}

export function fromRow(row: DatasetRowDb, partition: string): DatasetRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as NonNullable<DatasetRecord["publication_pending"]> : null;
  return {
    id: row.id,
    project_id: partition,
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

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名数据表";
  if ([...title].length > 80) throw datasetErrors.invalid("标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if ([...value].length > 2000) throw datasetErrors.invalid("说明须为 0 到 2000 个字");
  return value;
}

function normalizeColumns(value: readonly DatasetColumnInput[]): DatasetColumn[] {
  if (!Array.isArray(value)) throw datasetErrors.invalid("列须是列表");
  if (value.length > 40) throw datasetErrors.invalid("最多 40 列");
  return value.map((column, index) => ({
    id: column.id || crypto.randomUUID(),
    name: normalizeColumnName(column.name, index),
    type: column.type && COLUMN_TYPES.includes(column.type) ? column.type : "text",
    order: index + 1,
  }));
}

function normalizeColumnName(value: string, index: number): string {
  const name = String(value ?? "").trim() || `列 ${index + 1}`;
  if ([...name].length > 80) throw datasetErrors.invalid("列名最多 80 个字，请保留原 CSV 并缩短表头后再导入");
  return name;
}

function normalizeRows(rows: readonly DatasetRowInput[], columns: readonly DatasetColumn[]): DatasetRow[] {
  if (!Array.isArray(rows)) throw datasetErrors.invalid("行须是列表");
  if (rows.length > 2000) throw datasetErrors.invalid("最多 2000 行");
  return rows.map((row) => ({
    id: row.id || crypto.randomUUID(),
    cells: Object.fromEntries(columns.map((column) => [column.id, String(row.cells?.[column.id] ?? "")])),
  }));
}

/** A carried table's record, as `exportRecord` wrote it; anything else is refused before a row is written. */
function carriedDataset(record: PlacementRecord): { title: string; description: string; columns: DatasetColumnInput[]; rows: DatasetRowInput[]; created_at: string;
  updated_at: string; version: number; versions: Array<{ id: string; note: string; snapshot: DatasetRecord; created_at: string }> } {
  const { title, description, columns_json, rows_json, created_at, updated_at, version, versions } = record;
  const invalid = () => datasetErrors.invalid("带来的数据表内容不完整");
  if (typeof title !== "string" || typeof description !== "string" || typeof columns_json !== "string" || typeof rows_json !== "string"
    || typeof created_at !== "string" || typeof updated_at !== "string" || !Number.isSafeInteger(version) || (version as number) < 1
    || !Array.isArray(versions) || versions.some(row => typeof row !== "string")) throw invalid();
  const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { throw invalid(); } };
  const saved = (versions as string[]).map(text => {
    const row = parse(text) as { id?: unknown; note?: unknown; snapshot_json?: unknown; created_at?: unknown } | null;
    if (!row || typeof row.id !== "string" || !row.id || typeof row.note !== "string" || typeof row.snapshot_json !== "string" || typeof row.created_at !== "string") throw invalid();
    const snapshot = parse(row.snapshot_json) as DatasetRecord | null;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw invalid();
    normalizeRows(snapshot.rows, normalizeColumns(snapshot.columns));
    return { id: row.id, note: row.note, snapshot, created_at: row.created_at };
  });
  return { title: normalizeTitle(title), description: normalizeDescription(description), columns: parse(columns_json) as DatasetColumnInput[],
    rows: parse(rows_json) as DatasetRowInput[], created_at, updated_at, version: version as number, versions: saved };
}
