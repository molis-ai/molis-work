PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    spark_key TEXT NOT NULL,
    spark_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, spark_key)
  );
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE spark_requests (
    project_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    spark_id TEXT NOT NULL,
    PRIMARY KEY (project_id, request_id)
  );
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
CREATE TABLE sync_764756c5c01e4432072de4c80de9_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_764756c5c01e4432072de4c80de9_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "sparks"("id","project_id","title","body","source_kind","status","created_at","updated_at") VALUES('9807c6b1-dc1e-48df-b79e-0b111c529243','project-5b6982a0-f9e7-4775-b86d-8fffb6f4859d','金样灵光 seed 已改','合成的灵光正文','manual','inbox','2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.001Z');
INSERT INTO "sync_764756c5c01e4432072de4c80de9_context"("id","project_id") VALUES(1,NULL);
INSERT INTO "sync_764756c5c01e4432072de4c80de9_replica_changes"("seq","key") VALUES(1,'["project-5b6982a0-f9e7-4775-b86d-8fffb6f4859d","spark","9807c6b1-dc1e-48df-b79e-0b111c529243"]');
INSERT INTO "sync_764756c5c01e4432072de4c80de9_replica_changes"("seq","key") VALUES(2,'["project-5b6982a0-f9e7-4775-b86d-8fffb6f4859d","spark","9807c6b1-dc1e-48df-b79e-0b111c529243"]');
INSERT INTO "sync_764756c5c01e4432072de4c80de9_replica_state"("id","device","cursor","applying") VALUES(1,'ebe3fc8723ce35e8257eb69cd0d4185e',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_764756c5c01e4432072de4c80de9_replica_changes',2);
CREATE INDEX sync_764756c5c01e4432072de4c80de9_replica_changes_key ON sync_764756c5c01e4432072de4c80de9_replica_changes(key);
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_delete AFTER DELETE ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(OLD.project_id,'conversation',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_insert AFTER INSERT ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(NEW.project_id,'conversation',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_conversations_aggregate_update AFTER UPDATE ON conversations BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(NEW.project_id,'conversation',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
      INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(OLD.project_id,'conversation',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_delete AFTER DELETE ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_insert AFTER INSERT ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_messages_aggregate_update AFTER UPDATE ON messages BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=NEW.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'conversation',id) FROM conversations WHERE id=OLD.conversation_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_delete AFTER DELETE ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_insert AFTER INSERT ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0;  END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_spark_requests_aggregate_update AFTER UPDATE ON spark_requests BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=NEW.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(project_id,'spark',id) FROM sparks WHERE id=OLD.spark_id AND (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0; END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_delete AFTER DELETE ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(OLD.project_id,'spark',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_insert AFTER INSERT ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(NEW.project_id,'spark',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
       END;
CREATE TRIGGER sync_764756c5c01e4432072de4c80de9_sparks_aggregate_update AFTER UPDATE ON sparks BEGIN INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(NEW.project_id,'spark',NEW.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (1=1);
      
      INSERT INTO sync_764756c5c01e4432072de4c80de9_replica_changes(key) SELECT json_array(OLD.project_id,'spark',OLD.id) WHERE (SELECT applying FROM sync_764756c5c01e4432072de4c80de9_replica_state WHERE id=1)=0 AND (OLD.project_id<>NEW.project_id); END;
PRAGMA user_version=1;
COMMIT;
