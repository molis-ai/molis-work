import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

export function openHomeSqliteDatabase(homeDirectory: string, storeName: string, projectId?: string): DatabaseSync {
  const dbPath = homeSqlitePath(homeDirectory, storeName, projectId);
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // Mode is best-effort on this volume.
  }
  return db;
}


/**
 * A connection to a library file by its path, for the process that runs a sandboxed plugin's statements on a library in the Home
 * (PG-017 BL-490). The caller normally supplies the file the Host already made. SQLite rejects a missing file when readOnly is true;
 * the default read/write connection retains SQLite's behavior of creating an empty file when it does not exist.
 */
export function openHomeSqliteFile(path: string, options: { readOnly?: boolean } = {}): DatabaseSync {
  return new DatabaseSync(path, { readOnly: options.readOnly === true });
}

/** A second connection for query services. SQLite itself rejects writes and does not create missing files. */
export function openReadOnlyHomeSqlite(homeDirectory: string, storeName: string, projectId?: string): DatabaseSync {
  return new DatabaseSync(homeSqlitePath(homeDirectory, storeName, projectId), { readOnly: true });
}
