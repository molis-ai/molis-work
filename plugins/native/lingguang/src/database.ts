import type { PartitionPluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The 灵光 store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version. Each partition (the personal space or a project) has its own copy (`<partition>/libraries/lingguang.db`),
 * so no row names its project; deleting a project takes its whole library with every brainstorm in it.
 */
export const LINGGUANG_DATABASE: PartitionPluginDatabaseDeclaration = { store_name: "lingguang", deletion: { label: { key: "lingguang.project-deletion.data" }, order: 80 }, version: /* @version database.lingguang_database */ 1, read_permission: "lingguang:read", write_permission: "lingguang:write", schema: `
  CREATE TABLE sparks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    spark_key TEXT NOT NULL UNIQUE,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE spark_requests (
    request_id TEXT PRIMARY KEY,
    spark_id TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
` };
