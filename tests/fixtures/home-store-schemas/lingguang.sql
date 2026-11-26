-- Frozen complete current baseline of the plugin's library in each partition (<partition>/libraries/lingguang.db, batch 107); test-only schema, no real Home receipt.

CREATE TABLE sparks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    spark_key TEXT NOT NULL UNIQUE,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE spark_requests (
    request_id TEXT PRIMARY KEY,
    spark_id TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );


    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_changes_key ON sync_764756c5c01e4432072de4c80de9_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_764756c5c01e4432072de4c80de9_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
  
CREATE TABLE sync_764756c5c01e4432072de4c80de9_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_764756c5c01e4432072de4c80de9_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));

CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_insert AFTER INSERT ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_delete AFTER DELETE ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_update AFTER UPDATE ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_insert AFTER INSERT ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_delete AFTER DELETE ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_update AFTER UPDATE ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_insert AFTER INSERT ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_delete AFTER DELETE ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_update AFTER UPDATE ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_insert AFTER INSERT ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_delete AFTER DELETE ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_update AFTER UPDATE ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array((SELECT project_id FROM sync_764756c5c01e4432072de4c80de9_context WHERE id=1),'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; END;
