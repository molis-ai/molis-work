PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE issue_editor_versions(id TEXT PRIMARY KEY,version INTEGER NOT NULL);
CREATE TABLE issues (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
    type TEXT NOT NULL CHECK(type IN ('bug','experience','feature')), description TEXT NOT NULL CHECK(length(description) <= 100000),
    context_json TEXT NOT NULL, images_json TEXT NOT NULL, submitter_id TEXT NOT NULL,
    entered_via TEXT NOT NULL CHECK(entered_via IN ('manual','assistant','mcp')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1)
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_547a53110031b73814823e489835_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_547a53110031b73814823e489835_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_547a53110031b73814823e489835_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "issues"("id","title","type","description","context_json","images_json","submitter_id","entered_via","created_at","updated_at","version") VALUES('221eda60-43ab-430c-a66a-e6308d89fe33','金样问题 seed 已改','feature','合成的问题描述','{"recorded_at":"2026-01-15T09:00:00.000Z","page":null,"caller":{"actor_id":"web-user","audience":"user"}}','[]','web-user','manual','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sync_547a53110031b73814823e489835_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_547a53110031b73814823e489835_replica_state"("id","device","cursor","applying") VALUES(1,'4f7fcce97156b662c9db5ef9b8d3c26f',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_547a53110031b73814823e489835_replica_changes',0);
CREATE INDEX issues_by_submitter_created ON issues(submitter_id,created_at DESC,id DESC);
CREATE INDEX sync_547a53110031b73814823e489835_replica_changes_key ON sync_547a53110031b73814823e489835_replica_changes(key);
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_delete" AFTER DELETE ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',OLD."id") AS key WHERE OLD."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_insert" AFTER INSERT ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO "issue_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
CREATE TRIGGER "sync_547a53110031b73814823e489835_track_0_update" AFTER UPDATE ON "issues" BEGIN INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO sync_547a53110031b73814823e489835_replica_changes(key) SELECT key FROM (SELECT json_array('issue',OLD."id") AS key WHERE OLD."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') EXCEPT SELECT json_array('issue',NEW."id") AS key WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')) WHERE (SELECT applying FROM sync_547a53110031b73814823e489835_replica_state WHERE id=1)=0;INSERT INTO "issue_editor_versions" ("id","version") SELECT NEW."id",NEW."version" WHERE NEW."submitter_id" IS json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId') ON CONFLICT ("id") DO UPDATE SET "version"=MAX("version",excluded."version"); END;
PRAGMA user_version=1;
COMMIT;
