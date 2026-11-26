import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const SOURCE_BINDINGS_SCHEMA = `
  CREATE TABLE dataset_source_bindings (
    source_key TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

/** The Dataset baseline defines the schema for new stores and the expected version and column order for existing stores. */
const DATASET_SCHEMA = `
  CREATE TABLE datasets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    columns_json TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE dataset_versions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    note TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE dataset_receipts (request_id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL);
  ${SOURCE_BINDINGS_SCHEMA}
`;
/**
 * Each partition (the personal space or a project) has its own copy of this library (`<partition>/libraries/dataset.db`), so no row names
 * its project; deleting a project takes its whole library with every saved version. A pinned version is recorded on the table it came from.
 */
export const DATASET_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "dataset", deletion: { label: { key: "dataset.project-deletion.data" }, order: 30 }, version: /* @version database.dataset_database */ 1,
  read_permission: "dataset:read", write_permission: "dataset:write", schema: DATASET_SCHEMA,
  pinned_rows: { table: "datasets", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at"], pending_column: "publication_pending_json" } };
