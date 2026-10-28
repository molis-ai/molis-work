import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntimeDatabase } from "./repository.js";

// A plugin's own tables in a project's library (PG-020, specs/plugin-project-database). The plugin declares them in its Manifest
// (`databases.project`); the platform tries the statements on an empty database first, then makes them in the project's library the
// first time the plugin opens there and records them, with the publisher's signature, in one ledger. SQLite is the Host's: it hands
// in a scratch database and storage's descriptions, so this package depends on no SQLite library.

/** The ledger, one row per plugin: which tables and indexes its declaration made, at which version, under which publisher. */
export const PLUGIN_PROJECT_DATABASES_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_project_databases (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      tables_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
`;

/** The one table outside its own that a plugin's foreign keys may point at: the project itself, one row per library. */
export const PROJECT_ROOT_REFERENCE = { table: "project_root", column: "project_id" } as const;

export const pluginProjectDatabaseErrors = defineErrorCodes("plugin.project_database", {
  declaration_invalid: "invalid",
  object_taken: "conflict",
  publisher_mismatch: "forbidden",
  version_mismatch: "conflict",
  shape_mismatch: "conflict",
  /** A statement that reaches past the plugin's own tables, or does more than read or change rows (`project-database-statements.ts`). */
  statement_refused: "forbidden",
  /** A sandboxed plugin's statement ran past its time, and the process it ran in was killed (`apps/local-host` `project-statement-process.ts`). */
  statement_timeout: "timeout",
  /** The process a sandboxed plugin's statement ran in grew past its memory and was killed. */
  statement_memory: "too_large",
  /** A sandboxed plugin's read gave more rows or bytes than one answer carries. */
  result_too_large: "too_large",
  /** The process that runs a sandboxed plugin's statements would not start, or ended on its own. */
  process_failed: "unavailable",
});

/** One entry of a database's schema table, as storage's `listSqliteObjects` gives it. */
export interface PluginSchemaObject { readonly type: string; readonly name: string; readonly table: string; readonly automatic: boolean }
/** The structure of a database's tables, as storage's `describeSqliteSchema` gives it; compared whole, read here only for foreign keys. */
export interface PluginSchemaShape {
  readonly tables: Readonly<Record<string, { readonly foreign_keys: ReadonlyArray<{ readonly table: string; readonly to: string | null }> }>>;
}
/** What the Host lends: an empty in-memory database to try a declaration on (closed after), and storage's two descriptions. */
export interface PluginProjectSchemaInspector {
  scratch(): PluginRuntimeDatabase & { close(): void };
  objects(db: PluginRuntimeDatabase): readonly PluginSchemaObject[];
  shape(db: PluginRuntimeDatabase): PluginSchemaShape;
}

export interface PluginProjectDatabaseRecord {
  readonly plugin_id: string;
  readonly publisher_signature: string;
  readonly store_name: string;
  readonly version: number;
  /** The tables and indexes the declaration made, by name; SQLite's own indexes for keys are not listed. */
  readonly objects: readonly string[];
  readonly created_at: string;
}

interface DeclaredSchema { readonly tables: readonly string[]; readonly objects: readonly string[]; readonly shape: PluginSchemaShape["tables"] }

const NAME = String.raw`(?:Q|[A-Za-z_\u0080-\u{10FFFF}][\w$\u0080-\u{10FFFF}]*)`;
const CREATE_TABLE = new RegExp(String.raw`^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s*\(`, "iu");
const CREATE_INDEX = new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s+ON\s+${NAME}\s*\(`, "iu");
const invalid = (message: string) => pluginProjectDatabaseErrors.declaration_invalid(message);
/** SQLite folds only ASCII letters when it compares names. */
const fold = (name: string) => name.replace(/[A-Z]/gu, letter => letter.toLowerCase());

/**
 * Split a declaration at every semicolon outside quotes and comments, as SQLite reads it, and give each statement with its quoted
 * parts masked: a string becomes `''`, a quoted name `Q`, a comment a space.
 */
function statements(schema: string): Array<{ text: string; masked: string }> {
  const found: Array<{ text: string; masked: string }> = [];
  let masked = "", start = 0, index = 0;
  const end = (at: number) => {
    if (masked.trim()) found.push({ text: schema.slice(start, at).trim(), masked: masked.replace(/\s+/gu, " ").trim() });
    masked = ""; start = at + 1;
  };
  while (index < schema.length) {
    const char = schema[index], next = schema[index + 1];
    if (char === "-" && next === "-") {
      const line = schema.indexOf("\n", index);
      index = line < 0 ? schema.length : line + 1; masked += " ";
    } else if (char === "/" && next === "*") {
      const close = schema.indexOf("*/", index + 2);
      if (close < 0) throw invalid("建表语句里有没闭合的注释");
      index = close + 2; masked += " ";
    } else if (char === "'" || char === "\"" || char === "`" || char === "[") {
      const closing = char === "[" ? "]" : char;
      let close = schema.indexOf(closing, index + 1);
      while (close >= 0 && closing !== "]" && schema[close + 1] === closing) close = schema.indexOf(closing, close + 2);
      if (close < 0) throw invalid("建表语句里有没闭合的引号");
      index = close + 1; masked += char === "'" ? "''" : "Q";
    } else if (char === ";") {
      end(index); index += 1;
    } else {
      masked += char; index += 1;
    }
  }
  end(schema.length);
  return found;
}

function balanced(masked: string): boolean {
  let depth = 0;
  for (const char of masked) {
    if (char === "(") depth += 1;
    else if (char === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * The rules a declaration must meet before anything of it runs anywhere (PLIB-03): every statement creates a table or an index by
 * an unqualified name, and nothing else runs, not even on the scratch database. Then, tried there, it may have made only tables and
 * indexes, none with SQLite's reserved names (`AUTOINCREMENT` makes `sqlite_sequence`, which every table of the library shares), and
 * foreign keys only to its own tables or the project's root row.
 */
export function inspectPluginProjectSchema(declaration: PluginDatabaseDeclaration, inspector: PluginProjectSchemaInspector): DeclaredSchema {
  const parts = statements(declaration.schema);
  if (parts.length === 0) throw invalid("项目库声明没有建表语句");
  for (const part of parts) {
    if (!balanced(part.masked) || !(CREATE_TABLE.test(part.masked) || CREATE_INDEX.test(part.masked))) {
      throw invalid(`项目库声明只能建表和索引，名字不带库名，不能从查询建表：${part.text.slice(0, 80)}`);
    }
  }
  const scratch = inspector.scratch();
  let objects: readonly PluginSchemaObject[], shape: PluginSchemaShape;
  try {
    try { scratch.exec(declaration.schema); } catch (error) { throw invalid(`建表语句在空库里执行失败：${error instanceof Error ? error.message : String(error)}`); }
    objects = inspector.objects(scratch);
    shape = inspector.shape(scratch);
  } finally { scratch.close(); }
  for (const object of objects) {
    if (object.type !== "table" && object.type !== "index") throw invalid(`项目库声明只能建表和索引，不能建 ${object.type} ${object.name}`);
    if (fold(object.name) === "sqlite_sequence") throw invalid("项目库声明不能用 AUTOINCREMENT：它用的 sqlite_sequence 是全库共用的");
    if (!object.automatic && fold(object.name).startsWith("sqlite_")) throw invalid(`项目库声明不能用 sqlite_ 开头的名字：${object.name}`);
  }
  const tables = objects.filter(object => object.type === "table").map(object => object.name);
  const own = new Set(tables.map(fold));
  for (const [table, described] of Object.entries(shape.tables)) {
    for (const key of described.foreign_keys) {
      const root = fold(key.table) === PROJECT_ROOT_REFERENCE.table && (key.to === null || fold(key.to) === PROJECT_ROOT_REFERENCE.column);
      if (!own.has(fold(key.table)) && !root) {
        throw invalid(`表 ${table} 的外键只能指向本插件自己的表或 ${PROJECT_ROOT_REFERENCE.table}(${PROJECT_ROOT_REFERENCE.column})，不能指向 ${key.table}`);
      }
    }
  }
  return { tables, objects: objects.filter(object => !object.automatic).map(object => object.name).sort(), shape: shape.tables };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The plugin's tables as they stand in the library, in the declaration's terms; a missing table is `null`. */
function standing(connection: PluginRuntimeDatabase, declared: DeclaredSchema, inspector: PluginProjectSchemaInspector): string {
  const tables = inspector.shape(connection).tables;
  return canonical(Object.fromEntries(declared.tables.map(table => [table, tables[table] ?? null])));
}

interface LedgerRow { plugin_id: string; publisher_signature: string; store_name: string; version: number; tables_json: string; created_at: string }

const record = (row: LedgerRow, where = ""): PluginProjectDatabaseRecord => {
  let objects: string[];
  try { objects = JSON.parse(row.tables_json) as string[]; }
  catch { throw pluginProjectDatabaseErrors.shape_mismatch(`${where} 的账本记录读不出来：objects 不是 JSON 字符串数组`); }
  return { plugin_id: row.plugin_id, publisher_signature: row.publisher_signature, store_name: row.store_name, version: Number(row.version),
    objects, created_at: row.created_at };
};

/** Shared declaration/ledger/shape check; inspection never starts a transaction or creates missing tables. */
function checkedExisting(connection: PluginRuntimeDatabase, owner: { readonly publisher_signature: string; readonly declaration: PluginDatabaseDeclaration },
  inspector: PluginProjectSchemaInspector, declared: DeclaredSchema, row: LedgerRow, where: string, path: string): PluginProjectDatabaseRecord {
  const { declaration } = owner;
  if (row.publisher_signature !== owner.publisher_signature) throw pluginProjectDatabaseErrors.publisher_mismatch(`${where} 是另一个发布者建的，换了发布者不能打开`);
  if (Number(row.version) !== declaration.version) {
    throw pluginProjectDatabaseErrors.version_mismatch(`${where} 是第 ${row.version} 版，这次声明的是第 ${declaration.version} 版`,
      { path, store_name: declaration.store_name, recorded_version: Number(row.version), declared_version: declaration.version });
  }
  if (row.store_name !== declaration.store_name || canonical(record(row, where).objects) !== canonical(declared.objects)
    || standing(connection, declared, inspector) !== canonical(declared.shape)) {
    throw pluginProjectDatabaseErrors.shape_mismatch(`${where} 的表和索引与声明不同（账本记的库名 ${row.store_name}）`);
  }
  return record(row, where);
}

export function inspectExistingPluginProjectDatabase(connection: PluginRuntimeDatabase,
  owner: { readonly plugin_id: string; readonly publisher_signature: string; readonly declaration: PluginDatabaseDeclaration },
  inspector: PluginProjectSchemaInspector, options: { readonly path: string }): PluginProjectDatabaseRecord {
  const declared = inspectPluginProjectSchema(owner.declaration, inspector);
  const row = connection.prepare("SELECT plugin_id, publisher_signature, store_name, version, tables_json, created_at FROM plugin_project_databases WHERE plugin_id = ?")
    .get(owner.plugin_id) as LedgerRow | undefined;
  if (!row) throw pluginProjectDatabaseErrors.shape_mismatch("原插件项目库未登记，维护不会建库");
  const checked = checkedExisting(connection, owner, inspector, declared, row, `项目库 ${options.path}`, options.path);
  const objects = inspector.objects(connection).filter(object => declared.tables.includes(object.table) && !object.automatic).map(object => object.name).sort();
  if (canonical(objects) !== canonical(declared.objects)) throw pluginProjectDatabaseErrors.shape_mismatch("原插件项目库有未声明对象，维护不会执行");
  return checked;
}

/** The actual ledger subversions for an offline backup; no table creation, write transaction, or plugin activation. */
export function listPluginProjectDatabases(connection: PluginRuntimeDatabase): readonly PluginProjectDatabaseRecord[] {
  const rows = connection.prepare("SELECT plugin_id, publisher_signature, store_name, version, tables_json, created_at FROM plugin_project_databases ORDER BY plugin_id").all() as LedgerRow[];
  return rows.map(row => {
    const entry = record(row);
    if (!Number.isSafeInteger(entry.version) || entry.version < 1 || !Array.isArray(entry.objects)
      || !entry.objects.every(name => typeof name === "string" && name.length > 0)) {
      throw pluginProjectDatabaseErrors.shape_mismatch("项目插件库账本的版本或对象列表无效，未生成快照");
    }
    return entry;
  });
}

/**
 * Open a plugin's tables in a project's library, making them the first time (PLIB-02, PLIB-04). In one write transaction: with no
 * ledger row, nothing of the same name may exist yet, and the statements run and the row is written together; with one, the
 * publisher must be the one that made them, the version the one recorded, and the tables as declared. A refusal changes nothing
 * and stops only this plugin; `path` is the library's file, for the message.
 */
export function openPluginProjectDatabase(connection: PluginRuntimeDatabase,
  owner: { readonly plugin_id: string; readonly publisher_signature: string; readonly declaration: PluginDatabaseDeclaration },
  inspector: PluginProjectSchemaInspector, options: { readonly path: string; readonly now?: () => Date }): { record: PluginProjectDatabaseRecord; created: boolean } {
  const { declaration } = owner, declared = inspectPluginProjectSchema(declaration, inspector);
  const where = `项目库 ${options.path} 里插件 ${owner.plugin_id} 的库 ${declaration.store_name}`;
  connection.exec("BEGIN IMMEDIATE");
  try {
    const row = connection.prepare("SELECT plugin_id, publisher_signature, store_name, version, tables_json, created_at FROM plugin_project_databases WHERE plugin_id = ?")
      .get(owner.plugin_id) as LedgerRow | undefined;
    let opened: { record: PluginProjectDatabaseRecord; created: boolean };
    if (row) {
      opened = { record: checkedExisting(connection, owner, inspector, declared, row, where, options.path), created: false };
    } else {
      const holder = connection.prepare("SELECT plugin_id FROM plugin_project_databases WHERE store_name = ?").get(declaration.store_name) as { plugin_id: string } | undefined;
      if (holder) throw pluginProjectDatabaseErrors.object_taken(`${where}：库名已归插件 ${holder.plugin_id}`);
      const existing = new Set(inspector.objects(connection).map(object => fold(object.name)));
      const taken = declared.objects.filter(name => existing.has(fold(name)));
      if (taken.length > 0) throw pluginProjectDatabaseErrors.object_taken(`${where}：项目库里已经有同名的对象 ${taken.join("、")}`);
      connection.exec(declaration.schema);
      const made = inspector.objects(connection).filter(object => !object.automatic && !existing.has(fold(object.name))).map(object => object.name).sort();
      if (canonical(made) !== canonical(declared.objects) || standing(connection, declared, inspector) !== canonical(declared.shape)) {
        throw invalid(`${where}：在项目库里建出的表和索引与空库里试建的不同`);
      }
      const created: LedgerRow = { plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature, store_name: declaration.store_name,
        version: declaration.version, tables_json: JSON.stringify(declared.objects), created_at: (options.now?.() ?? new Date()).toISOString() };
      connection.prepare("INSERT INTO plugin_project_databases (plugin_id, publisher_signature, store_name, version, tables_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(created.plugin_id, created.publisher_signature, created.store_name, created.version, created.tables_json, created.created_at);
      opened = { record: record(created, where), created: true };
    }
    connection.exec("COMMIT");
    return opened;
  } catch (error) {
    // SQLite may already have rolled the transaction back (SQLITE_FULL, SQLITE_IOERR, SQLITE_NOMEM); a second ROLLBACK then
    // throws "cannot rollback - no transaction is active" and would hide the real failure. Keep the original error.
    try { connection.exec("ROLLBACK"); } catch { /* the transaction is already gone */ }
    throw error;
  }
}
