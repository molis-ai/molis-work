-- Frozen complete current baseline; test-only schema, no real Home receipt.

  CREATE TABLE sparks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    spark_key TEXT NOT NULL,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, spark_key)
  );
  CREATE TABLE spark_requests (
    project_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    spark_id TEXT NOT NULL,
    PRIMARY KEY (project_id, request_id)
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );


    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_changes_key ON sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_030aa860f1ea5b8a9423a7c87999_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_030aa860f1ea5b8a9423a7c87999_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_030aa860f1ea5b8a9423a7c87999_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));

CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_sparks_aggregate_insert AFTER INSERT ON sparks BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(NEW.project_id,'spark',NEW.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

       END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_sparks_aggregate_delete AFTER DELETE ON sparks BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(OLD.project_id,'spark',OLD.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

       END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_sparks_aggregate_update AFTER UPDATE ON sparks BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(NEW.project_id,'spark',NEW.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

      INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(OLD.project_id,'spark',OLD.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_spark_requests_aggregate_insert AFTER INSERT ON spark_requests BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_spark_requests_aggregate_delete AFTER DELETE ON spark_requests BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_spark_requests_aggregate_update AFTER UPDATE ON spark_requests BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0; INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_conversations_aggregate_insert AFTER INSERT ON conversations BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(NEW.project_id,'conversation',NEW.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

       END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_conversations_aggregate_delete AFTER DELETE ON conversations BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(OLD.project_id,'conversation',OLD.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

       END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_conversations_aggregate_update AFTER UPDATE ON conversations BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(NEW.project_id,'conversation',NEW.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (1=1);

      INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(OLD.project_id,'conversation',OLD.id) WHERE (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_messages_aggregate_insert AFTER INSERT ON messages BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_messages_aggregate_delete AFTER DELETE ON messages BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_030aa860f1ea5b8a9423a7c87999_messages_aggregate_update AFTER UPDATE ON messages BEGIN INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0; INSERT INTO sync_030aa860f1ea5b8a9423a7c87999_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_030aa860f1ea5b8a9423a7c87999_replica_state WHERE id=1)=0; END;
