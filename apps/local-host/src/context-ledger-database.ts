import type { ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";

/** The two existing SQLite drivers expose the same statements, with different transaction flag names. */
export type LedgerConnection = Pick<ContextLedgerDatabase, "exec" | "prepare"> & { readonly isTransaction?: boolean; readonly inTransaction?: boolean };

/** Adapt the Home SQLite handle to the Ledger, joining an existing transaction. */
export function ledgerDatabase(db: LedgerConnection): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction || db.inTransaction) return operation();
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
