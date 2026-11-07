import Database from "better-sqlite3";

/** The synchronous project connection. Callers share the owner’s handle instead of opening the file with another SQLite engine. */
export interface SqliteDatabase {
  readonly name: string;
  readonly open: boolean;
  readonly inTransaction: boolean;
  readonly readonly: boolean;
  prepare<Params extends unknown[] = unknown[], Row = unknown>(sql: string): SqliteStatement<Params, Row>;
  exec(sql: string): this;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<Args extends unknown[], Result>(run: (...args: Args) => Result): {
    (...args: Args): Result;
    immediate(...args: Args): Result;
  };
  function<Args extends unknown[]>(name: string, invoke: (...args: Args) => unknown): this;
  backup(destination: string, options?: { progress(info: { totalPages: number; remainingPages: number }): number }): Promise<{ totalPages: number; remainingPages: number }>;
  close(): this;
}

interface SqliteStatement<Args extends unknown[], Row> {
  get(...args: Args): Row | undefined;
  all(...args: Args): Row[];
  iterate(...args: Args): IterableIterator<Row>;
  run(...args: Args): { changes: number; lastInsertRowid: number | bigint };
}

/** SQLite's primary result codes, by number (https://sqlite.org/rescode.html). An extended code keeps its primary one in the low byte. */
const SQLITE_PRIMARY_RESULTS: Readonly<Record<number, string>> = {
  1: "SQLITE_ERROR", 2: "SQLITE_INTERNAL", 3: "SQLITE_PERM", 4: "SQLITE_ABORT", 5: "SQLITE_BUSY", 6: "SQLITE_LOCKED", 7: "SQLITE_NOMEM",
  8: "SQLITE_READONLY", 9: "SQLITE_INTERRUPT", 10: "SQLITE_IOERR", 11: "SQLITE_CORRUPT", 12: "SQLITE_NOTFOUND", 13: "SQLITE_FULL",
  14: "SQLITE_CANTOPEN", 15: "SQLITE_PROTOCOL", 16: "SQLITE_EMPTY", 17: "SQLITE_SCHEMA", 18: "SQLITE_TOOBIG", 19: "SQLITE_CONSTRAINT",
  20: "SQLITE_MISMATCH", 21: "SQLITE_MISUSE", 22: "SQLITE_NOLFS", 23: "SQLITE_AUTH", 24: "SQLITE_FORMAT", 25: "SQLITE_RANGE",
  26: "SQLITE_NOTADB", 27: "SQLITE_NOTICE", 28: "SQLITE_WARNING",
};

/** Names a failure the way SQLite does (`SQLITE_BUSY` for a busy file), whichever driver raised it; `undefined` for anything SQLite did not raise. */
export function sqliteErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, errcode } = error as { code?: unknown; errcode?: unknown };
  if (typeof errcode === "number") return SQLITE_PRIMARY_RESULTS[errcode & 0xff];
  return typeof code === "string" && code.startsWith("SQLITE_") ? code : undefined;
}

/** Opens only the connection. Schema setup, WAL and foreign-key policy belong to the store using it. */
export function openSqliteConnection(path: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): SqliteDatabase {
  return new Database(path, options) as unknown as SqliteDatabase;
}
