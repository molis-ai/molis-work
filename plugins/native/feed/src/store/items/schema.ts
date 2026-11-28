/** The Feed tables, as one current schema; the host composes them into the project database baseline. */
export const FEED_ITEMS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS feed_items (
      item_id TEXT NOT NULL,
      source_id TEXT,
      signal_id TEXT,
      signal_revision INTEGER,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'archived')),
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id)
    );
    CREATE INDEX IF NOT EXISTS feed_items_project_updated_idx
      ON feed_items(disposition, source_updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_project_source_external_idx
      ON feed_items(source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS feed_materials (
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (material_id),
      FOREIGN KEY (item_id) REFERENCES feed_items(item_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS feed_materials_project_item_idx
      ON feed_materials(item_id, updated_at DESC, material_id);

    CREATE TABLE IF NOT EXISTS feed_item_events (
      event_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feed_item_events_project_item_idx
      ON feed_item_events(item_id, at, event_id);

    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_project_signal_idx
      ON feed_items(signal_id) WHERE signal_id IS NOT NULL;
`;
