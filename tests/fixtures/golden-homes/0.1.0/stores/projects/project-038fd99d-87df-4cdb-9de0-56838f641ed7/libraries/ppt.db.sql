PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE presentation_copies (request_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE presentations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color_primary TEXT NOT NULL,
    color_background TEXT NOT NULL,
    color_text TEXT NOT NULL,
    slides_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_4c235c6e5ce01f475d0e44c40a33_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "presentations"("id","title","description","color_primary","color_background","color_text","slides_json","created_at","updated_at","version","artifact_id","artifact_version","publication_pending_json") VALUES('3397f6ba-b448-4009-b0ba-fd2728c2fc59','金样演示 seed 已改','','#5e6ad2','#FCFCFB','#292A2E','[{"id":"30868f54-f6ed-48e2-b8d4-971b94b78790","title":"","bullets":[],"notes":"","order":1}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'',0,NULL);
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_aggregate_editor_versions"("key","version") VALUES('["project-038fd99d-87df-4cdb-9de0-56838f641ed7","presentation","3397f6ba-b448-4009-b0ba-fd2728c2fc59"]',2);
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_context"("id","project_id") VALUES(1,'project-038fd99d-87df-4cdb-9de0-56838f641ed7');
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_replica_changes"("seq","key") VALUES(1,'["project-038fd99d-87df-4cdb-9de0-56838f641ed7","presentation","3397f6ba-b448-4009-b0ba-fd2728c2fc59"]');
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_replica_state"("id","device","cursor","applying") VALUES(1,'fffd7d0c958aa19cb6cbda2c875b76b2',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_4c235c6e5ce01f475d0e44c40a33_replica_changes',1);
CREATE INDEX sync_4c235c6e5ce01f475d0e44c40a33_replica_changes_key ON sync_4c235c6e5ce01f475d0e44c40a33_replica_changes(key);
CREATE TRIGGER sync_4c235c6e5ce01f475d0e44c40a33_presentations_aggregate_delete AFTER DELETE ON presentations BEGIN INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',OLD.id) WHERE (SELECT applying FROM sync_4c235c6e5ce01f475d0e44c40a33_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_aggregate_editor_versions VALUES (json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',OLD.id),OLD.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_4c235c6e5ce01f475d0e44c40a33_presentations_aggregate_insert AFTER INSERT ON presentations BEGIN INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',NEW.id) WHERE (SELECT applying FROM sync_4c235c6e5ce01f475d0e44c40a33_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_aggregate_editor_versions VALUES (json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_4c235c6e5ce01f475d0e44c40a33_presentations_aggregate_update AFTER UPDATE ON presentations BEGIN INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',NEW.id) WHERE (SELECT applying FROM sync_4c235c6e5ce01f475d0e44c40a33_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_4c235c6e5ce01f475d0e44c40a33_aggregate_editor_versions VALUES (json_array((SELECT project_id FROM sync_4c235c6e5ce01f475d0e44c40a33_context WHERE id=1),'presentation',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
PRAGMA user_version=1;
COMMIT;
