import { rollbackPreservingError } from "./transaction-errors.js";
import { readDatabaseSpace, readStorageSpace, spaceMetadataShapeMatches, STORAGE_SPACE_SCHEMA_SQL } from "./space.js";
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * What a baseline needs from a connection: `node:sqlite` itself and the project connection both fit. `run` is for an upgrade step that
 * writes rows computed outside SQL (an id from a hash), with positional parameters.
 */
export interface SqliteBaselineDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
}
import { homeSqlitePath, openHomeSqliteDatabase } from "./home-sqlite.js";

/**
 * One step of a store's upgrade chain: from version `from` to `from + 1` (`from + 1` is not written, so a gap is a mechanical failure).
 * A step runs inside the upgrade's one transaction (sqlite-upgrade.ts); it throws to fail and leaves recovery to the run.
 */
export interface SqliteUpgradeStep {
  readonly from: number;
  /** A step that is only SQL. */
  readonly sql?: string;
  /** A platform or Module step that fills new columns from existing ones. It only uses exec/prepare and never touches files. */
  readonly run?: (db: SqliteBaselineDatabase) => void;
  /** Tables this step means to shrink. Every other table must keep at least its row count. */
  readonly reduces_rows?: readonly string[];
  /** Rebuilds a table, which needs foreign keys off: they can only be switched outside the transaction, so the run does it. */
  readonly rebuilds_tables?: boolean;
  /** The owner's own check, inside the transaction, before commit. */
  readonly verify?: (db: SqliteBaselineDatabase) => void;
}

export interface SqliteBaseline {
  /** The one schema version this build knows, kept in `PRAGMA user_version`. */
  readonly version: number;
  /** The current schema's complete creation statements. */
  readonly schema: string;
  /** How an older store reaches `version`: each `from` once, up to `version - 1`. Steps too old for any supported store may be dropped. */
  readonly upgrades?: readonly SqliteUpgradeStep[];
}

/** Where a store keeps its version. Nearly all use `PRAGMA user_version`; the project catalog keeps it in `catalog_meta`, so the same run can be handed that instead. */
export interface SqliteVersionAccess {
  read(db: SqliteBaselineDatabase): number;
  write(db: SqliteBaselineDatabase, version: number): void;
}

export const USER_VERSION_ACCESS: SqliteVersionAccess = {
  read: db => Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version),
  write: (db, version) => { db.exec(`PRAGMA user_version = ${version}`); },
};

/** The refusals and failures of a store's version and upgrade. `path` in `details` is relative to the Home, or just the file's name. */
export const storageErrors = defineErrorCodes("storage", {
  space_ownership_mismatch: "forbidden",
  schema_version_mismatch: "invalid",
  schema_structure_mismatch: "invalid",
  upgrade_pending: "unavailable",
  upgrade_in_progress: "unavailable",
  upgrade_failed: "internal",
  upgrade_no_space: "unavailable",
  store_too_new: "unavailable",
});

/** What a refusal may show about where the store is: an action error reaches the caller as it is, so never the absolute path. */
export function sqliteStoreLabel(path: string, home?: string): string {
  if (home !== undefined) {
    const inside = relative(home, path);
    if (inside && !inside.startsWith("..") && !isAbsolute(inside)) return inside;
  }
  return basename(path);
}

/** A store whose version mark is none an upgrade can start from: no version but tables, or a value no build ever wrote. */
export function sqliteVersionMismatch(path: string, found: number, expected: number, home?: string) {
  const store = sqliteStoreLabel(path, home);
  return storageErrors.schema_version_mismatch(
    `${store} 的结构版本是 ${found}，这个版本的 Molis Work 用 ${expected}，不能在这里使用。它没有被改动：请用与它相符的版本打开，或备份后移走它让它重建。`,
    { path: store, found, expected });
}

/**
 * The classification of a store at another version than the baseline's (upgrade-chain-design §2.1). It only names the state; nothing here
 * upgrades. Older than this build: the upgrade run takes it, every open path refuses until then. Newer: neither read nor written.
 */
