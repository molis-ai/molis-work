import type { DatabaseSync } from "node:sqlite";

/** One current search schema, shared by ordinary creation and existing-only maintenance. */
export const TEXT_SEARCH_SCHEMA_VERSION = "3";
export const TEXT_SEARCH_SCHEMA = `
      CREATE TABLE search_sources (
        source_key TEXT PRIMARY KEY, project_id TEXT, provider_id TEXT NOT NULL, capability_id TEXT NOT NULL, version INTEGER NOT NULL,
        plugin_id TEXT NOT NULL, title TEXT NOT NULL, collection_revision TEXT, state TEXT NOT NULL, error TEXT, synced_at INTEGER, checked_at INTEGER
      );
      CREATE TABLE search_documents (
        doc_id INTEGER PRIMARY KEY, source_key TEXT NOT NULL, kind TEXT NOT NULL, object_id TEXT NOT NULL, project_id TEXT,
        revision TEXT NOT NULL, content_revision TEXT, retention_json TEXT, title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT, open_json TEXT, content_policy TEXT NOT NULL,
        UNIQUE (source_key, kind, object_id)
      );
      CREATE INDEX search_documents_project ON search_documents (project_id);
      CREATE VIRTUAL TABLE search_fts USING fts5(title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0', prefix='2 3');
    `;
export const TEXT_SEARCH_META_SCHEMA = "CREATE TABLE IF NOT EXISTS search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)";

export function inTextSearchTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const value = run(); db.exec("COMMIT"); return value; }
  catch (error) { try { db.exec("ROLLBACK"); } catch { /* already rolled back */ } throw error; }
}

/** The search owner removes exactly one project's derived rows inside its caller's transaction. */
export function removeTextSearchProject(db: DatabaseSync, projectId: string): number {
  const ids = db.prepare("SELECT doc_id FROM search_documents WHERE project_id = ?").all(projectId);
  const deleteFts = db.prepare("DELETE FROM search_fts WHERE rowid = ?");
  const deleteDocument = db.prepare("DELETE FROM search_documents WHERE doc_id = ?");
  for (const row of ids) { deleteFts.run(Number(row.doc_id)); deleteDocument.run(Number(row.doc_id)); }
  db.prepare("DELETE FROM search_sources WHERE project_id = ?").run(projectId);
  return ids.length;
}
