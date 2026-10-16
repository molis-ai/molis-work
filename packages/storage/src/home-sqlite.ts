import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureStorageSpace, bindDatabaseSpace } from './space.js';

/** Home directories that hold user data in SQLite (a personal `{name}/{name}.db`, `server/server.sqlite`, ...). Uninstall --purge must cover these. */
export const PERSONAL_HOME_SQLITE_STORES = [
  "issues",
  "plugin-runtime",
  "images",
  "pages",
  "form",
  "dataset",
  "ppt",
  "lingguang",
  "todo",
  "jelly",
  "cognia",
  "alchemist",
  "workflows",
  "functions",
  "connectors",
  "context-onboarding",
  "search",
  "memory",
  "server",
  "sync",
] as const;

export type PersonalHomeSqliteStore = (typeof PERSONAL_HOME_SQLITE_STORES)[number];

export function homeSqlitePath(homeDirectory: string, storeName: string): string {
  return join(homeDirectory, storeName, `${storeName}.db`);
}

export function openHomeSqliteDatabase(homeDirectory: string, storeName: string, initialize?: (db: DatabaseSync) => void): DatabaseSync {
  const dir = join(homeDirectory, storeName);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = homeSqlitePath(homeDirectory, storeName);
  const db = new DatabaseSync(dbPath);
  try { initialize?.(db); bindDatabaseSpace(db,ensureStorageSpace(homeDirectory)); }
  catch(error) { db.close(); throw error; }
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // Mode is best-effort on this volume.
  }
  return db;
}


/** A second connection for query services. SQLite itself rejects writes and does not create missing files. */
export function openReadOnlyHomeSqlite(homeDirectory: string, storeName: string): DatabaseSync {
  return new DatabaseSync(homeSqlitePath(homeDirectory, storeName), { readOnly: true });
}
