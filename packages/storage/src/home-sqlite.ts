import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureStorageSpace, bindDatabaseSpace } from './space.js';

/** The store's library file: `<home>/<store>/<store>.db`. */
export function homeSqlitePath(homeDirectory: string, storeName: string): string {
  return join(homeDirectory, storeName, `${storeName}.db`);
}

export function openHomeSqliteDatabase(homeDirectory: string, storeName: string, initialize?: (db: DatabaseSync) => void): DatabaseSync {
  const dbPath = homeSqlitePath(homeDirectory, storeName);
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
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


/**
 * A connection to a library file by its path, opened as given: no directory is made, no baseline applied and no file mode set.
 * - `readOnly: true`: a missing file is an error and nothing is created.
 * - Otherwise the connection can write, and a missing file is created as an empty library (SQLite's default). A caller that must not
 *   create one checks first: the sandbox statement engine (PG-017 BL-490) opens its read-only connection before the writer, so a missing
 *   file fails there; a `file:` URL with `mode=rw` also refuses to create.
 */
export function openHomeSqliteFile(path: string, options: { readOnly?: boolean } = {}): DatabaseSync {
  return new DatabaseSync(path, { readOnly: options.readOnly === true });
}

/** A second connection for query services. SQLite itself rejects writes and does not create missing files. */
export function openReadOnlyHomeSqlite(homeDirectory: string, storeName: string): DatabaseSync {
  return new DatabaseSync(homeSqlitePath(homeDirectory, storeName), { readOnly: true });
}
