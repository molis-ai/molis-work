import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectsSqliteDatabase } from "./repository.js";

function projectDataClass(value: unknown): ProjectRecord["data_class"] {
  return String(value) === "regenerable_demo" ? "regenerable_demo" : "user";
}

/** Reads existing catalog facts without initializing or migrating an installation being removed. */
export function inspectProjectCatalogForUninstall(db: ProjectsSqliteDatabase): { owned: boolean; projects: ProjectRecord[] } {
    const owner = (db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value?: unknown } | undefined)?.value;
    if (owner !== "molis-work-project-catalog-v1") return { owned: false, projects: [] };
    const hasDataClass = (db.pragma("table_info(projects)") as Array<{ name?: unknown }>).some((column) => column.name === "data_class");
    const rows = db.prepare(`
      SELECT project_id, display_name, board_id, database_path, source,
        ${hasDataClass ? "data_class" : "'user' AS data_class"},
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
