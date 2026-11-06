-- Frozen complete current baseline; test-only schema, no real Home receipt.

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
  CREATE TABLE dataset_versions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    note TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE dataset_receipts (project_id TEXT NOT NULL, request_id TEXT NOT NULL, dataset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));


    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_changes_key ON sync_60ea550b07187fa8f870a163aa2f_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_60ea550b07187fa8f870a163aa2f_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_60ea550b07187fa8f870a163aa2f_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_60ea550b07187fa8f870a163aa2f_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_60ea550b07187fa8f870a163aa2f_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));

CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_datasets_aggregate_insert AFTER INSERT ON datasets BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(NEW.project_id,'dataset',NEW.id) WHERE (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_60ea550b07187fa8f870a163aa2f_aggregate_editor_versions VALUES (json_array(NEW.project_id,'dataset',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_datasets_aggregate_delete AFTER DELETE ON datasets BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(OLD.project_id,'dataset',OLD.id) WHERE (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_60ea550b07187fa8f870a163aa2f_aggregate_editor_versions VALUES (json_array(OLD.project_id,'dataset',OLD.id),OLD.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_datasets_aggregate_update AFTER UPDATE ON datasets BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(NEW.project_id,'dataset',NEW.id) WHERE (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_60ea550b07187fa8f870a163aa2f_aggregate_editor_versions VALUES (json_array(NEW.project_id,'dataset',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
      INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(OLD.project_id,'dataset',OLD.id) WHERE (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_dataset_versions_aggregate_insert AFTER INSERT ON dataset_versions BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=NEW.dataset_id AND (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_dataset_versions_aggregate_delete AFTER DELETE ON dataset_versions BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=OLD.dataset_id AND (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_60ea550b07187fa8f870a163aa2f_dataset_versions_aggregate_update AFTER UPDATE ON dataset_versions BEGIN INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=NEW.dataset_id AND (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0; INSERT INTO sync_60ea550b07187fa8f870a163aa2f_replica_changes(key) SELECT json_array(project_id,'dataset',id) FROM datasets WHERE id=OLD.dataset_id AND (SELECT applying FROM sync_60ea550b07187fa8f870a163aa2f_replica_state WHERE id=1)=0; END;
