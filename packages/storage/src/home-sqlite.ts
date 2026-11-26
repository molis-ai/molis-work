import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureStorageSpace, bindDatabaseSpace } from './space.js';

/** The store's library file: `<home>/<store>/<store>.db`. */
export function homeSqlitePath(homeDirectory: string, storeName: string): string {
  return join(homeDirectory, storeName, `${storeName}.db`);
}

export interface HomeSqliteOpenOptions {
  /** Busy lock wait timeout in milliseconds; applied before any DDL, space binding, or journal mode change. Defaults to 5000. */
  readonly busyTimeoutMs?: number;
  /** Enforce foreign key constraints on this connection. Defaults to true. */
  readonly foreignKeys?: boolean;
  /**
   * Journal mode to apply after space ownership binding:
   * - `"preserve"` (default): do not mutate an existing database's journal mode;
   * - `"wal"`: enable WAL mode;
   * - `"delete"`: pin rollback journal mode (defaults `synchronous` to `"EXTRA"` unless overridden).
   */
  readonly journalMode?: "wal" | "delete" | "preserve";
  /** Synchronous durability mode. Defaults to `"EXTRA"` when `journalMode === "delete"`, else `"FULL"`. */
  readonly synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
  /** Enable SQLite defensive mode when supported by the runtime. Defaults to true. */
  readonly defensive?: boolean;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export function openHomeSqliteDatabase(
  homeDirectory: string,
  storeName: string,
  initialize?: (db: DatabaseSync) => void,
  options: HomeSqliteOpenOptions = {},
): DatabaseSync {
  const dbPath = homeSqlitePath(homeDirectory, storeName);
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const busyTimeoutMs = Math.max(0, Math.trunc(options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS));
  const db = new DatabaseSync(dbPath);
  try {
    if (options.defensive !== false) {
      (db as DatabaseSync & { enableDefensive?: (active: boolean) => void }).enableDefensive?.(true);
    }
    const synchronous = options.synchronous ?? (options.journalMode === "delete" ? "EXTRA" : "FULL");
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    db.exec(`PRAGMA foreign_keys = ${options.foreignKeys === false ? "OFF" : "ON"};`);
    db.exec(`PRAGMA synchronous = ${synchronous};`);
    initialize?.(db);
    bindDatabaseSpace(db, ensureStorageSpace(homeDirectory));
    if (options.journalMode === "wal") {
      db.exec("PRAGMA journal_mode = WAL;");
    } else if (options.journalMode === "delete") {
      db.exec("PRAGMA journal_mode = DELETE;");
    }
  } catch (error) {
    db.close();
    throw error;
  }
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
