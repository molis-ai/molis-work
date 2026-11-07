-- Frozen complete current baseline; test-only schema, no real Home receipt.

CREATE TABLE workflow_editor_versions(workflow_id TEXT NOT NULL, project_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(workflow_id,project_id));
CREATE TABLE workflow_imported_instances(instance_id TEXT PRIMARY KEY, project_id TEXT NOT NULL);
  CREATE TABLE workflows (
    workflow_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    chain_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX workflows_project ON workflows (project_id, deleted, updated_at);
  CREATE TABLE instances (
    instance_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    current INTEGER NOT NULL,
    chain_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX instances_workflow ON instances (workflow_id, created_at);



    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_changes_key ON sync_b1502527af2ce1127314acbe774c_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_b1502527af2ce1127314acbe774c_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_b1502527af2ce1127314acbe774c_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_b1502527af2ce1127314acbe774c_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_insert" AFTER INSERT ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO "workflow_editor_versions" ("workflow_id","project_id","revision") SELECT NEW."workflow_id",NEW."project_id",NEW."revision" WHERE 1=1 ON CONFLICT ("workflow_id","project_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_update" AFTER UPDATE ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'workflow',OLD."workflow_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO "workflow_editor_versions" ("workflow_id","project_id","revision") SELECT NEW."workflow_id",NEW."project_id",NEW."revision" WHERE 1=1 ON CONFLICT ("workflow_id","project_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_delete" AFTER DELETE ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'workflow',OLD."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_insert" AFTER INSERT ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_update" AFTER UPDATE ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(NEW."project_id",'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'instance',OLD."instance_id") AS key WHERE 1=1 EXCEPT SELECT json_array(NEW."project_id",'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_delete" AFTER DELETE ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array(OLD."project_id",'instance',OLD."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
