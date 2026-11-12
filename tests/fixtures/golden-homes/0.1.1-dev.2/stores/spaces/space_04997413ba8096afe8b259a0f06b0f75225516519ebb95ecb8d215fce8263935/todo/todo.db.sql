PRAGMA foreign_keys=OFF;
BEGIN;
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
    batch_id TEXT PRIMARY KEY, project_id TEXT, origin TEXT NOT NULL, method TEXT NOT NULL, title TEXT NOT NULL,
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
CREATE TABLE todo_deleted_projects (id TEXT PRIMARY KEY, project_id TEXT);
CREATE TABLE todo_editor_versions(id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
CREATE TABLE todo_imported_changes(change_id TEXT PRIMARY KEY, item_id TEXT NOT NULL);
CREATE TABLE todo_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    placement TEXT NOT NULL,
    project_id TEXT,
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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_changes"("seq","key") VALUES(1,'["todo","29207165-9b93-451b-9080-f4ff5659b591"]');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_changes"("seq","key") VALUES(2,'["todo","29207165-9b93-451b-9080-f4ff5659b591"]');
INSERT INTO "sync_7850314bc5fb74741120b35ad6fa_replica_state"("id","device","cursor","applying") VALUES(1,'46bc0b81a8722cd683605a8ba5a6ad5e',0,0);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('0a7bf872-ae7a-4cb1-9822-2026dad5b6a3','29207165-9b93-451b-9080-f4ff5659b591',NULL,'update','user','2026-01-15T09:00:00.000Z','{"title":"金样待办 seed"}','{"title":"金样待办 seed 已改"}',2,NULL);
INSERT INTO "todo_changes"("change_id","item_id","batch_id","kind","actor","at","before_json","after_json","revision_after","reverted_by") VALUES('d4517e79-6b32-4317-8faa-4d160afb2d16','29207165-9b93-451b-9080-f4ff5659b591',NULL,'create','user','2026-01-15T09:00:00.000Z',NULL,'{"title":"金样待办 seed"}',1,NULL);
INSERT INTO "todo_editor_versions"("id","revision") VALUES('29207165-9b93-451b-9080-f4ff5659b591',2);
INSERT INTO "todo_items"("id","title","notes","status","placement","project_id","due_date","due_time","planned_date","remind_at","important","waiting_json","sources_json","links_json","edited_fields_json","archived_at","completed_at","created_at","updated_at","revision","reminder_acknowledged_at") VALUES('29207165-9b93-451b-9080-f4ff5659b591','金样待办 seed 已改','','open','personal',NULL,NULL,NULL,NULL,NULL,0,NULL,'[{"source_id":"d0a38d35-4a0a-47ce-96f0-2818aab181b2","kind":"manual","title":"你手动记下","excerpt":"","reason":"","subject":null,"open":null,"added_at":"2026-01-15T09:00:00.000Z"}]','[]','["title"]',NULL,NULL,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,NULL);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_7850314bc5fb74741120b35ad6fa_replica_changes',2);
CREATE INDEX sync_7850314bc5fb74741120b35ad6fa_replica_changes_key ON sync_7850314bc5fb74741120b35ad6fa_replica_changes(key);
CREATE INDEX todo_changes_batch ON todo_changes (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX todo_changes_item ON todo_changes (item_id);
CREATE INDEX todo_items_project ON todo_items (project_id);
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_delete" AFTER DELETE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array('todo',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_insert" AFTER INSERT ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array('todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_7850314bc5fb74741120b35ad6fa_track_0_update" AFTER UPDATE ON "todo_items" BEGIN INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array('todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO sync_7850314bc5fb74741120b35ad6fa_replica_changes(key) SELECT key FROM (SELECT json_array('todo',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array('todo',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_7850314bc5fb74741120b35ad6fa_replica_state WHERE id=1)=0;INSERT INTO "todo_editor_versions" ("id","revision") SELECT NEW."id",NEW."revision" WHERE 1=1 ON CONFLICT ("id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER todo_deleted_project AFTER DELETE ON todo_items BEGIN
    INSERT INTO todo_deleted_projects(id,project_id) VALUES(OLD.id,OLD.project_id)
      ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id;
  END;
PRAGMA user_version=1;
COMMIT;
