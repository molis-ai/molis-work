import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** What a baseline needs from a connection: `node:sqlite` and better-sqlite3 both fit. */
export interface SqliteBaselineDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
}
import { homeSqlitePath, openHomeSqliteDatabase } from "./home-sqlite.js";

/** A store on disk at another schema version than the one this build knows (repository-anti-corruption §4.1). */
export class SqliteSchemaVersionError extends Error {
  readonly code = "storage.schema_version_mismatch";
  constructor(readonly path: string, readonly found: number, readonly expected: number) {
    super(`${path} 的结构版本是 ${found}，这个版本的 Molis Work 只认 ${expected}；不就地升级。请用与它相符的版本打开，或备份后移走这个库让它重建。`);
    this.name = "SqliteSchemaVersionError";
  }
}

export interface SqliteBaseline {
  /** The one schema version this build knows, kept in `PRAGMA user_version`. */
  readonly version: number;
  /** The current schema's complete creation statements. */
  readonly schema: string;
}

/** A baseline's expected shape, described once from its creation statements (the memory reference is not rebuilt per open). */
const expectedShapes = new WeakMap<SqliteBaseline, SqliteSchemaShape>();
function expectedShape(baseline: SqliteBaseline): SqliteSchemaShape {
  let shape = expectedShapes.get(baseline);
  if (!shape) { shape = describeSqliteBaseline(baseline); expectedShapes.set(baseline, shape); }
  return shape;
}

/**
 * Whether an open store carries the baseline's structure: every table of the baseline is there with the baseline's shape. Extra tables
 * are a plugin's own (a project library gets the built-in plugins' tables on top of the platform baseline), so they are not a mismatch;
 * a baseline table that changed or disappeared is.
 */
function baselineShapePresent(db: SqliteBaselineDatabase, baseline: SqliteBaseline): boolean {
  const found = describeSqliteSchema(db), expected = expectedShape(baseline);
  return Object.entries(expected.tables).every(([name, table]) => found.tables[name] !== undefined
    && JSON.stringify(found.tables[name]) === JSON.stringify(table));
}

/** A same-version store whose structure is not the baseline's: refused, never repaired in place (repository-anti-corruption §4.1). */
const structureMismatchTag = Symbol("sqlite schema structure mismatch");
function structureMismatch(path: string): Error {
  return Object.assign(new Error(`${path} 的结构与当前完整基线不符，不会就地修补。请用与它相符的版本打开，或备份后移走这个库让它重建。`), { [structureMismatchTag]: true });
}

/** Whether an error is the refusal above, for callers that give this store its own name and recovery page. */
export const isSqliteSchemaStructureMismatch = (error: unknown): error is Error =>
  error instanceof Error && Reflect.get(error, structureMismatchTag) === true;

/**
 * Refuse an existing store before a writable connection can change it: another version (or tables without one) is refused with both
 * versions, and a same-version store whose structure is not the baseline's is refused too. A missing or empty file is left for the
 * writable open to create. Everything here runs read-only: bytes, mode and journal files are exactly as they were when it returns.
 */
