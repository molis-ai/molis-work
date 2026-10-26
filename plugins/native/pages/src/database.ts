import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Pages store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version. Columns keep the order existing stores have them in.
 */
const PAGES_SCHEMA = `
  CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
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
    project_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE page_generations (project_id TEXT NOT NULL, request_id TEXT NOT NULL, updated_at TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(project_id, request_id));
  -- What an edit by an agent or a workflow replaced, kept a while so the person can take that edit back (single use).
  CREATE TABLE page_changes (change_id TEXT PRIMARY KEY, page_id TEXT NOT NULL, to_version INTEGER NOT NULL, before_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE page_imports (project_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL, document_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id, request_id));
`;
/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): its documents and folders go
 * (their comments with them), with the generation and import receipts and the edits that could still be taken back.
 */
const PAGES_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: "Pages 文稿与文件夹", order: 10, tables: [
  { table: "page_changes", column: "page_id", parent: "pages" },
  { table: "pages", column: "project_id" },
  { table: "folders", column: "project_id" },
  { table: "page_generations", column: "project_id" },
  { table: "page_imports", column: "project_id" },
] };
/** The library the Host's start list gives the running plugin (`services.database`); the store's own connection opens the same file. */
export const PAGES_DATABASE: HomePluginDatabaseDeclaration = { project_rows: PAGES_PROJECT_ROWS, store_name: "pages", version: 2,
  read_permission: "pages:read", write_permission: "pages:write", schema: PAGES_SCHEMA };
