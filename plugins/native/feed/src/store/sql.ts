/**
 * What Feed's store reads and writes through. Synchronous, like both sides of it: a better-sqlite3 handle (`fromBetterSqlite`) and the
 * project-database transaction a Runtime plugin is given. Every statement is passed with its parameters, so nothing here can keep a
 * prepared statement or a connection in a field; a Module built over a `FeedSql` holds the reference and does no I/O when it is made.
 */
export interface FeedSql {
  get<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Row | undefined;
  all<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Row[];
  run(sql: string, ...params: unknown[]): { changes: number };
  /** Runs `operation` atomically and returns what it returns; a call inside another joins the outer one. */
  transaction<T>(operation: () => T): T;
}

/** The part of a better-sqlite3 handle the adapter needs, written out so the store does not import the driver. */
export interface SqliteHandle {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number | bigint };
  };
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

/** A handle with `transaction` gives the whole interface; one that can only prepare (a reader) gives the statements without it. */
export function fromBetterSqlite(db: SqliteHandle): FeedSql;
export function fromBetterSqlite(db: Pick<SqliteHandle, "prepare">): Omit<FeedSql, "transaction">;
export function fromBetterSqlite(db: Pick<SqliteHandle, "prepare"> & Partial<SqliteHandle>): Omit<FeedSql, "transaction"> & Partial<Pick<FeedSql, "transaction">> {
  return {
    get: <Row>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as Row | undefined,
    all: <Row>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as Row[],
    run: (sql, ...params) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
    ...db.transaction ? { transaction: <T>(operation: () => T) => db.transaction!(operation).immediate() } : {},
  };
}
