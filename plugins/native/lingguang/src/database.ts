import type { HomePluginDatabaseDeclaration, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * What goes when a project is deleted, which the platform deletes from this library itself (PG-024): its sparks go with their
 * conversations, the messages in them and the request receipts.
 */
const LINGGUANG_PROJECT_ROWS: PluginProjectRowsDeclaration = { label: "灵光里的想法与对话", order: 80, tables: [
  { table: "messages", column: "conversation_id", parent: "conversations" },
  { table: "conversations", column: "project_id" },
  { table: "spark_requests", column: "project_id" },
  { table: "sparks", column: "project_id" },
] };
/**
 * The 灵光 store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version.
 */
export const LINGGUANG_DATABASE: HomePluginDatabaseDeclaration = { project_rows: LINGGUANG_PROJECT_ROWS, store_name: "lingguang", version: 1, read_permission: "lingguang:read", write_permission: "lingguang:write", schema: `
  CREATE TABLE sparks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    spark_key TEXT NOT NULL,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, spark_key)
  );
  CREATE TABLE spark_requests (
    project_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    spark_id TEXT NOT NULL,
    PRIMARY KEY (project_id, request_id)
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
` };