export function sqliteVersionRefusal(path: string, found: number, expected: number, home?: string) {
  if (found < 1) return sqliteVersionMismatch(path, found, expected, home);
  const store = sqliteStoreLabel(path, home), details = { path: store, found, expected };
  return found < expected
    ? storageErrors.upgrade_pending(`${store} 的结构版本是 ${found}，这个版本的 Molis Work 用 ${expected}，升级完成之前不能打开。它没有被改动。`, details)
    : storageErrors.store_too_new(`${store} 的结构版本是 ${found}，比这个版本的 Molis Work（${expected}）新，所以不读也不写。请用更新版本的 Molis Work 打开。`, details);
}

/** Whether an error is one of the refusals above, for owners that give their store its own name and recovery page. */
export const isSqliteVersionRefusal = (error: unknown): error is ActionError =>
  error instanceof ActionError && (error.code === "storage.schema_version_mismatch" || error.code === "storage.upgrade_pending" || error.code === "storage.store_too_new"
    || error.code === "storage.upgrade_failed" || error.code === "storage.upgrade_no_space");

/** Hears of an older store being refused, by the path it was opened at. It may return what to raise instead: only the Host knows that this store's upgrade already failed. */
export type UpgradePendingListener = (path: string) => Error | undefined;
const upgradePendingListeners = new Set<UpgradePendingListener>();

/**
 * Tells the process holding a Home's lock that an open met an older store (upgrade-chain-design §3.3). Storage knows no Home, so it only
 * passes the signal on; a process that holds no lock has no listener and writes nothing. This is the only work an open path can add here,
 * and it is one emptiness check unless the open has already failed.
 */
export function onUpgradePending(listener: UpgradePendingListener): () => void {
  upgradePendingListeners.add(listener);
  return () => { upgradePendingListeners.delete(listener); };
}

/** The refusal an open raises, after the signal. A listener's own failure never hides the store's refusal. */
export function versionRefusalAfterSignal(path: string, found: number, expected: number, home?: string): Error {
  let replacement: Error | undefined;
  if (found >= 1 && found < expected) for (const listener of upgradePendingListeners) {
    try { replacement = listener(path) ?? replacement; }
    catch { /* The listener logs its own failures; what the caller needs to hear is that this store is refused. */ }
  }
  return replacement ?? sqliteVersionRefusal(path, found, expected, home);
}

/**
 * The version half of every baseline check, on whichever driver owns the file: true when the store is at the baseline's version, false
 * when it has no version and only an exact Home binding or no objects (the creation path). Anything else is refused by what it is
 * (`sqliteVersionRefusal`). This only classifies: it never upgrades, whatever steps the baseline carries.
 */
export function checkSqliteBaselineVersion(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline, home?: string): boolean {
  const found = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (found === baseline.version) return true;
  if (found !== 0 || !emptyForBaseline(db, path, home)) throw versionRefusalAfterSignal(path, found, baseline.version, home);
  return false;
}

/** A baseline's expected shape, described once from its creation statements (the memory reference is not rebuilt per open). */
const expectedShapes = new WeakMap<SqliteBaseline, { plain?: SqliteSchemaShape; withSpace?: SqliteSchemaShape }>();
function expectedShape(baseline: SqliteBaseline, includeSpace = false): SqliteSchemaShape {
  let forms = expectedShapes.get(baseline);
  if (!forms) expectedShapes.set(baseline, forms = {});
  const form = includeSpace ? "withSpace" : "plain";
  let shape = forms[form];
  if (!shape) forms[form] = shape = describeSqliteBaseline(includeSpace ? { ...baseline, schema: STORAGE_SPACE_SCHEMA_SQL + baseline.schema } : baseline);
  return shape;
}

/**
 * Whether an open store carries the baseline's structure: every table of the baseline is there with the baseline's shape. Extra tables
 * are a plugin's own (a project library gets the built-in plugins' tables on top of the platform baseline), so they are not a mismatch;
 * a baseline table that changed or disappeared is.
 */
