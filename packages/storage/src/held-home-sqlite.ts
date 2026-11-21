import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "./home-sqlite.js";
import { openBaselineHomeSqlite, openExistingBaselineHomeSqlite, type SqliteBaseline } from "./sqlite-baseline.js";

interface Held { db: DatabaseSync; dev: number; ino: number }

/** The connections this process holds, by library file. */
const held = new Map<string, Held>();

const identity = (file: string) => { try { const { dev, ino } = statSync(file); return { dev, ino }; } catch { return undefined; } };

/**
 * The one connection this process keeps to a Home store (batch 103-1): the first call opens it the way `openBaselineHomeSqlite` does (version,
 * structure and space checked, the structure compared once), runs `prepare` on it once, and every later call borrows the same connection instead
 * of opening and closing the file again. A file that was removed or replaced since (its device and inode changed) is opened again, so a borrower
 * never writes into a file that is no longer the store. Borrowers use it synchronously and never close it; the Host releases a Home's
 * connections when it gives the Home up (`releaseHeldHomeSqlite`).
 */
export function heldHomeSqlite(home: string, storeName: string, baseline: SqliteBaseline, prepare?: (db: DatabaseSync) => void): DatabaseSync {
  const file = homeSqlitePath(home, storeName);
  const current = held.get(file);
  if (current) {
    const now = current.db.isOpen ? identity(file) : undefined;
    if (now && now.dev === current.dev && now.ino === current.ino) return current.db;
    held.delete(file);
    if (current.db.isOpen) current.db.close();
  }
  const db = openBaselineHomeSqlite(home, storeName, baseline);
  try {
    prepare?.(db);
    const opened = identity(file);
    if (!opened) throw new Error("SQLite store disappeared while it was opened; retry");
    held.set(file, { db, ...opened });
    return db;
  } catch (error) { db.close(); throw error; }
}

/**
 * Runs `work` on the held connection (`heldHomeSqlite`). `existingOnly`: a missing or empty store is `undefined` and stays missing, and before
 * the first connection is kept the file passes the read-only checks `openExistingBaselineHomeSqlite` makes (current version and structure,
 * owned by this Home's space), so a read never binds a store that was not this Home's. A call made while the held connection is inside a
 * transaction (a listener that runs during another call's write) gets a connection of its own for `work`, closed after it, as every call had
 * before: it neither joins nor breaks the write around it.
 */
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  options: { prepare?: (db: DatabaseSync) => void; existingOnly?: false }): T;
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  options: { prepare?: (db: DatabaseSync) => void; existingOnly: true }): T | undefined;
export function withHeldHomeSqlite<T>(home: string, storeName: string, baseline: SqliteBaseline, work: (db: DatabaseSync) => T,
  { prepare, existingOnly = false }: { prepare?: (db: DatabaseSync) => void; existingOnly?: boolean }): T | undefined {
  const file = homeSqlitePath(home, storeName);
  if (existingOnly && (!existsSync(file) || statSync(file).size === 0)) return undefined;
  const current = held.get(file);
  if (current?.db.isOpen && current.db.isTransaction) {
    const own = existingOnly ? openExistingBaselineHomeSqlite(home, storeName, baseline)! : openBaselineHomeSqlite(home, storeName, baseline);
    try { prepare?.(own); return work(own); } finally { own.close(); }
  }
  if (existingOnly && !current?.db.isOpen) openExistingBaselineHomeSqlite(home, storeName, baseline)?.close();
  return work(heldHomeSqlite(home, storeName, baseline, prepare));
}

const rootOf = (home: string) => { try { return realpathSync.native(home); } catch { return resolve(home); } };

/** Closes every connection this process holds to the Home's stores. A later borrower opens again. */
export function releaseHeldHomeSqlite(home: string): void {
  const roots = new Set([resolve(home), rootOf(home)].map(root => root + sep));
  for (const [file, entry] of held) {
    if (![...roots].some(root => file.startsWith(root) || rootOf(file).startsWith(root))) continue;
    held.delete(file);
    if (entry.db.isOpen) entry.db.close();
  }
}
