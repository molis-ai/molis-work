import type { DatabaseSync } from "node:sqlite";

/** Cleanup of the original connection only; success never replays or completes the failed command. */
export interface MemoryLedgerCloseFailure extends AggregateError { close(): Promise<void> }

/** Keep an actual failed close reachable without exposing the database or replacing the business failure. */
export function closeMemoryLedgerDatabase(db: DatabaseSync, failure?: { readonly error: unknown }): void {
  const close = () => { if (db.isOpen) db.close(); };
  try { close(); }
  catch (error) {
    const reason = failure ? failure.error : error;
    const retained = new AggregateError(failure ? [failure.error, error] : [error], "记忆账本关闭未完成；原连接仍可明确重试关闭", { cause: reason });
    const code = reason instanceof Error ? Object.getOwnPropertyDescriptor(reason, "code") : undefined;
    if (typeof code?.value === "string") Object.defineProperty(retained, "code", { value: code.value });
    Object.defineProperty(retained, "close", { value: async () => { close(); } });
    throw retained as MemoryLedgerCloseFailure;
  }
}

/** COMMIT belongs to work; a later close failure must stay outside its rollback handler. */
export function withMemoryLedgerDatabase<T>(db: DatabaseSync, work: (db: DatabaseSync) => T): T {
  let failure: { error: unknown } | undefined;
  try { return work(db); }
  catch (error) { failure = { error }; throw error; }
  finally { closeMemoryLedgerDatabase(db, failure); }
}
