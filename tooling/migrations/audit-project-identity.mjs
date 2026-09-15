import process from "node:process";
import path from "node:path";

import Database from "better-sqlite3";

const databasePath = process.argv[2];
if (!databasePath) {
  console.error("usage: node tooling/migrations/audit-project-identity.mjs /absolute/path/to/catalog.db");
  process.exitCode = 2;
} else {
  const resolvedPath = path.resolve(databasePath);
  const database = new Database(resolvedPath, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    const requiredTables = [
      "catalog_meta",
      "projects",
      "project_events",
      "workspaces",
      "workspace_project_memberships",
      "project_deletions",
    ];
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    const meta = tables.has("catalog_meta")
      ? Object.fromEntries(database.prepare("SELECT key, value FROM catalog_meta").all()
        .map((row) => [String(row.key), String(row.value)]))
      : {};
    const count = (sql) => Number(database.prepare(sql).get().count);
    const report = {
      database: resolvedPath,
      catalog_owner: meta.owner ?? null,
      catalog_schema_version: meta.schema_version == null ? null : Number(meta.schema_version),
      missing_tables: missingTables,
      duplicate_project_ids: tables.has("projects")
        ? count("SELECT COUNT(*) AS count FROM (SELECT project_id FROM projects GROUP BY project_id HAVING COUNT(*) > 1)")
        : null,
      duplicate_database_paths: tables.has("projects")
        ? count("SELECT COUNT(*) AS count FROM (SELECT database_path FROM projects GROUP BY database_path HAVING COUNT(*) > 1)")
        : null,
      created_projects_with_noncanonical_board_id: tables.has("projects")
        ? count(`
            SELECT COUNT(*) AS count FROM projects
            WHERE source = 'created' AND data_class != 'regenerable_demo' AND board_id != project_id
          `)
        : null,
      invalid_migrated_board_mappings: tables.has("projects")
        ? count(`
            SELECT COUNT(*) AS count FROM projects
            WHERE source = 'migrated'
              AND (TRIM(board_id) = '' OR migrated_from_path IS NULL OR TRIM(migrated_from_path) = '')
          `)
        : null,
      orphan_workspace_memberships: tables.has("workspace_project_memberships")
        && tables.has("workspaces")
        && tables.has("projects")
        ? count(`
            SELECT COUNT(*) AS count
            FROM workspace_project_memberships membership
            LEFT JOIN workspaces workspace ON workspace.workspace_id = membership.workspace_id
            LEFT JOIN projects project ON project.project_id = membership.project_id
            WHERE workspace.workspace_id IS NULL OR project.project_id IS NULL
          `)
        : null,
    };
    console.log(JSON.stringify(report, null, 2));
    if (
      report.catalog_owner !== "molis-work-project-catalog-v1"
      || !Number.isInteger(report.catalog_schema_version)
      || report.missing_tables.length > 0
      || report.duplicate_project_ids == null || report.duplicate_project_ids > 0
      || report.duplicate_database_paths == null || report.duplicate_database_paths > 0
      || report.created_projects_with_noncanonical_board_id == null
      || report.created_projects_with_noncanonical_board_id > 0
      || report.invalid_migrated_board_mappings == null || report.invalid_migrated_board_mappings > 0
      || report.orphan_workspace_memberships == null || report.orphan_workspace_memberships > 0
    ) process.exitCode = 1;
  } finally {
    database.close();
  }
}
