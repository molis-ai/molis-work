PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE dataset_receipts (project_id TEXT NOT NULL, request_id TEXT NOT NULL, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
CREATE TABLE dataset_versions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    note TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE datasets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    columns_json TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_aa98c46361f294dbb01ea79b1b42_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "datasets"("id","title","description","status","columns_json","rows_json","created_at","updated_at","version","project_id","artifact_id","artifact_version","publication_pending_json") VALUES('a0ea7c0a-cb22-482e-9719-79b26095257b','金样数据集 seed 已改','','draft','[]','[]','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',2,'project-ccd4c155-9496-4251-abb8-35db06b9515b','',0,NULL);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sync_aa98c46361f294dbb01ea79b1b42_aggregate_editor_versions"("key","version") VALUES('["project-ccd4c155-9496-4251-abb8-35db06b9515b","dataset","a0ea7c0a-cb22-482e-9719-79b26095257b"]',2);
INSERT INTO "sync_aa98c46361f294dbb01ea79b1b42_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_aa98c46361f294dbb01ea79b1b42_replica_changes"("seq","key") VALUES(1,'["project-ccd4c155-9496-4251-abb8-35db06b9515b","dataset","a0ea7c0a-cb22-482e-9719-79b26095257b"]');
INSERT INTO "sync_aa98c46361f294dbb01ea79b1b42_replica_changes"("seq","key") VALUES(2,'["project-ccd4c155-9496-4251-abb8-35db06b9515b","dataset","a0ea7c0a-cb22-482e-9719-79b26095257b"]');
INSERT INTO "sync_aa98c46361f294dbb01ea79b1b42_replica_state"("id","device","cursor","applying") VALUES(1,'5f894dfea6d23301c7ff432e043a7e1f',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_aa98c46361f294dbb01ea79b1b42_replica_changes',2);
CREATE INDEX sync_aa98c46361f294dbb01ea79b1b42_replica_changes_key ON sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key);
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_dataset_versions_aggregate_delete AFTER DELETE ON dataset_versions BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=OLD.dataset_id AND (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_dataset_versions_aggregate_insert AFTER INSERT ON dataset_versions BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=NEW.dataset_id AND (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_dataset_versions_aggregate_update AFTER UPDATE ON dataset_versions BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=NEW.dataset_id AND (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0; INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=OLD.dataset_id AND (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_datasets_aggregate_delete AFTER DELETE ON datasets BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(OLD.project_id,'dataset',OLD.id) WHERE (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_aggregate_editor_versions VALUES (json_array(OLD.project_id,'dataset',OLD.id),OLD.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_datasets_aggregate_insert AFTER INSERT ON datasets BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(NEW.project_id,'dataset',NEW.id) WHERE (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_aggregate_editor_versions VALUES (json_array(NEW.project_id,'dataset',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_aa98c46361f294dbb01ea79b1b42_datasets_aggregate_update AFTER UPDATE ON datasets BEGIN INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(NEW.project_id,'dataset',NEW.id) WHERE (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_aggregate_editor_versions VALUES (json_array(NEW.project_id,'dataset',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
      INSERT INTO sync_aa98c46361f294dbb01ea79b1b42_replica_changes(key) SELECT json_array(OLD.project_id,'dataset',OLD.id) WHERE (SELECT applying FROM sync_aa98c46361f294dbb01ea79b1b42_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
PRAGMA user_version=1;
COMMIT;
