import path from "node:path";

/** What the announcement needs of a connection: which file it writes, and whether a transaction is still open on it. */
export interface CommitWatchedDatabase {
  readonly name?: string;
  readonly inTransaction?: boolean;
}

const listeners = new Map<string, Set<() => void>>();
const fileOf = (db: CommitWatchedDatabase) => !db.name || db.name === ":memory:" ? null : path.resolve(db.name);

/**
 * Runs `then` once `db` has no open transaction: on the next turn, or as soon as the transaction around it ends. The first
 * check is a plain `setImmediate`: an unref'd one would wait for the next timer, since the loop blocks while it has none.
 */
export function afterTransaction(db: CommitWatchedDatabase, then: () => void): void {
  const check = () => { if (db.inTransaction) setTimeout(check, 25).unref(); else then(); };
  setImmediate(check);
}

/**
 * Tells everyone watching this database file, in this process, that a 成果 or 过程项 version was written (W4-09). A write
 * inside a transaction someone else opened is told only after that transaction ends, committed or not: a watcher reads the
 * journal itself and finds nothing new when it was rolled back.
 */
export function announceVersionStoreWrite(db: CommitWatchedDatabase): void {
  const file = fileOf(db);
  if (!file || !listeners.has(file)) return;
  afterTransaction(db, () => { for (const listener of [...listeners.get(file) ?? []]) listener(); });
}

/** Calls `listener` after each write to the 成果库 or 过程项 of this database file, on any connection in this process. */
export function onVersionStoreWrite(db: CommitWatchedDatabase, listener: () => void): () => void {
  const file = fileOf(db);
  if (!file) return () => undefined;
  const set = listeners.get(file) ?? new Set();
  listeners.set(file, set);
  set.add(listener);
  return () => { set.delete(listener); if (!set.size) listeners.delete(file); };
}
