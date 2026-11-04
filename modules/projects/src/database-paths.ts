import type { ProjectsSqliteDatabase } from "./sqlite.js";
import { projectDatabasePath } from "./project-paths.js";

/** Inspect where the catalog's projects keep their databases without opening or migrating the full catalog. */
export function listProjectDatabasePaths(db: Pick<ProjectsSqliteDatabase, "prepare">, projectsDirectory: string): string[] {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get()) return [];
  const rows = db.prepare("SELECT project_id FROM projects").all() as Array<{ project_id: string }>;
  return rows.map(row => projectDatabasePath(projectsDirectory, row.project_id));
}
