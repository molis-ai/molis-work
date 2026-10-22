import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureStorageSpace, bindDatabaseSpace } from './space.js';

/**
 * Where one project's part of a library partitioned by project is: `<home>/<store>/projects/<project>/`. The project id is
 * percent-encoded, dots too, so it is always one directory name and never `.` or `..`.
 */
export function homeSqlitePartitionDirectory(homeDirectory: string, storeName: string, projectId: string): string {
  if (!projectId) throw new Error("按项目分开的库要有项目");
  return join(homeDirectory, storeName, "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));
}

/** The store's library file; with `projectId`, that project's file of a library partitioned by project. */
export function homeSqlitePath(homeDirectory: string, storeName: string, projectId?: string): string {
  const directory = projectId === undefined ? join(homeDirectory, storeName) : homeSqlitePartitionDirectory(homeDirectory, storeName, projectId);
  return join(directory, `${storeName}.db`);
}

export function openHomeSqliteDatabase(homeDirectory: string, storeName: string, projectId?: string, initialize?: (db: DatabaseSync) => void): DatabaseSync {
  const dbPath = homeSqlitePath(homeDirectory, storeName, projectId);
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


/** A second connection for query services. SQLite itself rejects writes and does not create missing files. */
export function openReadOnlyHomeSqlite(homeDirectory: string, storeName: string, projectId?: string): DatabaseSync {
  return new DatabaseSync(homeSqlitePath(homeDirectory, storeName, projectId), { readOnly: true });
}
