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
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_context"("id","project_id") VALUES(1,'molis-work-v1-demo');
INSERT INTO "sync_4c235c6e5ce01f475d0e44c40a33_replica_state"("id","device","cursor","applying") VALUES(1,'92d04423348e5e101f91c6c4342dd6d7',0,0);
DELETE FROM sqlite_sequence;
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
