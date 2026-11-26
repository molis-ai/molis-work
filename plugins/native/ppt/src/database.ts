import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The PPT baseline defines the schema for new stores and the expected version and column order for existing stores. */
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
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE presentation_copies (request_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
`;
/**
 * Each partition (the personal space or a project) has its own copy of this library (`<partition>/libraries/ppt.db`), so no row names
 * its project; deleting a project takes its whole library. A pinned version is recorded on the deck it came from.
 */
export const PPT_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "ppt", deletion: { label: { key: "ppt.project-deletion.data" }, order: 40 }, version: /* @version database.ppt_database */ 1,
  read_permission: "ppt:read", write_permission: "ppt:write", schema: PPT_SCHEMA,
  pinned_rows: { table: "presentations", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at"], pending_column: "publication_pending_json" } };
