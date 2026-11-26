import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The Pages baseline defines the schema for new stores and the expected version and column order for existing stores. */
const PAGES_SCHEMA = `
 CREATE TABLE pages_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    folder_id TEXT NOT NULL DEFAULT '',
    starred INTEGER NOT NULL DEFAULT 0,
    goal_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE page_comments (page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, thread_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(page_id,thread_id));
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE page_generations (request_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, record_json TEXT NOT NULL);
  -- What an edit by an agent or a workflow replaced, kept a while so the person can take that edit back (single use).
  CREATE TABLE page_changes (change_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, to_version INTEGER NOT NULL, before_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE page_imports (request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL);
`;
/**
 * Pages' library in each partition it is enabled in (`databases.partition`, U2): `<partition root>/libraries/pages.db`, given to that
 * partition's instance as `services.database`. Deleting the partition deletes the file. A document's pinned 成果 version is recorded on its
 * row in the same commit as the 成果 itself (`pinned_rows`).
 */
export const PAGES_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "pages", deletion: { label: { key: "pages.project-deletion.data" }, order: 10 }, version: /* @version database.pages_database */ 1,
  read_permission: "pages:read", write_permission: "pages:write", schema: PAGES_SCHEMA,
  pinned_rows: { table: "pages", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at", "goal_id"], pending_column: "publication_pending_json" } };
