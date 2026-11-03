import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): its forms go with every
 * answer people gave them, and the receipts of copies made into it.
 */
const FORM_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: "Forms 问卷及收到的全部回答", order: 20, tables: [
  { table: "submissions", column: "form_id", parent: "forms" },
  { table: "forms", column: "project_id" },
  { table: "form_copies", column: "project_id" },
] };
/**
 * The form store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version. Columns keep the order existing stores have them in. It is the library the Host's start
 * list gives the running plugin (`services.database`), read with `form:read` and written with `form:write`; the store's
 * own connection (deletion, tests) opens the same file at the same baseline.
 */
export const FORM_DATABASE: HomePluginDatabaseDeclaration = { project_rows: FORM_PROJECT_ROWS, store_name: "form", version: 1, read_permission: "form:read", write_permission: "form:write", schema: `
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
    project_id TEXT NOT NULL DEFAULT '',
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
  CREATE TABLE form_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
` };
