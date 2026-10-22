import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";

/** Adapt the Home SQLite handle to the Ledger, joining an existing transaction. */
export function ledgerDatabase(db: ReturnType<typeof openHomeSqliteDatabase>): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return {
    exec: sql => db.exec(sql),
    prepare: sql => {
      const statement = db.prepare(sql);
      return {
        run: (...values) => statement.run(...values as Parameters<typeof statement.run>),
        get: (...values) => statement.get(...values as Parameters<typeof statement.get>),
        all: (...values) => statement.all(...values as Parameters<typeof statement.all>),
      };
    },
    transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }),
  };
}
