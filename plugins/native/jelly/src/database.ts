import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Jelly store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version.
 */
export const JELLY_DATABASE: PluginDatabaseDeclaration = { store_name: "jelly", version: 1, read_permission: "jelly:read", write_permission: "jelly:write", schema: `
  CREATE TABLE jelly_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL);
  CREATE TABLE jelly_note_versions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
  CREATE TABLE jelly_history (id INTEGER PRIMARY KEY AUTOINCREMENT, command TEXT NOT NULL, before_body TEXT NOT NULL, after_body TEXT NOT NULL, before_checksum TEXT NOT NULL, after_checksum TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE jelly_previews (token TEXT PRIMARY KEY, type TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL);
` };
