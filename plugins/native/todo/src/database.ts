import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Todo library's one current schema (repository-anti-corruption §4.1), the organizer's tables included: new stores are
 * created from it, existing ones must already be at its version. The Runtime opens it for the plugin; tests and the project's
 * deletion open the same file with their own connection.
 */
export const TODO_DATABASE: PluginDatabaseDeclaration = { store_name: "todo", version: 1, read_permission: "todo:read", write_permission: "todo:write", schema: `
  CREATE TABLE todo_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    placement TEXT NOT NULL,
    project_id TEXT,
    due_date TEXT,
    due_time TEXT,
    planned_date TEXT,
    remind_at TEXT,
    important INTEGER NOT NULL DEFAULT 0,
    waiting_json TEXT,
    sources_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]',
    edited_fields_json TEXT NOT NULL DEFAULT '[]',
    archived_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL,
    reminder_acknowledged_at TEXT
  );
  CREATE INDEX todo_items_project ON todo_items (project_id);
  CREATE TABLE todo_changes (
    change_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    at TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT NOT NULL,
    revision_after INTEGER NOT NULL,
    reverted_by TEXT
  );
  CREATE INDEX todo_changes_item ON todo_changes (item_id);
  CREATE INDEX todo_changes_batch ON todo_changes (batch_id) WHERE batch_id IS NOT NULL;
  CREATE TABLE todo_requests (
    request_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- The organizer's review batches and what it remembers about sources (organize.ts).
  CREATE TABLE todo_batches (
    batch_id TEXT PRIMARY KEY, project_id TEXT, origin TEXT NOT NULL, method TEXT NOT NULL, title TEXT NOT NULL,
    body_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
    request_id TEXT UNIQUE
  );
  CREATE TABLE todo_source_memory (
    source_key TEXT NOT NULL, fingerprint TEXT NOT NULL, decision TEXT NOT NULL, item_id TEXT, reason TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (source_key, fingerprint)
  );
` };
