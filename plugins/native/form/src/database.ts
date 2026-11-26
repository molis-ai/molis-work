import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Form baseline. Each partition (the personal space or a project) has its own copy of this library (`<partition>/libraries/form.db`),
 * read with `form:read` and written with `form:write` via `services.database`; no row names its project, and deleting a project takes its
 * whole library with every answer in it. A pinned version is recorded on the form it came from.
 */
export const FORM_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "form", deletion: { label: { key: "form.project-deletion.data" }, order: 20 }, version: /* @version database.form_database */ 1, read_permission: "form:read", write_permission: "form:write",
  pinned_rows: { table: "forms", id_column: "id", version_column: "version", artifact_id_column: "artifact_id",
    artifact_version_column: "artifact_version", write_columns: ["updated_at"], pending_column: "publication_pending_json" }, schema: `
  CREATE TABLE forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    share_id TEXT,
    questions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    form_version INTEGER NOT NULL,
    questions_json TEXT NOT NULL,
    request_id TEXT,
    source TEXT NOT NULL
  );
  CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;
  CREATE TABLE form_copies (request_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
` };
