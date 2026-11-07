PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE connections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, api_format TEXT NOT NULL,
    base_url TEXT NOT NULL, model TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
CREATE TABLE jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_name TEXT NOT NULL,
    api_format TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
    size TEXT NOT NULL, aspect_ratio TEXT NOT NULL, status TEXT NOT NULL,
    images_json TEXT NOT NULL, error TEXT NOT NULL,
    created_at TEXT NOT NULL, finished_at TEXT, runner_id TEXT,
    UNIQUE (project_id, request_id)
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_3a28c22289ed28c8fdbe3056c102_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "connections"("id","name","api_format","base_url","model","created_at","updated_at") VALUES('24e5016f-03f8-49bd-bdbf-0c57d10317c3','金样图片连接 seed 已改','openai-images','http://127.0.0.1:9/v1','golden-model','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sync_3a28c22289ed28c8fdbe3056c102_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_3a28c22289ed28c8fdbe3056c102_replica_state"("id","device","cursor","applying") VALUES(1,'3104bb145392cf1710cb9ddcd8942586',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_3a28c22289ed28c8fdbe3056c102_replica_changes',0);
CREATE INDEX jobs_project_created ON jobs(project_id, created_at DESC);
CREATE INDEX sync_3a28c22289ed28c8fdbe3056c102_replica_changes_key ON sync_3a28c22289ed28c8fdbe3056c102_replica_changes(key);
CREATE TRIGGER "sync_3a28c22289ed28c8fdbe3056c102_track_0_delete" AFTER DELETE ON "jobs" BEGIN INSERT INTO sync_3a28c22289ed28c8fdbe3056c102_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'image',OLD."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_3a28c22289ed28c8fdbe3056c102_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_3a28c22289ed28c8fdbe3056c102_track_0_insert" AFTER INSERT ON "jobs" BEGIN INSERT INTO sync_3a28c22289ed28c8fdbe3056c102_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'image',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_3a28c22289ed28c8fdbe3056c102_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_3a28c22289ed28c8fdbe3056c102_track_0_update" AFTER UPDATE ON "jobs" BEGIN INSERT INTO sync_3a28c22289ed28c8fdbe3056c102_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'image',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_3a28c22289ed28c8fdbe3056c102_replica_state WHERE id=1)=0;INSERT INTO sync_3a28c22289ed28c8fdbe3056c102_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'image',OLD."id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'image',NEW."id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_3a28c22289ed28c8fdbe3056c102_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
COMMIT;
