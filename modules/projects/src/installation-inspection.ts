import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectsSqliteDatabase } from "./repository.js";

function projectDataClass(value: unknown): ProjectRecord["data_class"] {
  return String(value) === "regenerable_demo" ? "regenerable_demo" : "user";
}

/**
 * Reads the project entries of an installation's catalog before it is removed, without initializing anything. Whether the
 * file is a Molis Work catalog at all is decided by the caller from the catalog's own metadata (the storage package owns
 * `catalog_meta`), before this is asked.
 */
export function listCatalogProjectsForUninstall(db: ProjectsSqliteDatabase): ProjectRecord[] {
  const rows = db.prepare(`
    SELECT project_id, display_name, database_path, source, data_class, created_at, updated_at
    FROM projects ORDER BY created_at, project_id
  `).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    project_id: String(row.project_id),
    display_name: String(row.display_name),
    database_path: String(row.database_path),
    source: "created" as const,
    data_class: projectDataClass(row.data_class),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}
