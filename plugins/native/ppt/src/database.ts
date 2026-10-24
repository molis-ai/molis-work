import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

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
/** The library the Host's start list gives the running plugin (`services.database`); the store's own connection opens the same file. */
export const PPT_DATABASE: PluginDatabaseDeclaration = { store_name: "ppt", version: 1,
  read_permission: "ppt:read", write_permission: "ppt:write", schema: PPT_SCHEMA };