const expectedTriggers = new WeakMap<SqliteBaseline, ReadonlyMap<string,string>>();
function baselineTriggers(baseline: SqliteBaseline): ReadonlyMap<string,string> {
  let result=expectedTriggers.get(baseline);
  if(!result){const reference=new DatabaseSync(':memory:');try{reference.exec(baseline.schema);result=sqliteTriggers(reference);expectedTriggers.set(baseline,result);}finally{reference.close();}}
  return result;
}
function sqliteTriggers(db: SqliteBaselineDatabase): ReadonlyMap<string,string> {
  return new Map((db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[]).map(row=>[row.name,row.sql.trim()]));
}
function baselineShapePresent(db: SqliteBaselineDatabase, baseline: SqliteBaseline, includeSpace = false): boolean {
  const found = describeSqliteSchema(db), expected = expectedShape(baseline, includeSpace);
  const triggers=sqliteTriggers(db);
  if([...baselineTriggers(baseline)].some(([name,sql])=>triggers.get(name)!==sql))return false;
  return Object.entries(expected.tables).every(([name, table]) => found.tables[name] !== undefined
    && JSON.stringify(found.tables[name]) === JSON.stringify(table));
}

/** The baseline comparison an upgrade ends with. A Home store also carries its binding table, whose shape has to survive the steps too. */
export function upgradedShapeMatches(db: SqliteBaselineDatabase, baseline: SqliteBaseline): boolean {
  const bound = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='molis_storage_space'").get() !== undefined;
  return baselineShapePresent(db, baseline, bound);
}

/** A same-version store whose structure is not the baseline's: refused, never repaired in place (repository-anti-corruption §4.1). */
const structureMismatch = (path: string, home?: string) => storageErrors.schema_structure_mismatch(
  `${sqliteStoreLabel(path, home)} 的结构与当前完整基线不符，不会就地修补。请用与它相符的版本打开，或备份后移走这个库让它重建。`);

/** Whether an error is the refusal above, for callers that give this store its own name and recovery page. */
export const isSqliteSchemaStructureMismatch = (error: unknown): error is ActionError =>
  error instanceof ActionError && error.code === "storage.schema_structure_mismatch";

/** Only a fresh file or the exact binding already published by this Home can receive its first business schema. */
function emptyForBaseline(db:SqliteBaselineDatabase, path:string, home?:string):boolean {
  const objects = db.prepare("SELECT type,name FROM sqlite_schema").all() as Array<{type:string; name:string}>;
  if (!objects.length) return true;
  if (objects.length !== 1 || objects[0]!.type !== "table" || objects[0]!.name !== "molis_storage_space") return false;
  if (!spaceMetadataShapeMatches(db)) throw structureMismatch(path, home);
  const row = db.prepare("SELECT space_id,descriptor FROM molis_storage_space WHERE singleton=1").get() as {space_id:string;descriptor:string}|undefined;
  if (!row) throw structureMismatch(path, home);
  if (home !== undefined) {
    const expected = readStorageSpace(home);
    if (!expected || row.space_id !== expected.spaceId || row.descriptor !== JSON.stringify(expected)) throw new Error("SPACE_OWNERSHIP_MISMATCH");
  }
  return true;
}

/**
 * What the last full comparison of a file with a baseline saw (upgrade-chain-design §3.2): each structure is compared once per process, not at every
 * open. `schema_version` is what makes this safe: in a WAL store a change of structure leaves the main file's identity as it was, and only that number moves.
 */
const comparedShapes = new WeakMap<SqliteBaseline, Map<string, string>>();
function shapeIdentity(path: string, db: SqliteBaselineDatabase, version: number): string {
  const { dev, ino, size, mtimeMs } = statSync(path);
  const { schema_version: cookie } = db.prepare("PRAGMA schema_version").get() as { schema_version: number };
  return [dev, ino, size, mtimeMs, cookie, version].join(":");
}

