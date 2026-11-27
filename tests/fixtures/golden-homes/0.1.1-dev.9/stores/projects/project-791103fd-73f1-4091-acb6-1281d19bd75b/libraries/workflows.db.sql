PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE instances (
    instance_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    current INTEGER NOT NULL,
    chain_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE sync_b1502527af2ce1127314acbe774c_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE workflow_editor_versions(workflow_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE workflow_imported_instances(instance_id TEXT PRIMARY KEY);
CREATE TABLE workflows (
    workflow_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    chain_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "sync_b1502527af2ce1127314acbe774c_context"("id","project_id") VALUES(1,'project-791103fd-73f1-4091-acb6-1281d19bd75b');
INSERT INTO "sync_b1502527af2ce1127314acbe774c_replica_changes"("seq","key") VALUES(1,'["project-791103fd-73f1-4091-acb6-1281d19bd75b","workflow","80e4fed0-609b-4def-b5cf-107f04e6487d"]');
INSERT INTO "sync_b1502527af2ce1127314acbe774c_replica_changes"("seq","key") VALUES(2,'["project-791103fd-73f1-4091-acb6-1281d19bd75b","workflow","80e4fed0-609b-4def-b5cf-107f04e6487d"]');
INSERT INTO "sync_b1502527af2ce1127314acbe774c_replica_state"("id","device","cursor","applying") VALUES(1,'b77cfdd694f9dabcf5ca66ab0eb2edaa',0,0);
INSERT INTO "workflow_editor_versions"("workflow_id","revision") VALUES('80e4fed0-609b-4def-b5cf-107f04e6487d',2);
INSERT INTO "workflows"("workflow_id","title","chain_json","revision","created_at","updated_at","deleted") VALUES('80e4fed0-609b-4def-b5cf-107f04e6487d','金样流程 seed 已改','{"stations":[],"links":[]}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('sync_b1502527af2ce1127314acbe774c_replica_changes',2);
CREATE INDEX instances_workflow ON instances (workflow_id, created_at);
CREATE INDEX sync_b1502527af2ce1127314acbe774c_replica_changes_key ON sync_b1502527af2ce1127314acbe774c_replica_changes(key);
CREATE INDEX workflows_listed ON workflows (deleted, updated_at);
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_delete" AFTER DELETE ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'workflow',OLD."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_insert" AFTER INSERT ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO "workflow_editor_versions" ("workflow_id","revision") SELECT NEW."workflow_id",NEW."revision" WHERE 1=1 ON CONFLICT ("workflow_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_0_update" AFTER UPDATE ON "workflows" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'workflow',OLD."workflow_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'workflow',NEW."workflow_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO "workflow_editor_versions" ("workflow_id","revision") SELECT NEW."workflow_id",NEW."revision" WHERE 1=1 ON CONFLICT ("workflow_id") DO UPDATE SET "revision"=MAX("revision",excluded."revision"); END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_delete" AFTER DELETE ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'instance',OLD."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_insert" AFTER INSERT ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_b1502527af2ce1127314acbe774c_track_1_update" AFTER UPDATE ON "instances" BEGIN INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0;INSERT INTO sync_b1502527af2ce1127314acbe774c_replica_changes(key) SELECT key FROM (SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'instance',OLD."instance_id") AS key WHERE 1=1 EXCEPT SELECT json_array((SELECT project_id FROM "sync_b1502527af2ce1127314acbe774c_context" WHERE id=1),'instance',NEW."instance_id") AS key WHERE 1=1) WHERE (SELECT applying FROM sync_b1502527af2ce1127314acbe774c_replica_state WHERE id=1)=0; END;
PRAGMA user_version=1;
COMMIT;
