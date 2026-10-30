import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginProjectDatabaseErrors, pluginStatementGuard, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import { LocalSqliteStorage, openHomeSqliteFile } from "@molis-ai/molis-work-storage";
import { assertReadStatement, assertWriteStatement, type StatementReply, type StatementRequest, type StatementRow, type StatementValue } from "./project-statement-protocol.js";

// The statements of one sandboxed plugin, run on connections of this process's own to the project's library. This runs in the
// SQL Worker inside the child of `project-statement-process.ts`; its controller kills the whole process independently of the Host:
// nothing here needs to be interruptible. The checks are the ones the Host's client makes (the keyword filters, then S-46's
// `pluginStatementGuard`); the grants and the original caller are the Host's, asked between the steps it sends.

export interface StatementEngine {
  handle(request: Exclude<StatementRequest, { readonly op: "open" }>): StatementReply;
  close(): void;
}

/** One connection as the engine uses it: better-sqlite3's `Database` (the project's library) and node:sqlite's `DatabaseSync` (a library in the Home) both fit through this. */
interface StatementConnection {
  prepare(sql: string): { get(...parameters: unknown[]): unknown; run(...parameters: unknown[]): unknown; iterate(...parameters: unknown[]): Iterable<unknown> };
  exec(sql: string): unknown;
  readonly inTransaction: boolean;
}
interface StatementConnections {
  readonly reader: StatementConnection;
  readonly writer: StatementConnection;
  /** S-46's check of a statement on the connection that will run it; a library in the Home has nothing more than the keyword filters. */
  check(connection: StatementConnection, sql: string, parameters: readonly StatementValue[], mode: "read" | "write"): void;
  close(): void;
}

/** The plugin's tables in a project's library: two better-sqlite3 connections, every statement checked against the plugin's record. */
function projectConnections(path: string, record: PluginProjectDatabaseRecord): StatementConnections {
  const readStorage = new LocalSqliteStorage(path, { readonly: true });
  let writeStorage: LocalSqliteStorage | undefined;
  try {
    writeStorage = new LocalSqliteStorage(path);
    const reader = readStorage.db, writer = writeStorage.db;
    const reads = pluginStatementGuard(reader, record), writes = pluginStatementGuard(writer, record);
    return { reader, writer, check: (connection, sql, parameters, mode) => (connection === reader ? reads : writes)(sql, parameters, mode),
      close() { writeStorage?.close(); readStorage.close(); } };
  } catch (error) {
    writeStorage?.close(); readStorage.close();
    throw error;
  }
}

/**
 * A plugin's library in the Home (PG-017 BL-490): the whole file is the plugin's own, so there is no record to check statements against and
 * the keyword filters and SQLite's read-only connection are all the Host's own client has too. Two node:sqlite connections, like the Host's.
 */
function homeConnections(path: string): StatementConnections {
  const reader = openHomeSqliteFile(path, { readOnly: true });
  let writer: ReturnType<typeof openHomeSqliteFile> | undefined;
  try {
    writer = openHomeSqliteFile(path);
    reader.exec("PRAGMA busy_timeout = 1000");
    writer.exec("PRAGMA busy_timeout = 1000");
    const connection = (db: typeof reader): StatementConnection => ({
      prepare: sql => {
        const statement = db.prepare(sql);
        type Bound = Parameters<typeof statement.get>;
        return { get: (...parameters) => statement.get(...parameters as Bound), run: (...parameters) => statement.run(...parameters as Bound), iterate: (...parameters) => statement.iterate(...parameters as Bound) };
      },
      exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction; } });
    return { reader: connection(reader), writer: connection(writer), check: () => {}, close() { writer?.close(); reader.close(); } };
  } catch (error) {
    writer?.close(); reader.close();
    throw error;
  }
}

export function openStatementEngine(path: string, record: PluginProjectDatabaseRecord | null): StatementEngine {
  const connections = record === null ? homeConnections(path) : projectConnections(path, record);
  const { reader, writer, check } = connections;
  const handle = (request: Exclude<StatementRequest, { readonly op: "open" }>): StatementReply => {
    switch (request.op) {
      case "get": {
        assertReadStatement(request.sql); check(reader, request.sql, request.parameters, "read");
        const row = reader.prepare(request.sql).get(...request.parameters) as Record<string, unknown> | undefined;
        return { id: request.id, ok: true, row: row === undefined ? null : boundedRow(row, { bytes: 0 }, request.bytes) };
      }
      case "all": {
        assertReadStatement(request.sql); check(reader, request.sql, request.parameters, "read");
        const rows: StatementRow[] = [];
        const size = { bytes: 0 };
        // Row by row, so a statement with a million rows is stopped at the first row past the limit, not built.
        for (const row of reader.prepare(request.sql).iterate(...request.parameters) as Iterable<Record<string, unknown>>) {
          if (rows.length >= request.rows) throw pluginProjectDatabaseErrors.result_too_large(`A read returns at most ${request.rows} rows; page it with LIMIT and OFFSET`);
          rows.push(boundedRow(row, size, request.bytes));
        }
        return { id: request.id, ok: true, rows };
      }
      case "begin":
        if (writer.inTransaction) throw new Error("事务已在进行");
        writer.exec("BEGIN IMMEDIATE");
        return { id: request.id, ok: true };
      case "run": {
        if (!writer.inTransaction) throw pluginProjectDatabaseErrors.statement_refused("事务尚未开始，不能写入");
        assertWriteStatement(request.sql); check(writer, request.sql, request.parameters, "write");
        return { id: request.id, ok: true, changes: Number((writer.prepare(request.sql).run(...request.parameters) as { changes: number | bigint }).changes) };
      }
      case "commit":
        if (!writer.inTransaction) throw pluginProjectDatabaseErrors.statement_refused("事务尚未开始，不能提交");
        writer.exec("COMMIT");
        return { id: request.id, ok: true };
      case "rollback":
        if (writer.inTransaction) writer.exec("ROLLBACK");
        return { id: request.id, ok: true };
    }
  };
  return {
    handle(request) {
      try { return handle(request); } catch (error) { return failure(request.id, error); }
    },
    close() { connections.close(); },
  };
}

export function failure(id: number, error: unknown): StatementReply {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2048);
  if (error instanceof ActionError && error.code === "plugin.project_database.result_too_large") return { id, ok: false, kind: "too_large", message };
  if (error instanceof ActionError && error.code === "plugin.project_database.statement_refused") return { id, ok: false, kind: "refused", message };
  return { id, ok: false, kind: "error", message };
}

/** A row the channel can carry: text, finite numbers, null. A BLOB, an infinity or an integer past 2^53 is refused, not changed. */
function boundedRow(row: Record<string, unknown>, size: { bytes: number }, limit: number): StatementRow {
  const converted: StatementRow = {};
  for (const [column, raw] of Object.entries(row)) {
    const value = carried(column, raw);
    size.bytes += Buffer.byteLength(column) + (typeof value === "string" ? Buffer.byteLength(value) : 8);
    if (size.bytes > limit) throw pluginProjectDatabaseErrors.result_too_large(`A read returns at most ${limit} bytes; select fewer columns or page it with LIMIT and OFFSET`);
    converted[column] = value;
  }
  return converted;
}

function carried(column: string, value: unknown): StatementValue {
  if (value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
  throw new Error(`Column ${column.slice(0, 128)} holds a value the channel cannot carry (a BLOB, an infinity or an integer past 2^53)`);
}
