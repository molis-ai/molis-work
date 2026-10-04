import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectsSqliteDatabase } from "./repository.js";

function projectDataClass(value: unknown): ProjectRecord["data_class"] {
  return String(value) === "regenerable_demo" ? "regenerable_demo" : "user";
}

/** Reads an installation's catalog facts before it is removed, without initializing anything. */
export function inspectProjectCatalogForUninstall(db: ProjectsSqliteDatabase): { owned: boolean; projects: ProjectRecord[] } {
    const owner = (db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value?: unknown } | undefined)?.value;
    if (owner !== "molis-work-project-catalog-v1") return { owned: false, projects: [] };
    const rows = db.prepare(`
      SELECT project_id, display_name, board_id, database_path, source,
        data_class,
        created_at, updated_at
      FROM projects ORDER BY created_at, project_id
    `).all() as Array<Record<string, unknown>>;
    return {
      projects: rows.map((row) => ({
        project_id: String(row.project_id),
        display_name: String(row.display_name),
        board_id: String(row.board_id),
        database_path: String(row.database_path),
        source: "created" as const,
        data_class: projectDataClass(row.data_class),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      })),
      owned: true,
    };
}
