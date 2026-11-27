import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Jelly store's one current schema (repository-anti-corruption §4.1): one row per category, entry, repeating series and note, each with
 * its own revision, so a note and an entry are saved without touching each other. An entry's open state, dates, times, all-day (no times)
 * and time zone are plain columns another reader can scan (batch 108's overview).
 */
export const JELLY_DATABASE: PluginDatabaseDeclaration = { store_name: "jelly", version: /* @version database.jelly_database */ 1, read_permission: "jelly:read", write_permission: "jelly:write", schema: `
  CREATE TABLE jelly_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_index INTEGER NOT NULL, revision INTEGER NOT NULL);
  CREATE TABLE jelly_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('task', 'event')), category_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, start_time INTEGER, end_time INTEGER, time_zone TEXT NOT NULL, notes TEXT NOT NULL,
    completed_at TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX jelly_items_dates ON jelly_items (start_date, end_date);
  CREATE TABLE jelly_series (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('task', 'event')), category_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, start_time INTEGER, end_time INTEGER, time_zone TEXT NOT NULL, notes TEXT NOT NULL,
    weekdays TEXT NOT NULL, until TEXT, exceptions TEXT NOT NULL, completions TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE jelly_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, day TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX jelly_notes_day ON jelly_notes (day);
` };
