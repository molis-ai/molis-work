PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE mainline_arrangements (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, revision TEXT NOT NULL, arrangement TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id));
CREATE TABLE mainline_holds (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL, added_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id, subject_kind, subject_id));
CREATE TABLE mainline_items (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL,
  name TEXT, source_kind TEXT, source_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id),
  CHECK ((name IS NULL) != (source_kind IS NULL)), CHECK ((source_kind IS NULL) = (source_id IS NULL)));
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "mainline_arrangements"("owner_actor_id","project_id","revision","arrangement","updated_at") VALUES('web-user','project-ac770e89-50a0-440c-91f9-497bb93109dc','2.49e643c6-a981-4b8b-9806-a30f442f46dc','{"groups":[{"group_id":"now","default":"now","items":[]},{"group_id":"next","default":"next","items":[{"item_id":"59a82cc5-093a-4695-a5d4-71a88cd236f5","pinned":false}]},{"group_id":"waiting","default":"waiting","items":[]}],"completed":[],"current":null,"recent":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "mainline_items"("owner_actor_id","project_id","item_id","name","source_kind","source_id","created_at") VALUES('web-user','project-ac770e89-50a0-440c-91f9-497bb93109dc','59a82cc5-093a-4695-a5d4-71a88cd236f5','金样事项 seed',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
CREATE INDEX mainline_holds_subject ON mainline_holds (owner_actor_id, project_id, subject_kind, subject_id);
CREATE UNIQUE INDEX mainline_items_source ON mainline_items (owner_actor_id, project_id, source_kind, source_id) WHERE source_kind IS NOT NULL;
PRAGMA user_version=1;
COMMIT;
