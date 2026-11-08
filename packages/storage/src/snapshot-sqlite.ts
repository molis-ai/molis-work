import { createHash } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { readDatabaseSpace, spaceMetadataShapeMatches, STORAGE_SPACE_SCHEMA_SQL, type StorageSpace } from "./space.js";
import { snapshotProgramsMatch } from "./sqlite-baseline-inspection.js";
import { openSqliteConnection, sqliteErrorName } from "./sqlite-connection.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  describeSqliteBaseline,
  describeSqliteSchema,
  isSqliteVersionRefusal,
  sqliteVersionMismatch,
  type SqliteBaseline,
} from "./sqlite-baseline.js";
import type { SqliteDatabase } from "./sqlite.js";
import { snapshotFileDigest, snapshotFileStat } from "./snapshot-files.js";

const invalid = (message: string) =>
  new ActionError("actions.input_invalid", message, { kind: "invalid" });
const changed = (file: string) =>
  new ActionError("actions.conflict", `快照期间库文件、版本或结构变化: ${file}`, {
    kind: "conflict",
  });

export interface SqliteSnapshotOptions {
  readonly baseline?: SqliteBaseline;
  /** When a store carries space metadata, compare it to the trusted Home's immutable owner. */
  readonly space?: StorageSpace;
  /** The owner opens this library as a Home-bound store; deleting its binding cannot downgrade it to an unbound one. */
  readonly requireSpace?: boolean;
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

/** Inspect a standalone archived backup. Reject WAL headers/sidecars before SQLite can create read marks. */
export function inspectSnapshotSqlite(file: string, options: SqliteSnapshotOptions = {}): SqliteSnapshotInfo {
  const before = snapshotFileStat(file);
  const standalone = () => {
    for (const suffix of ["-wal", "-shm", "-journal"])
      if (lstatSync(file + suffix, { throwIfNoEntry: false })) throw invalid(`归档库必须是独立文件: ${file}`);
  };
  standalone();
  const fd = openSync(file, "r"), header = Buffer.alloc(20);
  try { if (readSync(fd, header, 0, 20, 0) !== 20 || header[18] !== 1 || header[19] !== 1) throw invalid(`归档库必须是独立 SQLite 文件: ${file}`); }
  finally { closeSync(fd); }
  options.signal?.throwIfAborted();
  const database = openSqliteConnection(file, { readonly: true, fileMustExist: true, timeout: 0 });
  try {
    const result = inspect(database, file, options);
    const after = snapshotFileStat(file);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw changed(file);
    standalone(); options.signal?.throwIfAborted();
    return result;
  } finally { database.close(); }
}

function inspect(
  database: SqliteDatabase,
  file: string,
  options: SqliteSnapshotOptions,
  previous?: SqliteSnapshotInfo,
): SqliteSnapshotInfo {
  try {
    return inspectDatabase(database, file, options, previous);
  } catch (error) {
    if (
      error !== options.signal?.reason &&
      sqliteErrorName(error) === "SQLITE_ERROR"
    )
      throw invalid(`快照库结构或完整性检查失败: ${file}`);
    throw error;
  }
}

function inspectDatabase(
  database: SqliteDatabase,
  file: string,
  options: SqliteSnapshotOptions,
  previous?: SqliteSnapshotInfo,
): SqliteSnapshotInfo {
  const userVersion = Number(database.pragma("user_version", { simple: true }));
  if (previous && userVersion !== previous.user_version) throw changed(file);
  const expectedVersion = options.baseline?.version ?? options.version;
  if (expectedVersion !== undefined && userVersion !== expectedVersion)
    throw sqliteVersionMismatch(file, userVersion, expectedVersion);
  const shape = describeSqliteSchema(database);
  if (shape.tables.molis_storage_space && !spaceMetadataShapeMatches(database))
    throw invalid(`快照库的空间元数据结构不符: ${file}`);
  const databaseSpace = readDatabaseSpace(database);
  if ((options.requireSpace && (!options.space || !databaseSpace)) || (databaseSpace && options.space && !isDeepStrictEqual(databaseSpace, options.space)))
    throw invalid(`快照库的空间归属与 Home 不同: ${file}`);
  const schemaHash = createHash("sha256").update(JSON.stringify(shape)).digest("hex");
  if (previous && schemaHash !== previous.schema_sha256) throw changed(file);
  if (options.version !== undefined && !options.baseline && database.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('view','trigger') LIMIT 1").get())
    throw invalid(`快照库含缺少可信声明的可执行对象: ${file}`);
  if (options.baseline) {
    const scoped = databaseSpace ? { ...options.baseline, schema: STORAGE_SPACE_SCHEMA_SQL + options.baseline.schema } : options.baseline;
    const expected = describeSqliteBaseline(scoped);
    if (!snapshotProgramsMatch(database, scoped.schema, options.additionalTables === true))
      throw invalid(`快照库的可执行对象与现行 owner 基线不符: ${file}`);
    const actual = options.additionalTables
      ? {
          tables: Object.fromEntries(
            Object.keys(expected.tables).map(name => [name, shape.tables[name]]),
          ),
        }
      : shape;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw invalid(`快照库的结构与现行 owner 基线不符: ${file}`);
  }
  const integrity = database.pragma("integrity_check") as Array<Record<string, unknown>>;
  if (
    !integrity.length ||
    !integrity.every(row => Object.values(row).every(value => value === "ok"))
  )
    throw invalid(`快照库完整性检查失败: ${file}`);
  if (database.prepare("PRAGMA foreign_key_check").all().length)
    throw invalid(`快照库外键检查失败: ${file}`);
  let ownerVersions: SqliteSnapshotInfo["owner_versions"];
  try {
    ownerVersions = options.inspect?.(database) ?? {};
  } catch (error) {
    if (
      previous &&
      error !== options.signal?.reason &&
      (isSqliteVersionRefusal(error) ||
        error instanceof ActionError && error.kind === "invalid")
    )
      throw changed(file);
    throw error;
  }
  if (previous && JSON.stringify(ownerVersions) !== JSON.stringify(previous.owner_versions))
    throw changed(file);
  return {
    user_version: userVersion,
    owner_versions: ownerVersions,
    schema_sha256: schemaHash,
    integrity_check: "ok",
    foreign_key_check: "ok",
  };
}

/** SQLite's backup API includes committed WAL pages. No live file/sidecar is copied or checkpointed. */
export async function backupSnapshotSqlite(
  source: string,
  destination: string,
  options: SqliteSnapshotOptions = {},
) {
  const before = snapshotFileStat(source);
  let database: SqliteDatabase | undefined;
  try {
    database = openSqliteConnection(source, { readonly: true, fileMustExist: true, timeout: 0 });
    options.signal?.throwIfAborted();
    const original = inspect(database, source, options);
    await database.backup(destination, { rate: 128, progress: () => options.signal?.throwIfAborted() });
    options.signal?.throwIfAborted();
    const current = lstatSync(source);
    if (
      before.dev !== current.dev ||
      before.ino !== current.ino ||
      before.size !== current.size ||
      before.mode !== current.mode ||
      before.nlink !== current.nlink ||
      before.mtimeMs !== current.mtimeMs ||
      before.ctimeMs !== current.ctimeMs ||
      realpathSync(source) !== source
    )
      throw changed(source);
    chmodSync(destination, 0o600);
    const copied = openSqliteConnection(destination, { fileMustExist: true, timeout: 0 });
    let result: SqliteSnapshotInfo;
    try {
      // Only the private backup is normalized into a standalone file.
      copied.pragma("journal_mode = DELETE");
      result = inspect(copied, destination, options, original);
    } finally {
      copied.close();
    }
    const output = openSync(destination, "r");
    try {
      fsyncSync(output);
    } finally {
      closeSync(output);
    }
    return { ...snapshotFileDigest(destination), mode: before.mode & 0o777, sqlite: result };
  } catch (error) {
    if (
      error !== options.signal?.reason &&
      (sqliteErrorName(error) === "SQLITE_CORRUPT" || sqliteErrorName(error) === "SQLITE_NOTADB")
    )
      throw invalid(`快照库不是有效的 SQLite 数据: ${source}`);
    throw error;
  } finally {
    database?.close();
  }
}
