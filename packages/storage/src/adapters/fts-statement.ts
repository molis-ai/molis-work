import type { DatabaseSync } from "node:sqlite";

/** FTS writes may leave a 64-bit internal rowid on the connection. Even UPDATE/DELETE run() returns it. */
export function prepareFtsStatement(db: DatabaseSync, sql: string) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement;
}