/**
 * Compare the current file structure once per unchanged identity and comparison mode. Callers still check version and ownership
 * and read current business rows on every open. Exact mode compares the whole table/index/foreign-key shape; baseline mode also
 * checks declared triggers and permits the extra tables that project plugins own. includeSpace adds Storage's binding structure
 * to either comparison without declaring a second database baseline. A failed comparison is never remembered.
 */
export function assertSqliteBaselineShape(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline,
  { home, mode = "baseline", includeSpace = false }: { home?: string; mode?: "baseline" | "exact"; includeSpace?: boolean } = {}): void {
  const identity = `${shapeIdentity(path, db, baseline.version)}:${mode}:${includeSpace}`;
  let compared = comparedShapes.get(baseline);
  if (compared?.get(path) === identity) return;
  const matches = mode === "exact" ? JSON.stringify(describeSqliteSchema(db)) === JSON.stringify(expectedShape(baseline, includeSpace)) : baselineShapePresent(db, baseline, includeSpace);
  if (!matches) throw structureMismatch(path, home);
  if (!compared) comparedShapes.set(baseline, compared = new Map());
  compared.set(path, identity);
}

/**
 * Refuse an existing store before a writable connection can change it: another version (or tables without one) is refused by what it is,
 * and a same-version store whose structure is not the baseline's is refused too. A missing or empty file is left for the
 * writable open to create. Everything here runs read-only: bytes, mode and journal files are exactly as they were when it returns.
 * Returns whether the read-only check could prove the file's version and structure; a hot journal (a write killed before commit) makes
 * a read-only connection fail with SQLITE_READONLY_ROLLBACK, and that crash recovery is left to the writable open — the caller then
 * checks the recovered database's version and structure in full.
 */
function inspectSqliteBaseline(path: string, baseline: SqliteBaseline, home?:string, verifyOwnership = false): boolean {
  if (!existsSync(path)) return false;
  try {
    // Immutable reads avoid creating WAL sidecars for a closed database. Never ignore an existing journal.
    const closed = () => !["-wal", "-shm", "-journal"].some(suffix => existsSync(path + suffix));
    const stamp = () => { const stat = statSync(path, { bigint: true }); return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":"); };
    const immutable = closed(), before = immutable ? stamp() : undefined;
    const uri = pathToFileURL(path); uri.searchParams.set("immutable", "1");
    const inspection = new DatabaseSync(immutable ? uri.href : path, { readOnly: true });
    try {
      if (!checkSqliteBaselineVersion(inspection, path, baseline, home)) return false;
      if (verifyOwnership) assertExistingHomeSpace(inspection, path, home);
      // A current version mark claims the baseline's schema: every baseline table must be there, even when no other business table is
      // left (a store whose tables were dropped is damaged, not an empty one). Only a file without a version is the creation path.
      assertSqliteBaselineShape(inspection, path, baseline, { home });
      return true;
    } finally {
      inspection.close();
      if (immutable && (!closed() || stamp() !== before)) throw new Error("SQLite store changed during baseline inspection; retry");
    }
  } catch (error) {
    // SQLITE_READONLY_ROLLBACK: the file has a hot journal, and a read-only connection cannot roll it back. The writable open recovers
    // it (SQLite's own crash recovery, not the caller's business write) and the baseline check runs there instead.
    if ((error as { errcode?: unknown }).errcode === 776) return false;
    throw error;
  }
}

/**
 * Give a database exactly one current schema (repository-anti-corruption §4.1): an empty file gets `schema` and
 * `version` in one transaction; the same version is left as it is (its structure is compared too); anything else — another
 * version, or tables without a version — is refused with both versions. Opening never upgrades; that is the upgrade run's job.
 */
export function applySqliteBaseline(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline): void {
  applyBaseline(db, path, baseline, false);
}

/**
 * The one place that applies a baseline. `shapeChecked` says the read-only inspection just before a writable open already compared this
 * file's structure, so a still-valid file is not described twice; it never skips a check the inspection could not make (a hot journal
 * leaves the file to the writable open, and this function then compares version and structure in full).
 */
