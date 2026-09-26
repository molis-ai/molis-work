import type { ProjectsSqliteDatabase } from "./repository.js";

/** Inspect stored project locations without opening or migrating the full catalog. */
export function listProjectDatabasePaths(db: Pick<ProjectsSqliteDatabase, "prepare">): string[] {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get()) return [];
  const rows = db.prepare("SELECT database_path FROM projects").all() as Array<{ database_path: string }>;
  return rows.map(row => row.database_path);
}
