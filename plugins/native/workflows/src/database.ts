import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The workflow store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing
 * ones must already be at its version.
 */
const WORKFLOWS_SCHEMA = `
CREATE TABLE workflow_editor_versions(workflow_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE workflow_imported_instances(instance_id TEXT PRIMARY KEY);
  CREATE TABLE workflows (
    workflow_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    chain_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX workflows_listed ON workflows (deleted, updated_at);
  CREATE TABLE instances (
    instance_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    current INTEGER NOT NULL,
    chain_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX instances_workflow ON instances (workflow_id, created_at);

`;
/**
 * Each partition (the personal space or a project) has its own copy of this library (`<partition>/libraries/workflows.db`), so no row
 * names its project; deleting a project takes its whole library with every instance that ran there.
 */
export const WORKFLOWS_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "workflows", deletion: { label: { key: "workflows.project-deletion.data" }, order: 50 }, version: /* @version database.workflows_database */ 1,
  read_permission: "workflows:read", write_permission: "workflows:write", schema: WORKFLOWS_SCHEMA };
