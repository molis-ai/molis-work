import { createHash } from "node:crypto";
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteBaselineDatabase } from "./sqlite-baseline.js";

/**
 * A SQLite file as stable text (specs/upgrade-continuity/golden-replay-design.md §2): the `.dump` of the sqlite3 shell, which neither
 * driver has, written on the narrow baseline interface so that changing the driver does not touch it. Every value goes through SQLite's
 * own `quote()`, so 64-bit integers and blobs never pass through a JavaScript number or a driver's own type.
 *
 * The same committed rows always give the same bytes: objects and rows are sorted, and the page order, freelist and journal mode, which
 * change without any data changing, do not enter the text. `sqlite_stat1` is left out for the same reason: `PRAGMA optimize` writes it on
 * its own schedule, and it is a planner hint, not data.
 */
export interface SqliteTextDump {
  readonly sql: string;
  readonly version: number;
  /** Rows per table. `sqlite_sequence` is the one internal table that is data; a virtual table's shadow tables are its index, and a merge shrinks them with nothing lost. */
  readonly tables: Readonly<Record<string, number>>;
}

interface NormalizedColumn {
  readonly table: RegExp;
  readonly column: string;
  readonly value: (path: string, table: string) => string;
}

/**
 * The columns that hold a value made by SQLite's `randomblob` or by a code path with no injection point. The rule stays a short list, never a
 * pattern over every column: a new random column makes two generations differ (UPG2-02), and then it is either injected or added here, in
 * the diff. Per file and table, the value is still valid hex and differs between libraries, so `initializeReplica` accepts it after a restore.
 */
export const SQLITE_DUMP_NORMALIZED_COLUMNS: readonly NormalizedColumn[] = [
  { table: /^(?:[a-z][a-z0-9_]*_)?replica_state$/u, column: "device", value: normalizedDevice },
  // `INSERT OR IGNORE … randomblob(8)` when the discussion library opens (server/src/database.ts).
  { table: /^mw_server_identity$/u, column: "cookie_suffix", value: (path, table) => normalizedDevice(path, table).slice(0, 16) },
];

function normalizedDevice(path: string, table: string): string {
  return createHash("sha256").update(`golden-device:${path}:${table}`).digest("hex").slice(0, 32);
}

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** `quote()` stops at NUL in text, so such a value goes through its bytes. */
const quoted = (column: string) => `CASE WHEN typeof(${column})='text' AND instr(${column},char(0))>0 THEN 'CAST('||quote(CAST(${column} AS BLOB))||' AS TEXT)' ELSE quote(${column}) END`;

interface SchemaObject { readonly type: string; readonly name: string; readonly sql: string }
interface TableColumn { readonly name: string; readonly pk: number }

function dumpRows(db: SqliteBaselineDatabase, path: string, table: string, lines: string[]): number {
  const info = db.prepare(`PRAGMA table_xinfo(${literal(table)})`).all() as (TableColumn & { hidden: number })[];
  // Generated columns (hidden 2, 3) are computed on insert; a virtual table's hidden columns (1) are not stored in it at all.
  const columns = info.filter(column => column.hidden === 0);
  const keys = info.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk);
  const order = (keys.length ? keys : columns).map(column => `${identifier(column.name)} COLLATE BINARY`).join(",");
  const select = columns.map((column, index) => `${quoted(identifier(column.name))} AS c${index}`).join(",");
  const rows = db.prepare(`SELECT ${select} FROM ${identifier(table)} ORDER BY ${order}`).all() as Record<string, string>[];
  const normalized = new Map(columns.flatMap((column, index) => {
    const rule = SQLITE_DUMP_NORMALIZED_COLUMNS.find(item => item.column === column.name && item.table.test(table));
    return rule ? [[`c${index}`, literal(rule.value(path, table))] as const] : [];
  }));
  const names = columns.map(column => identifier(column.name)).join(",");
  for (const row of rows) lines.push(`INSERT INTO ${identifier(table)}(${names}) VALUES(${columns.map((_, index) => normalized.get(`c${index}`) ?? row[`c${index}`]).join(",")});`);
  return rows.length;
}

/** The whole text for one library. `path` is its path relative to the Home, the one input of the normalized values. */
export function dumpSqliteText(db: SqliteBaselineDatabase, path: string): SqliteTextDump {
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type,name").all() as SchemaObject[];
  const kinds = new Map((db.prepare("PRAGMA table_list").all() as { name: string; type: string; schema: string }[]).filter(row => row.schema === "main").map(row => [row.name, row.type]));
  const lines = ["PRAGMA foreign_keys=OFF;", "BEGIN;"], tables: Record<string, number> = {};
  const created = objects.filter(object => object.type === "table");
  // A virtual table makes its shadow tables when it is created, so it comes first and their rows are inserted, not their CREATE statements.
  for (const object of created.filter(item => kinds.get(item.name) === "virtual")) lines.push(`${object.sql};`);
  for (const object of created.filter(item => kinds.get(item.name) === "table")) lines.push(`${object.sql};`);
  for (const object of created.filter(item => kinds.get(item.name) !== "virtual")) {
    const shadow = kinds.get(object.name) === "shadow";
    if (shadow) lines.push(`DELETE FROM ${identifier(object.name)};`);
    const rows = dumpRows(db, path, object.name, lines);
    if (!shadow) tables[object.name] = rows;
  }
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
    const rows = db.prepare("SELECT quote(name) AS name,quote(seq) AS seq FROM sqlite_sequence ORDER BY name COLLATE BINARY").all() as { name: string; seq: string }[];
    // Loading the rows above has already made a sequence row per table, from the highest id still there; what is recorded replaces it.
    lines.push("DELETE FROM sqlite_sequence;");
    for (const row of rows) lines.push(`INSERT INTO sqlite_sequence(name,seq) VALUES(${row.name},${row.seq});`);
    tables.sqlite_sequence = rows.length;
  }
  // Triggers come after the rows so that loading them records nothing a second time; indexes after, for the same order as `.dump`.
  for (const type of ["index", "view", "trigger"]) for (const object of objects.filter(item => item.type === type)) lines.push(`${object.sql};`);
  lines.push(`PRAGMA user_version=${version};`, "COMMIT;");
  return { sql: `${lines.join("\n")}\n`, version, tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => compareCodeUnits(a, b))) };
}

/** Rows per table now, in the same shape as a dump's `tables`, for comparing a restored library with what was recorded. */
export function countSqliteRows(db: SqliteBaselineDatabase): Readonly<Record<string, number>> {
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name='sqlite_sequence' OR name NOT LIKE 'sqlite\\_%' ESCAPE '\\') ORDER BY name").all() as { name: string }[]).map(row => row.name);
  const kinds = new Map((db.prepare("PRAGMA table_list").all() as { name: string; type: string; schema: string }[]).filter(row => row.schema === "main").map(row => [row.name, row.type]));
  return Object.fromEntries(names.filter(name => kinds.get(name) !== "virtual" && kinds.get(name) !== "shadow").map(name => [name, Number((db.prepare(`SELECT COUNT(*) AS n FROM ${identifier(name)}`).get() as { n: number }).n)]));
}
