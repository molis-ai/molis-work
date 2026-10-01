import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

export type CatalogCommit = <T>(operation: () => T, beforeAcquire?: () => Promise<void>) => Promise<T>;

/** Wait only for an unstarted transaction. The synchronous commit body is called exactly once. */
export function createCatalogCommit(db: SqliteDatabase, validate: () => void): CatalogCommit {
  let tail = Promise.resolve();
  return (operation, beforeAcquire) => {
    const task = tail.then(async () => {
      const timeout = Number(db.pragma("busy_timeout", { simple: true }));
      const deadline = performance.now() + timeout;
      for (;;) {
        await beforeAcquire?.();
        try {
          // The immediate acquisition must return to the event loop if busy. Restore the connection's normal
          // timeout before yielding or running any business statement; total acquisition patience is unchanged.
          db.pragma("busy_timeout = 0");
          db.exec("BEGIN IMMEDIATE");
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "SQLITE_BUSY" || performance.now() >= deadline) throw error;
        } finally { db.pragma(`busy_timeout = ${timeout}`); }
        await delay(Math.min(10, Math.max(1, deadline - performance.now())));
      }
      try {
        validate();
        const result = operation();
        if (result instanceof Promise) throw new TypeError("Catalog commit requires a synchronous owner operation");
        db.exec("COMMIT");
        return result;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    });
    tail = task.then(() => undefined, () => undefined);
    return task;
  };
}
