import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The presentation store's one current schema (repository-anti-corruption §4.1): new stores are created from it,
 * existing ones must already be at its version. Columns keep the order existing stores have them in.
 */
const PPT_SCHEMA = `
  CREATE TABLE presentations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color_primary TEXT NOT NULL,
    color_background TEXT NOT NULL,
    color_text TEXT NOT NULL,
    slides_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE presentation_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
`;
/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): its presentations go with the
 * receipts of copies made into it.
 */
const PPT_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: "PPT 演示稿", order: 40, tables: [
  { table: "presentations", column: "project_id" },
  { table: "presentation_copies", column: "project_id" },
] };
/** The library the Host's start list gives the running plugin (`services.database`); the store's own connection opens the same file. */
export const PPT_DATABASE: HomePluginDatabaseDeclaration = { project_rows: PPT_PROJECT_ROWS, store_name: "ppt", version: 1,
  read_permission: "ppt:read", write_permission: "ppt:write", schema: PPT_SCHEMA };
