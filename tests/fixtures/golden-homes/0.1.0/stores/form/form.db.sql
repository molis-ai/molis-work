PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE form_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
CREATE TABLE forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    share_id TEXT,
    questions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    form_version INTEGER NOT NULL,
    questions_json TEXT NOT NULL,
    request_id TEXT,
    source TEXT NOT NULL
  );
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_1299cb8ea8bacadaced737bb64d2_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "forms"("id","title","description","status","share_id","questions_json","created_at","updated_at","version","project_id","artifact_id","artifact_version","publication_pending_json") VALUES('02ac3d0b-d3f7-481a-8855-5fc2db65696e','金样表单 seed','','draft',NULL,'[{"id":"3d026617-71a8-4c2c-82b0-2782b662f4ff","type":"text","title":"金样问题 seed","required":false,"order":1}]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'project-5a835aaf-0890-4fc0-8ac3-7d909119bacb','',0,NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "sync_1299cb8ea8bacadaced737bb64d2_aggregate_editor_versions"("key","version") VALUES('["project-5a835aaf-0890-4fc0-8ac3-7d909119bacb","form","02ac3d0b-d3f7-481a-8855-5fc2db65696e"]',2);
INSERT INTO "sync_1299cb8ea8bacadaced737bb64d2_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_1299cb8ea8bacadaced737bb64d2_replica_changes"("seq","key") VALUES(1,'["project-5a835aaf-0890-4fc0-8ac3-7d909119bacb","form","02ac3d0b-d3f7-481a-8855-5fc2db65696e"]');
INSERT INTO "sync_1299cb8ea8bacadaced737bb64d2_replica_changes"("seq","key") VALUES(2,'["project-5a835aaf-0890-4fc0-8ac3-7d909119bacb","form","02ac3d0b-d3f7-481a-8855-5fc2db65696e"]');
INSERT INTO "sync_1299cb8ea8bacadaced737bb64d2_replica_state"("id","device","cursor","applying") VALUES(1,'65cd4a64036700f6bab9021c4488d6d9',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_1299cb8ea8bacadaced737bb64d2_replica_changes',2);
CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX sync_1299cb8ea8bacadaced737bb64d2_replica_changes_key ON sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key);
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_forms_aggregate_delete AFTER DELETE ON forms BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(OLD.project_id,'form',OLD.id) WHERE (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_aggregate_editor_versions VALUES (json_array(OLD.project_id,'form',OLD.id),OLD.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_forms_aggregate_insert AFTER INSERT ON forms BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(NEW.project_id,'form',NEW.id) WHERE (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_aggregate_editor_versions VALUES (json_array(NEW.project_id,'form',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_forms_aggregate_update AFTER UPDATE ON forms BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(NEW.project_id,'form',NEW.id) WHERE (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_aggregate_editor_versions VALUES (json_array(NEW.project_id,'form',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
      INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(OLD.project_id,'form',OLD.id) WHERE (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_submissions_aggregate_delete AFTER DELETE ON submissions BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=OLD.form_id AND (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_submissions_aggregate_insert AFTER INSERT ON submissions BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=NEW.form_id AND (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_1299cb8ea8bacadaced737bb64d2_submissions_aggregate_update AFTER UPDATE ON submissions BEGIN INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=NEW.form_id AND (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0; INSERT INTO sync_1299cb8ea8bacadaced737bb64d2_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=OLD.form_id AND (SELECT applying FROM sync_1299cb8ea8bacadaced737bb64d2_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
COMMIT;
