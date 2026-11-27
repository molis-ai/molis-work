PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE jelly_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_index INTEGER NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE jelly_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('task', 'event')), category_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, start_time INTEGER, end_time INTEGER, time_zone TEXT NOT NULL, notes TEXT NOT NULL,
    completed_at TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE jelly_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, day TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE jelly_series (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('task', 'event')), category_id TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, start_time INTEGER, end_time INTEGER, time_zone TEXT NOT NULL, notes TEXT NOT NULL,
    weekdays TEXT NOT NULL, until TEXT, exceptions TEXT NOT NULL, completions TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE molis_overview_rows (
  kind TEXT NOT NULL CHECK (kind IN ('task', 'event', 'notification', 'brief', 'background_task', 'scheduled_run')),
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
  state TEXT,
  waiting INTEGER CHECK (waiting IS NULL OR waiting IN (0, 1)),
  started_at TEXT,
  reports_to TEXT CHECK (reports_to IS NULL OR reports_to = 'assistant'),
  missed_at TEXT,
  needs_json TEXT,
  open_surface TEXT,
  open_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, row_id)
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_78413094886bc34c13f0a35b19c1_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "jelly_notes"("id","title","body","day","revision","created_at","updated_at") VALUES('04fd767a-55e1-429f-9fca-9affefaf2493','金样便笺 seed 已改','',NULL,2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "sync_78413094886bc34c13f0a35b19c1_context"("id","project_id") VALUES(1,'project-791103fd-73f1-4091-acb6-1281d19bd75b');
INSERT INTO "sync_78413094886bc34c13f0a35b19c1_replica_changes"("seq","key") VALUES(1,'["jelly","note","04fd767a-55e1-429f-9fca-9affefaf2493"]');
INSERT INTO "sync_78413094886bc34c13f0a35b19c1_replica_changes"("seq","key") VALUES(2,'["jelly","note","04fd767a-55e1-429f-9fca-9affefaf2493"]');
INSERT INTO "sync_78413094886bc34c13f0a35b19c1_replica_state"("id","device","cursor","applying") VALUES(1,'d640c6f5099c7f9ed86dd622a10faa5c',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_78413094886bc34c13f0a35b19c1_replica_changes',2);
CREATE INDEX jelly_items_dates ON jelly_items (start_date, end_date);
CREATE INDEX jelly_notes_day ON jelly_notes (day);
CREATE INDEX molis_overview_rows_remind ON molis_overview_rows(remind_at) WHERE remind_at IS NOT NULL;
CREATE INDEX sync_78413094886bc34c13f0a35b19c1_replica_changes_key ON sync_78413094886bc34c13f0a35b19c1_replica_changes(key);
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_0_delete" AFTER DELETE ON "jelly_categories" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','category',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_0_insert" AFTER INSERT ON "jelly_categories" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','category',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_0_update" AFTER UPDATE ON "jelly_categories" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','category',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0;INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','category',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array('jelly','category',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_1_delete" AFTER DELETE ON "jelly_items" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','item',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_1_insert" AFTER INSERT ON "jelly_items" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','item',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_1_update" AFTER UPDATE ON "jelly_items" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','item',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0;INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','item',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array('jelly','item',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_2_delete" AFTER DELETE ON "jelly_series" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','series',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_2_insert" AFTER INSERT ON "jelly_series" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','series',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_2_update" AFTER UPDATE ON "jelly_series" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','series',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0;INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','series',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array('jelly','series',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_3_delete" AFTER DELETE ON "jelly_notes" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','note',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_3_insert" AFTER INSERT ON "jelly_notes" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','note',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_78413094886bc34c13f0a35b19c1_track_3_update" AFTER UPDATE ON "jelly_notes" BEGIN INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','note',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0;INSERT INTO sync_78413094886bc34c13f0a35b19c1_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','note',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array('jelly','note',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_78413094886bc34c13f0a35b19c1_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
COMMIT;
