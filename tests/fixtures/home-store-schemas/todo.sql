-- Frozen complete current baseline of the plugin's library in each partition (<partition>/libraries/todo.db, batch 108); test-only schema, no real Home receipt.

CREATE TABLE todo_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    due_date TEXT,
    due_time TEXT,
    planned_date TEXT,
    remind_at TEXT,
    important INTEGER NOT NULL DEFAULT 0,
    waiting_json TEXT,
    sources_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]',
    edited_fields_json TEXT NOT NULL DEFAULT '[]',
    archived_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL,
    reminder_acknowledged_at TEXT
  );
CREATE TABLE todo_editor_versions(id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
CREATE TABLE todo_changes (
    change_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    at TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT NOT NULL,
    revision_after INTEGER NOT NULL,
    reverted_by TEXT
  );
CREATE INDEX todo_changes_item ON todo_changes (item_id);
CREATE INDEX todo_changes_batch ON todo_changes (batch_id) WHERE batch_id IS NOT NULL;
CREATE TABLE todo_requests (
    request_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE todo_batches (
    batch_id TEXT PRIMARY KEY, origin TEXT NOT NULL, method TEXT NOT NULL, title TEXT NOT NULL,
    body_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
    request_id TEXT UNIQUE
  );
CREATE TABLE todo_source_memory (
    source_key TEXT NOT NULL, fingerprint TEXT NOT NULL, decision TEXT NOT NULL, item_id TEXT, reason TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (source_key, fingerprint)
  );
CREATE TABLE molis_overview_rows (
  kind TEXT NOT NULL CHECK (kind IN ('task', 'event', 'notification', 'brief')),
  row_id TEXT NOT NULL CHECK (length(row_id) BETWEEN 1 AND 200),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  status TEXT CHECK (status IS NULL OR status IN ('open', 'done', 'cancelled')),
  due_at TEXT,
  remind_at TEXT,
  priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 0 AND 3),
  tags_json TEXT,
  starts_at TEXT,
  ends_at TEXT,
  all_day INTEGER CHECK (all_day IS NULL OR all_day IN (0, 1)),
  time_zone TEXT,
  level TEXT CHECK (level IS NULL OR level IN ('info', 'warning', 'urgent')),
  source TEXT,
  occurred_at TEXT,
  summary TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, row_id)
);
CREATE INDEX molis_overview_rows_remind ON molis_overview_rows(remind_at) WHERE remind_at IS NOT NULL;
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE INDEX sync_7850314bc5fb74741120b35ad6fa_replica_changes_key ON sync_7850314bc5fb74741120b35ad6fa_replica_changes(key);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_insert" AFTER INSERT ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_update" AFTER UPDATE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_delete" AFTER DELETE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0; END;
