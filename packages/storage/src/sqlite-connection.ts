import Database from "better-sqlite3";

/** The synchronous project connection. Callers share the owner’s handle instead of opening the file with another SQLite engine. */
export interface SqliteDatabase {
  readonly name: string;
  readonly open: boolean;
  readonly inTransaction: boolean;
  prepare<Params extends unknown[] | object = unknown[], Row = unknown>(sql: string):
    Params extends unknown[] ? SqliteStatement<Params, Row> : SqliteStatement<[Params], Row>;
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
  pluck(enabled?: boolean): this;
}

/** Opens only the connection. Schema setup, WAL and foreign-key policy belong to the store using it. */
export function openSqliteConnection(path: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): SqliteDatabase {
  return new Database(path, options);
}
