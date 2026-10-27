import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The binding of Inbox's next-step scene in each project: which judgment rule the project uses (one row, optimistic by `binding_revision`). */
export const INBOX_SCENE_BINDINGS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS inbox_scene_bindings (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      scene_id TEXT NOT NULL,
      action_binding_json TEXT NOT NULL,
      binding_revision TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, scene_id)
    );
`;

/**
 * Inbox's tables in each project's library (`databases.project`, PG-020). The Inbox entries are Attention's, the items they point at are
 * Feed's, the judgments are the platform's ledger; the binding of the scene Inbox declares is Inbox's own fact and lives here, not in
 * the Functions store (FI-6 P3, 2026-10-25). The platform makes the table the first time a library opens with Inbox.
 */
export const INBOX_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "inbox",
  version: 1,
  schema: INBOX_SCENE_BINDINGS_SCHEMA_SQL,
  read_permission: "storage:private",
  write_permission: "storage:private",
};
