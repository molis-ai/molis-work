PRAGMA foreign_keys=OFF;
BEGIN;
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
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_7850314bc5fb74741120b35ad6fa_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE todo_batches (
    batch_id TEXT PRIMARY KEY, origin TEXT NOT NULL, method TEXT NOT NULL, title TEXT NOT NULL,
    body_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
    request_id TEXT UNIQUE
  );
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
CREATE TABLE todo_editor_versions(id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
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
CREATE TABLE todo_requests (
    request_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE todo_source_memory (
    source_key TEXT NOT NULL, fingerprint TEXT NOT NULL, decision TEXT NOT NULL, item_id TEXT, reason TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (source_key, fingerprint)
  );
INSERT INTO "molis_overview_rows"("kind","row_id","title","status","due_at","remind_at","priority","tags_json","starts_at","ends_at","all_day","time_zone","level","source","occurred_at","summary","state","waiting","started_at","reports_to","missed_at","needs_json","open_surface","open_id","updated_at") VALUES('task','88ad5777-0c23-4a53-b30f-f00d4aad7870','金样验收对象 seed','open',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_overview_rows"("kind","row_id","title","status","due_at","remind_at","priority","tags_json","starts_at","ends_at","all_day","time_zone","level","source","occurred_at","summary","state","waiting","started_at","reports_to","missed_at","needs_json","open_surface","open_id","updated_at") VALUES('task','b7332ca1-1c2d-4b97-b84e-6f420b2d43d2','金样待办 seed 已改','open',NULL,'2030-01-15T01:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-27T11:46:22.922Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_context"("id","project_id") VALUES(1,'personal');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_changes"("seq","key") VALUES(1,'["personal","todo","88ad5777-0c23-4a53-b30f-f00d4aad7870"]');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_changes"("seq","key") VALUES(2,'["personal","todo","b7332ca1-1c2d-4b97-b84e-6f420b2d43d2"]');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_changes"("seq","key") VALUES(3,'["personal","todo","b7332ca1-1c2d-4b97-b84e-6f420b2d43d2"]');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_state"("id","device","cursor","applying") VALUES(1,'df4329aa37c9fb9d5094b24eacc3115d',0,0);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('12646434-9e7a-47d8-95c0-5eff47d49000','b7332ca1-1c2d-4b97-b84e-6f420b2d43d2',NULL,'update','user','2026-11-27T11:46:22.922Z','{"remind_at":null}','{"remind_at":"2030-01-15T01:00:00.000Z"}',3,NULL);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('ca1eeff9-e843-4aa8-8206-db67a26ff290','b7332ca1-1c2d-4b97-b84e-6f420b2d43d2',NULL,'create','user','2026-01-15T09:00:00.000Z',NULL,'{"title":"金样待办 seed"}',1,NULL);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('e527a972-6436-439c-98d9-4aac5e75a1b0','88ad5777-0c23-4a53-b30f-f00d4aad7870',NULL,'create','user','2026-01-15T09:00:00.000Z',NULL,'{"title":"金样验收对象 seed"}',1,NULL);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('edcf7005-2cc5-4b75-9c59-4c6237055250','b7332ca1-1c2d-4b97-b84e-6f420b2d43d2',NULL,'update','user','2026-01-15T09:00:00.000Z','{"title":"金样待办 seed"}','{"title":"金样待办 seed 已改"}',2,NULL);
INSERT INTO "todo_editor_versions"("id","revision") VALUES('88ad5777-0c23-4a53-b30f-f00d4aad7870',1);
INSERT INTO "todo_editor_versions"("id","revision") VALUES('b7332ca1-1c2d-4b97-b84e-6f420b2d43d2',3);
INSERT INTO "todo_items"("id","title","notes","status","due_date","due_time","planned_date","remind_at","important","waiting_json","sources_json","links_json","edited_fields_json","archived_at","completed_at","created_at","updated_at","revision","reminder_acknowledged_at") VALUES('88ad5777-0c23-4a53-b30f-f00d4aad7870','金样验收对象 seed','','open',NULL,NULL,NULL,NULL,0,NULL,'[{"source_id":"70cf43a1-a3a0-416c-b2a2-bccb3397bb1e","kind":"manual","title":"你手动记下","excerpt":"","reason":"","subject":null,"open":null,"added_at":"2026-01-15T09:00:00.000Z"}]','[]','[]',NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',1,NULL);
INSERT INTO "todo_items"("id","title","notes","status","due_date","due_time","planned_date","remind_at","important","waiting_json","sources_json","links_json","edited_fields_json","archived_at","completed_at","created_at","updated_at","revision","reminder_acknowledged_at") VALUES('b7332ca1-1c2d-4b97-b84e-6f420b2d43d2','金样待办 seed 已改','','open',NULL,NULL,NULL,'2030-01-15T01:00:00.000Z',0,NULL,'[{"source_id":"8db5546e-13dd-48ae-8302-56fab44578c6","kind":"manual","title":"你手动记下","excerpt":"","reason":"","subject":null,"open":null,"added_at":"2026-01-15T09:00:00.000Z"}]','[]','["title","remind_at"]',NULL,NULL,'2026-01-15T09:00:00.000Z','2026-11-27T11:46:22.922Z',3,NULL);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_7850314bc5fb74741120b35ad6fa_replica_changes',3);
CREATE INDEX molis_overview_rows_remind ON molis_overview_rows(remind_at) WHERE remind_at IS NOT NULL;
CREATE INDEX sync_7850314bc5fb74741120b35ad6fa_replica_changes_key ON sync_7850314bc5fb74741120b35ad6fa_replica_changes(key);
CREATE INDEX todo_changes_batch ON todo_changes (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX todo_changes_item ON todo_changes (item_id);
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_delete" AFTER DELETE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_insert" AFTER INSERT ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_update" AFTER UPDATE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_7850314bc5fb74741120b35ad6fa_context" WHERE id=1),'todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
PRAGMA user_version=1;
COMMIT;