function applyBaseline(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline, shapeChecked: boolean, home?:string): void {
  if (!Number.isInteger(baseline.version) || baseline.version < 1) throw new Error("基线版本必须是正整数");
  if (checkSqliteBaselineVersion(db, path, baseline, home)) {
    // The version mark claims the baseline's schema; missing baseline tables are damage even when no business table is left.
    if (!shapeChecked && !baselineShapePresent(db, baseline)) throw structureMismatch(path, home);
    return;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = Number((db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version);
    if (current === baseline.version) {
      if (!baselineShapePresent(db,baseline)) throw structureMismatch(path, home);
      db.exec("COMMIT");
      return;
    }
    if (current !== 0 || !emptyForBaseline(db,path,home)) throw versionRefusalAfterSignal(path,current,baseline.version,home);
    db.exec(baseline.schema);
    db.exec(`PRAGMA user_version = ${baseline.version}`);
    db.exec("COMMIT");
  } catch (error) {
    rollbackPreservingError(error, () => db.exec("ROLLBACK"));
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
  const inspected = inspectSqliteBaseline(path, baseline, homeDirectory);
  const db = openHomeSqliteDatabase(homeDirectory, storeName, projectId, db => applyBaseline(db, path, baseline, inspected, homeDirectory));
  try {
    applyBaseline(db, path, baseline, inspected, homeDirectory);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Reads only an existing, complete current baseline. Missing/empty stores are absent; no file or schema is created. */
export function openExistingBaselineHomeSqlite(home: string, storeName: string, baseline: SqliteBaseline): DatabaseSync | undefined {
  const path = homeSqlitePath(home, storeName);
  if (!existsSync(path) || statSync(path).size === 0) return undefined;
  if (!inspectSqliteBaseline(path, baseline, home, true)) throw structureMismatch(path, home);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assertExistingHomeSpace(db, path, home);
    return db;
  } catch (error) { db.close(); throw error; }
}

/** Pure ownership check: reject before the normal connection, then recheck the actual query connection. Never assign a space. */
function assertExistingHomeSpace(db: SqliteBaselineDatabase, path: string, home?: string): void {
  const expected = home === undefined ? null : readStorageSpace(home), actual = readDatabaseSpace(db);
  if (!expected || !actual || JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw storageErrors.space_ownership_mismatch("这个库没有当前空间的有效归属，不能读取。", { path: sqliteStoreLabel(path, home) });
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
    } catch (error) { rollbackPreservingError(error, () => db.exec("ROLLBACK")); throw error; }
  } finally { db.close(); }
}

// Held Home connections. They live here, beside `openBaselineHomeSqlite`, because they only pass on the baseline their
// caller names: the release check reads the named baseline at each caller (scripts/verify-release-versions.mjs).

interface Held { db: DatabaseSync; dev: number; ino: number; data: number; schema: number }

/** The connections this process holds, by library file. */
const held = new Map<string, Held>();

/** What another connection would change: its committed writes (`data_version`) and any structure change (`schema_version`). */
const versions = (db: DatabaseSync) => ({
  data: Number((db.prepare("PRAGMA data_version").get() as { data_version: number }).data_version),
  schema: Number((db.prepare("PRAGMA schema_version").get() as { schema_version: number }).schema_version),
});

const identity = (file: string) => {
  const stat = statSync(file, { throwIfNoEntry: false });
  return stat ? { dev: stat.dev, ino: stat.ino } : undefined;
};

/**
 * The held connection when it can be borrowed as it is: still open, still the same file, and nothing committed or restructured by another
 * connection since it was checked. Otherwise it is closed and forgotten, and the caller checks the store again before opening it.
 */
function stillHeld(file: string): DatabaseSync | undefined {
  const current = held.get(file);
  if (!current) return undefined;
  const now = current.db.isOpen ? identity(file) : undefined;
  if (now && now.dev === current.dev && now.ino === current.ino) {
    const seen = versions(current.db);
    if (seen.data === current.data && seen.schema === current.schema) return current.db;
  }
  held.delete(file);
  if (current.db.isOpen) current.db.close();
  return undefined;
}

/**
 * The one connection this process keeps to a Home store: the first call opens it the way `openBaselineHomeSqlite` does (version,
 * structure and space checked, the structure compared once), runs `prepare` on it once, and every later call borrows the same connection instead
 * of opening and closing the file again. A file that was removed or replaced since (its device and inode changed) is opened again, so a borrower
 * never writes into a file that is no longer the store; one another connection wrote to or changed since it was checked is checked again
 * (opened again), so a store changed under it is refused as it was when every call opened the file. Borrowers use it synchronously and never close it:
 * a connection kept across an await may already be closed, because the next borrow after another connection's commit opens a new one. The Host
 * releases a Home's connections when it gives the Home up (`releaseHeldHomeSqlite`).
 */
export function heldHomeSqlite(home: string, storeName: string, baseline: SqliteBaseline, prepare?: (db: DatabaseSync) => void): DatabaseSync {
  const file = resolve(homeSqlitePath(home, storeName));
  const reused = stillHeld(file);
  if (reused) return reused;
  const db = openBaselineHomeSqlite(home, storeName, baseline);
  try {
    prepare?.(db);
    const opened = identity(file);
    if (!opened) throw new Error("SQLite store disappeared while it was opened; retry");
    held.set(file, { db, ...opened, ...versions(db) });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Runs `work` on the held connection (`heldHomeSqlite`). `existingOnly`: a missing or empty store is `undefined` and stays missing, and before
 * any connection is opened (the first, or again after the file was replaced or another connection changed it) the file passes the read-only
 * checks `openExistingBaselineHomeSqlite` makes (current version and structure, owned by this Home's space), so a read never binds a store
 * that was not this Home's. A call made while the held connection is inside a
 * transaction (a listener that runs during another call's write) gets a connection of its own for `work`, closed after it, as every call had
 * before: it neither joins nor breaks the write around it.
 */
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  options: { prepare?: (db: DatabaseSync) => void; existingOnly?: false }): T;
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  options: { prepare?: (db: DatabaseSync) => void; existingOnly: true }): T | undefined;
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  { prepare, existingOnly = false }: { prepare?: (db: DatabaseSync) => void; existingOnly?: boolean }): T | undefined {
  const file = resolve(homeSqlitePath(home, storeName));
  if (existingOnly && (!existsSync(file) || statSync(file).size === 0)) return undefined;
  const current = held.get(file);
  if (current?.db.isOpen && current.db.isTransaction) {
    const own = existingOnly ? openExistingBaselineHomeSqlite(home, storeName, baseline) : openBaselineHomeSqlite(home, storeName, baseline);
    if (!own) return undefined;
    try {
      prepare?.(own);
      return work(own);
    } finally { own.close(); }
  }
  const reused = stillHeld(file);
  if (reused) return work(reused);
  // Whenever a connection is opened again (first borrow, replaced file, or another connection changed the store), a read checks it read-only first.
  if (existingOnly) {
    const checked = openExistingBaselineHomeSqlite(home, storeName, baseline);
    if (!checked) return undefined;
    checked.close();
  }
  return work(heldHomeSqlite(home, storeName, baseline, prepare));
}

const rootOf = (home: string) => { try { return realpathSync.native(home); } catch { return resolve(home); } };

/** Closes every connection this process holds to the Home's stores. A later borrower opens again. */
export function releaseHeldHomeSqlite(home: string): void {
  const roots = new Set([resolve(home), rootOf(home)].map(root => root + sep));
  for (const [file, entry] of held) {
    if (![...roots].some(root => file.startsWith(root) || rootOf(file).startsWith(root))) continue;
    held.delete(file);
    if (entry.db.isOpen) entry.db.close();
  }
}
