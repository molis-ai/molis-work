import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Cognia store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version.
 */
export const COGNIA_DATABASE: PluginDatabaseDeclaration = { store_name: "cognia", read_permission: "cognia:read", write_permission: "cognia:write", version: 1, schema: `
  CREATE TABLE cognia_domains (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
  CREATE TABLE cognia_sources (id TEXT PRIMARY KEY,body TEXT NOT NULL);
  CREATE TABLE cognia_materials (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,path TEXT NOT NULL,updated_at TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(source_id,path));
  CREATE TABLE cognia_versions (material_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(material_id,revision));
  CREATE TABLE cognia_previews (id TEXT PRIMARY KEY,body TEXT NOT NULL,expires_at INTEGER NOT NULL,receipt TEXT);
  CREATE TABLE cognia_drafts (id TEXT PRIMARY KEY,body TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);
` };
