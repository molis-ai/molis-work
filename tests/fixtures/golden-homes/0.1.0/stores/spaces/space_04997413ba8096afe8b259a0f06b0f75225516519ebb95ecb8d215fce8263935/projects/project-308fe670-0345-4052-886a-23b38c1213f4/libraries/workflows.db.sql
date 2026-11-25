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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "workflow_editor_versions"("workflow_id","revision") VALUES('ce95e6a8-5328-49fc-9374-93940a6c8357',2);
INSERT INTO "workflows"("workflow_id","title","chain_json","revision","created_at","updated_at","deleted") VALUES('ce95e6a8-5328-49fc-9374-93940a6c8357','金样流程 seed 已改','{"stations":[],"links":[]}',2,'2026-01-15T09:00:00.000Z','2026-01-15T09:00:00.000Z',0);
CREATE INDEX instances_workflow ON instances (workflow_id, created_at);
CREATE INDEX workflows_listed ON workflows (deleted, updated_at);
PRAGMA user_version=1;
COMMIT;
