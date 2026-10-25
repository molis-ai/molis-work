import { createHash } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, openSync } from "node:fs";
import Database from "better-sqlite3";
import { describeSqliteBaseline, describeSqliteSchema, SqliteSchemaVersionError, type SqliteBaseline } from "./sqlite-baseline.js";
import type { SqliteDatabase } from "./sqlite.js";
import { snapshotFileDigest, snapshotFileStat } from "./snapshot-files.js";

export interface SqliteSnapshotOptions {
  readonly baseline?: SqliteBaseline;
  /** Installed libraries already have a version owner even when the declaration's SQL is not retained. */
  readonly version?: number;
  /** A project library also contains its plugins' separately owned tables. */
  readonly additionalTables?: boolean;
  readonly inspect?: (database: SqliteDatabase) => Readonly<Record<string, string | number>>;
  readonly signal?: AbortSignal;
}

export interface SqliteSnapshotInfo {
  readonly user_version: number;
  readonly owner_versions: Readonly<Record<string, string | number>>;
  readonly schema_sha256: string;
  readonly integrity_check: "ok";
  readonly foreign_key_check: "ok";
}

export interface SqliteSnapshotMetadata {
  readonly table: string;
  readonly owner: string;
  readonly version: number;
}

/** A storage owner's literal metadata declaration; only owner/schema_version, never business rows. */
export function readSqliteSnapshotMetadata(database: SqliteDatabase, expected: SqliteSnapshotMetadata): Readonly<Record<string, string | number>> {
  if (!/^[a-z][a-z0-9_]*$/u.test(expected.table) || !Number.isSafeInteger(expected.version) || expected.version < 1) throw new Error("快照版本元数据声明无效");
  const rows = database.prepare(`SELECT key, value FROM "${expected.table}" WHERE key IN ('owner', 'schema_version')`).all() as Array<{ key: string; value: string }>;
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  if (rows.length !== 2 || values.owner !== expected.owner || Number(values.schema_version) !== expected.version) throw new Error("退役存储的 owner 或版本不符，未生成快照");
  return { owner: values.owner, schema_version: Number(values.schema_version) };
}

function inspect(database: SqliteDatabase, file: string, options: SqliteSnapshotOptions): SqliteSnapshotInfo {
  const userVersion = Number(database.pragma("user_version", { simple: true }));
  const expectedVersion = options.baseline?.version ?? options.version;
  if (expectedVersion !== undefined && userVersion !== expectedVersion) throw new SqliteSchemaVersionError(file, userVersion, expectedVersion);
  const shape = describeSqliteSchema(database);
  if (options.baseline) {
    const expected = describeSqliteBaseline(options.baseline);
    const actual = options.additionalTables
      ? { tables: Object.fromEntries(Object.keys(expected.tables).map(name => [name, shape.tables[name]])) } : shape;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`快照库的结构与现行 owner 基线不符: ${file}`);
  }
  const integrity = database.pragma("integrity_check") as Array<Record<string, unknown>>;
  if (!integrity.length || !integrity.every(row => Object.values(row).every(value => value === "ok"))) throw new Error(`快照库完整性检查失败: ${file}`);
  if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`快照库外键检查失败: ${file}`);
  return { user_version: userVersion, owner_versions: options.inspect?.(database) ?? {},
    schema_sha256: createHash("sha256").update(JSON.stringify(shape)).digest("hex"), integrity_check: "ok", foreign_key_check: "ok" };
}

/** SQLite's backup API includes committed WAL pages. No live file/sidecar is copied or checkpointed. */
export async function backupSnapshotSqlite(source: string, destination: string, options: SqliteSnapshotOptions = {}) {
  const before = snapshotFileStat(source);
  const database = new Database(source, { readonly: true, fileMustExist: true, timeout: 0 });
  try {
    options.signal?.throwIfAborted();
    const original = inspect(database, source, options);
    await database.backup(destination, { progress: () => { options.signal?.throwIfAborted(); return 128; } });
    const current = snapshotFileStat(source);
    if (before.dev !== current.dev || before.ino !== current.ino) throw new Error(`快照期间库文件被替换: ${source}`);
    chmodSync(destination, 0o600);
    const copied = new Database(destination, { fileMustExist: true, timeout: 0 });
    let result: SqliteSnapshotInfo;
    try {
      // Only the private backup is normalized into a standalone file.
      copied.pragma("journal_mode = DELETE");
      result = inspect(copied, destination, options);
      if (JSON.stringify(result) !== JSON.stringify(original)) throw new Error(`快照期间库版本或结构变化: ${source}`);
    } finally { copied.close(); }
    const output = openSync(destination, "r");
    try { fsyncSync(output); } finally { closeSync(output); }
    return { ...snapshotFileDigest(destination), mode: before.mode & 0o777, sqlite: result };
  } finally { database.close(); }
}
