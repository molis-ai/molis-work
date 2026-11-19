import { openBaselineHomeSqlite, openExistingBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { WEB_SEARCH_BUILTIN_SOURCE, type WebSearchUse } from "@molis-ai/molis-work-contracts/services/web-search";

/**
 * The Home's web search settings (specs/assistant-service-connections §13.7): the one default source, and what the last search used.
 * One row each. The default names a source, never a credential; the account and its key stay with the connection.
 */
export const WEB_SEARCH_BASELINE: SqliteBaseline = { version: /* @version database.web_search_baseline */ 1, schema: `
  CREATE TABLE web_search_default (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source_id TEXT NOT NULL,
    updated_at TEXT NOT NULL);
  CREATE TABLE web_search_last_use (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    account_label TEXT,
    audience TEXT NOT NULL,
    used_at TEXT NOT NULL);
` };

/** This store in the Home's store registry (W4-11). */
export const WEB_SEARCH_HOME_STORE: HomeStoreDeclaration = { path: "web-search", library: { baseline: WEB_SEARCH_BASELINE } };

/** The default source; the built-in one when the person never chose. Reading never creates the store. */
export function readWebSearchDefault(home: string): string {
  const db = openExistingBaselineHomeSqlite(home, WEB_SEARCH_HOME_STORE.path, WEB_SEARCH_BASELINE);
  if (!db) return WEB_SEARCH_BUILTIN_SOURCE;
  try { return (db.prepare("SELECT source_id FROM web_search_default WHERE id = 1").get() as { source_id?: string } | undefined)?.source_id ?? WEB_SEARCH_BUILTIN_SOURCE; }
  finally { db.close(); }
}

export function writeWebSearchDefault(home: string, sourceId: string, at = new Date().toISOString()): void {
  const db = openBaselineHomeSqlite(home, WEB_SEARCH_HOME_STORE.path, WEB_SEARCH_BASELINE);
  try {
    db.prepare("INSERT INTO web_search_default (id, source_id, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET source_id = excluded.source_id, updated_at = excluded.updated_at")
      .run(sourceId, at);
  } finally { db.close(); }
}

export function readWebSearchLastUse(home: string): WebSearchUse | null {
  const db = openExistingBaselineHomeSqlite(home, WEB_SEARCH_HOME_STORE.path, WEB_SEARCH_BASELINE);
  if (!db) return null;
  try {
    const row = db.prepare("SELECT source_id, title, account_label, audience, used_at FROM web_search_last_use WHERE id = 1").get() as WebSearchUse | undefined;
    return row ? { source_id: row.source_id, title: row.title, account_label: row.account_label ?? null, audience: row.audience, used_at: row.used_at } : null;
  } finally { db.close(); }
}

export function writeWebSearchLastUse(home: string, use: WebSearchUse): void {
  const db = openBaselineHomeSqlite(home, WEB_SEARCH_HOME_STORE.path, WEB_SEARCH_BASELINE);
  try {
    db.prepare(`INSERT INTO web_search_last_use (id, source_id, title, account_label, audience, used_at) VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET source_id = excluded.source_id, title = excluded.title, account_label = excluded.account_label,
      audience = excluded.audience, used_at = excluded.used_at`).run(use.source_id, use.title, use.account_label ?? null, use.audience, use.used_at);
  } finally { db.close(); }
}
