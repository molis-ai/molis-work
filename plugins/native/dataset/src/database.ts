import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The dataset store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version. Columns keep the order existing stores have them in.
 */
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
    project_id TEXT NOT NULL DEFAULT '',
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
  CREATE TABLE dataset_receipts (project_id TEXT NOT NULL, request_id TEXT NOT NULL, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
`;
/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): its datasets go with their
 * saved versions and the receipts of datasets made into it.
 */
const DATASET_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: "Dataset 数据表", order: 30, tables: [
  { table: "dataset_versions", column: "dataset_id", parent: "datasets" },
  { table: "datasets", column: "project_id" },
  { table: "dataset_receipts", column: "project_id" },
] };
/** The library the Host's start list gives the running plugin (`services.database`); the store's own connection opens the same file. */
export const DATASET_DATABASE: HomePluginDatabaseDeclaration = { project_rows: DATASET_PROJECT_ROWS, store_name: "dataset", version: 1,
  read_permission: "dataset:read", write_permission: "dataset:write", schema: DATASET_SCHEMA };