function inspectSqliteBaseline(path: string, baseline: SqliteBaseline): void {
  if (!existsSync(path)) return;
  const inspection = new DatabaseSync(path, { readOnly: true });
  try {
    const found = Number((inspection.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    const empty = !inspection.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
    if (found !== baseline.version) {
      if (found !== 0 || !empty) throw new SqliteSchemaVersionError(path, found, baseline.version);
      return;
    }
    if (!empty && !baselineShapePresent(inspection, baseline)) throw structureMismatch(path);
  } finally { inspection.close(); }
}

/**
 * Give a database exactly one current schema (repository-anti-corruption §4.1): an empty file gets `schema` and
 * `version` in one transaction; the same version is left as it is (its structure is compared too); anything else — another
 * version, or tables without a version — is refused with the path and both versions, never upgraded in place.
 * `alreadyInspect` says `inspectSqliteBaseline` has just compared this file's structure read-only, so it is not described again.
 */
export function applySqliteBaseline(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline, inspect: { shapeChecked?: boolean } = {}): void {
  if (!Number.isInteger(baseline.version) || baseline.version < 1) throw new Error("基线版本必须是正整数");
  const found = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (found === baseline.version) {
    const empty = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
    if (!inspect.shapeChecked && !empty && !baselineShapePresent(db, baseline)) throw structureMismatch(path);
    return;
  }
  const empty = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
  if (found !== 0 || !empty) throw new SqliteSchemaVersionError(path, found, baseline.version);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(baseline.schema);
    db.exec(`PRAGMA user_version = ${baseline.version}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * `openHomeSqliteDatabase` with one current schema: the store is created at, or must already be at, `baseline.version`. An existing
 * store is inspected read-only first (version and structure), so a wrong one is refused before a writable connection, its chmod or a
 * journal file can change anything.
 */
export function openBaselineHomeSqlite(homeDirectory: string, storeName: string, baseline: SqliteBaseline, projectId?: string): DatabaseSync {
  const path = homeSqlitePath(homeDirectory, storeName, projectId);
  inspectSqliteBaseline(path, baseline);
  const db = openHomeSqliteDatabase(homeDirectory, storeName, projectId);
  try {
    applySqliteBaseline(db, path, baseline, { shapeChecked: true });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** What makes two schemas the same: tables, their columns in order, indexes, foreign keys and CHECK clauses. */
export interface SqliteSchemaShape {
  tables: Record<string, {
    columns: Array<{ name: string; type: string; notnull: boolean; default: string | null; pk: number }>;
    checks: string[];
    foreign_keys: Array<{ table: string; from: string; to: string | null; on_delete: string; on_update: string }>;
    indexes: Array<{ name: string; unique: boolean; columns: string[]; where: string | null }>;
  }>;
}

const squash = (text: string) => text.replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim();

/** The CHECK clauses of a table's creation statement, each with its parentheses balanced. */
function checkClauses(sql: string): string[] {
  const clauses: string[] = [];
  const pattern = /\bCHECK\s*\(/giu;
  for (let match = pattern.exec(sql); match; match = pattern.exec(sql)) {
    let depth = 1, index = match.index + match[0].length;
    for (; index < sql.length && depth > 0; index += 1) {
      if (sql[index] === "(") depth += 1;
      else if (sql[index] === ")") depth -= 1;
    }
    clauses.push(squash(sql.slice(match.index + match[0].length, index - 1)));
  }
  return clauses.sort();
}

/**
 * The structure of a database, independent of how its statements were written or in which order columns were once
 * added (repository-anti-corruption §4.1): used to tell whether a store on disk already is the current baseline.
 */
export function describeSqliteSchema(db: SqliteBaselineDatabase): SqliteSchemaShape {
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string; sql: string }>;
  const shape: SqliteSchemaShape = { tables: {} };
  for (const table of tables) {
    const quoted = `"${table.name.replace(/"/g, '""')}"`;
    const columns = (db.prepare(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>)
      .map(column => ({ name: column.name, type: column.type.toUpperCase(), notnull: Boolean(column.notnull), default: column.dflt_value, pk: column.pk }));
    const foreignKeys = (db.prepare(`PRAGMA foreign_key_list(${quoted})`).all() as Array<{ table: string; from: string; to: string | null; on_delete: string; on_update: string }>)
      .map(key => ({ table: key.table, from: key.from, to: key.to, on_delete: key.on_delete, on_update: key.on_update }))
      .sort((left, right) => `${left.table}.${left.from}`.localeCompare(`${right.table}.${right.from}`));
    const indexes = (db.prepare(`PRAGMA index_list(${quoted})`).all() as Array<{ name: string; unique: number; origin: string }>)
      .map(index => {
        const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(index.name) as { sql: string | null } | undefined)?.sql ?? null;
        const where = sql && /\bWHERE\b/iu.test(sql) ? squash(sql.slice(sql.search(/\bWHERE\b/iu) + 5)) : null;
        const indexColumns = (db.prepare(`PRAGMA index_info("${index.name.replace(/"/g, '""')}")`).all() as Array<{ name: string | null }>).map(column => column.name ?? "<expr>");
        // Automatic indexes for PRIMARY KEY and UNIQUE carry generated names; what they cover is the identity.
        return { name: index.origin === "c" ? index.name : `auto:${index.origin}:${indexColumns.join(",")}`, unique: Boolean(index.unique), columns: indexColumns, where };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    shape.tables[table.name] = { columns, checks: checkClauses(table.sql ?? ""), foreign_keys: foreignKeys, indexes };
  }
  return shape;
}

/** One entry of a database's schema table. `automatic`: made by SQLite itself for a PRIMARY KEY or UNIQUE, without a statement. */
export interface SqliteSchemaObject { type: string; name: string; table: string; automatic: boolean }

/** Every object of a database, its own bookkeeping tables included, so a caller can tell what exists besides tables. */
export function listSqliteObjects(db: SqliteBaselineDatabase): SqliteSchemaObject[] {
  return (db.prepare("SELECT type, name, tbl_name AS \"table\", sql IS NULL AS automatic FROM sqlite_master ORDER BY type, name").all() as
    Array<{ type: string; name: string; table: string; automatic: number }>)
    .map(row => ({ type: row.type, name: row.name, table: row.table, automatic: Boolean(row.automatic) }));
}

/** Describe the current creation statements with SQLite itself, without opening or changing a Home library. */
export function describeSqliteBaseline(baseline: SqliteBaseline): SqliteSchemaShape {
  const reference = new DatabaseSync(":memory:");
  try {
    reference.exec(baseline.schema);
    return describeSqliteSchema(reference);
  } finally { reference.close(); }
}

/**
 * Runs `clear` in one write transaction on a personal library of the Home, straight from its file, for a project's
 * data that has to go when the project is deleted. A library that does not exist yet has nothing to clear and is not
 * created; one at another schema version is refused like anywhere else. Returns undefined when there was no library.
 */
export function clearInExistingHomeSqlite<T>(homeDirectory: string, storeName: string, baseline: SqliteBaseline,
  clear: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T | undefined {
  if (!existsSync(homeSqlitePath(homeDirectory, storeName))) return undefined;
  const db = openBaselineHomeSqlite(homeDirectory, storeName, baseline);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = clear(db);
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}
