import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginProjectDatabaseErrors, pluginStatementGuard, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import { LocalSqliteStorage, openHomeSqliteFile } from "@molis-ai/molis-work-storage";
import { assertReadStatement, assertWriteStatement, type ReviewedStatementTarget, type StatementReply, type StatementStep, type StatementRow, type StatementValue } from "./project-statement-protocol.js";
import { commitProjectReview } from "./project-review-commit.js";
import type { ProjectReviewCommit } from "./project-review-effect.js";

// The statements of one sandboxed plugin, run on connections of this process's own to the project's library. This runs in the
// SQL Worker inside the child of `project-statement-process.ts`; its controller kills the whole process independently of the Host:
// nothing here needs to be interruptible. The checks are the ones the Host's client makes (the keyword filters, then S-46's
// `pluginStatementGuard`); the grants and the original caller are the Host's, asked between the steps it sends.

export interface StatementEngine {
  handle(request: StatementStep): StatementReply;
  finishCommit(request: Extract<StatementStep, { op: "commit" }>): StatementReply;
  close(): void;
}

/** One connection as the engine uses it: the storage package's connection (the project's library) and node:sqlite's `DatabaseSync` (a library in the Home) both fit through this. */
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
  joinProjectDecision?(decision: ProjectReviewCommit, check: () => void): void;
  close(): void;
}

/** The plugin's tables in a project's library: two connections, every statement checked against the plugin's record. */
function projectConnections(path: string, record: PluginProjectDatabaseRecord): StatementConnections {
  const readStorage = new LocalSqliteStorage(path, { readonly: true });
  let writeStorage: LocalSqliteStorage | undefined;
  try {
    writeStorage = new LocalSqliteStorage(path, { fileMustExist: true, journalMode: "preserve" });
    const reader = readStorage.db, writer = writeStorage.db;
    const reads = pluginStatementGuard(reader, record), writes = pluginStatementGuard(writer, record);
    return { reader, writer, check: (connection, sql, parameters, mode) => (connection === reader ? reads : writes)(sql, parameters, mode),
      joinProjectDecision: (decision, check) => commitProjectReview(writer, decision, check),
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
  const handle = (request: StatementStep): StatementReply => {
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
        beginTransaction(connections, request.reviewed);
        return { id: request.id, ok: true };
      case "run": {
        if (!writer.inTransaction) throw pluginProjectDatabaseErrors.statement_refused("事务尚未开始，不能写入");
        assertWriteStatement(request.sql); check(writer, request.sql, request.parameters, "write");
        return { id: request.id, ok: true, changes: Number((writer.prepare(request.sql).run(...request.parameters) as { changes: number | bigint }).changes) };
      }
      case "commit":
        if (!writer.inTransaction) throw pluginProjectDatabaseErrors.statement_refused("事务尚未开始，不能提交");
        if (request.decision) {
          if (!connections.joinProjectDecision) throw pluginProjectDatabaseErrors.statement_refused("本人决定必须与原项目的写入一同提交");
          connections.joinProjectDecision(request.decision, () => {
            if (request.decision!.deadline !== undefined && Date.now() >= request.decision!.deadline) throw new ActionError("actions.expired", "原决定请求已过期");
            if (Date.now() >= request.deadline) throw pluginProjectDatabaseErrors.statement_refused("原项目事务已超过提交时限");
          });
          return { id: request.id, ok: true };
        }
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
    finishCommit(request) {
      try {
        if (!writer.inTransaction || !request.decision || Date.now() >= request.deadline) throw pluginProjectDatabaseErrors.statement_refused("原项目事务已结束");
        if (request.decision.deadline !== undefined && Date.now() >= request.decision.deadline) throw new ActionError("actions.expired", "原决定请求已过期");
        writer.exec("COMMIT");
        return { id: request.id, ok: true };
      } catch (error) { return failure(request.id, error); }
    },
    close() { connections.close(); },
  };
}

function beginTransaction(connections: StatementConnections, reviewed?: ReviewedStatementTarget): void {
  const { writer } = connections;
  writer.exec("BEGIN IMMEDIATE");
  if (!reviewed) return;
  try {
    if (!connections.joinProjectDecision) throw pluginProjectDatabaseErrors.statement_refused("原审批对象必须属于项目库");
    const { table, id_column, version_column } = reviewed.row;
    const name = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';
    // Qualifiers prevent SQLite from treating a nonexistent quoted column as a string literal.
    const sql = `SELECT t.${name(version_column)} AS revision FROM ${name(table)} AS t WHERE t.${name(id_column)} = ? LIMIT 2`;
    const parameters = [reviewed.id];
    connections.check(writer, sql, parameters, "read");
    const rows = [...writer.prepare(sql).iterate(...parameters)] as Array<{ revision: unknown }>;
    const revision = rows[0]?.revision;
    if (rows.length !== 1 || (typeof revision !== "string" && !Number.isSafeInteger(revision)) || String(revision) !== reviewed.version) {
      throw new ActionError("actions.conflict", "待审对象的原版本已变化，请重新查看");
    }
  } catch (error) {
    if (writer.inTransaction) writer.exec("ROLLBACK");
    throw error;
  }
}

export function failure(id: number, error: unknown): StatementReply {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2048);
  if (error instanceof ActionError && error.code === "plugin.project_database.result_too_large") return { id, ok: false, kind: "too_large", message };
  if (error instanceof ActionError && error.code === "plugin.project_database.statement_refused") return { id, ok: false, kind: "refused", message };
  if (error instanceof ActionError && error.code === "actions.conflict") return { id, ok: false, kind: "decision_conflict", message };
  if (error instanceof ActionError && error.code === "actions.expired") return { id, ok: false, kind: "decision_expired", message };
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
