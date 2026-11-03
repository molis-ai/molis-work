-- Frozen complete current baseline; test-only schema, no real Home receipt.

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
  CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;
  CREATE TABLE form_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));


    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_changes_key ON sync_e9d95efff96195050575d6d2545c_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_e9d95efff96195050575d6d2545c_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_e9d95efff96195050575d6d2545c_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_e9d95efff96195050575d6d2545c_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_e9d95efff96195050575d6d2545c_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));

CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_forms_aggregate_insert AFTER INSERT ON forms BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(NEW.project_id,'form',NEW.id) WHERE (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_e9d95efff96195050575d6d2545c_aggregate_editor_versions VALUES (json_array(NEW.project_id,'form',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_forms_aggregate_delete AFTER DELETE ON forms BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(OLD.project_id,'form',OLD.id) WHERE (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_e9d95efff96195050575d6d2545c_aggregate_editor_versions VALUES (json_array(OLD.project_id,'form',OLD.id),OLD.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
       END;
CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_forms_aggregate_update AFTER UPDATE ON forms BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(NEW.project_id,'form',NEW.id) WHERE (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0 AND (1=1);
      INSERT INTO sync_e9d95efff96195050575d6d2545c_aggregate_editor_versions VALUES (json_array(NEW.project_id,'form',NEW.id),NEW.version) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);
      INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(OLD.project_id,'form',OLD.id) WHERE (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_submissions_aggregate_insert AFTER INSERT ON submissions BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=NEW.form_id AND (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_submissions_aggregate_delete AFTER DELETE ON submissions BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=OLD.form_id AND (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_e9d95efff96195050575d6d2545c_submissions_aggregate_update AFTER UPDATE ON submissions BEGIN INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=NEW.form_id AND (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0; INSERT INTO sync_e9d95efff96195050575d6d2545c_replica_changes(key) SELECT json_array(project_id,'form',id) FROM forms WHERE id=OLD.form_id AND (SELECT applying FROM sync_e9d95efff96195050575d6d2545c_replica_state WHERE id=1)=0; END;
