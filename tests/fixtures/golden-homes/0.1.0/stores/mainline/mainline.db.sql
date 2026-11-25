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
INSERT INTO "mainline_arrangements"("owner_actor_id","project_id","revision","arrangement","updated_at") VALUES('web-user','project-ae076f4f-3257-40a5-be48-38652812f188','2.cf1d77fb-f24f-45e2-8cd0-12d4c98be35e','{"groups":[{"group_id":"now","default":"now","items":[]},{"group_id":"next","default":"next","items":[{"item_id":"1789acba-a9ba-48c5-a743-f7a67331290e","pinned":false}]},{"group_id":"waiting","default":"waiting","items":[]}],"completed":[],"current":null,"recent":[]}','2026-01-15T09:00:00.000Z');
INSERT INTO "mainline_items"("owner_actor_id","project_id","item_id","name","source_kind","source_id","created_at") VALUES('web-user','project-ae076f4f-3257-40a5-be48-38652812f188','1789acba-a9ba-48c5-a743-f7a67331290e','金样事项 seed',NULL,NULL,'2026-01-15T09:00:00.000Z');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE INDEX mainline_holds_subject ON mainline_holds (owner_actor_id, project_id, subject_kind, subject_id);
CREATE UNIQUE INDEX mainline_items_source ON mainline_items (owner_actor_id, project_id, source_kind, source_id) WHERE source_kind IS NOT NULL;
PRAGMA user_version=1;
COMMIT;
