import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The workflow store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing
 * ones must already be at its version.
 */
const WORKFLOWS_SCHEMA = `
  CREATE TABLE workflows (
    workflow_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    chain_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX workflows_project ON workflows (project_id, deleted, updated_at);
  CREATE TABLE instances (
    instance_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
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
/** The library the Host's start list gives the running plugin (`services.database`); the store's own connection opens the same file. */
export const WORKFLOWS_DATABASE: PluginDatabaseDeclaration = { store_name: "workflows", version: 1,
  read_permission: "workflows:read", write_permission: "workflows:write", schema: WORKFLOWS_SCHEMA };
