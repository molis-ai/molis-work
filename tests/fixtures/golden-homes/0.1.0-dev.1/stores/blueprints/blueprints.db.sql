PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE adoption_steps (
  preview_id TEXT NOT NULL REFERENCES adoptions(preview_id) ON DELETE CASCADE,
  part_id TEXT NOT NULL, position INTEGER NOT NULL, plan_json TEXT NOT NULL,
  apply_json TEXT NOT NULL, undo_json TEXT, revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (preview_id, part_id)
);
CREATE TABLE adoptions (
  preview_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, origin_project TEXT, origin_detached INTEGER NOT NULL DEFAULT 0, project_id TEXT,
  preview_json TEXT NOT NULL, title_json TEXT NOT NULL, adoption_id TEXT UNIQUE, apply_request TEXT, selection_json TEXT,
  undo_request TEXT, undo_operation TEXT
);
CREATE TABLE blueprint_drafts (
  draft_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT, revision INTEGER NOT NULL,
  locale TEXT NOT NULL, blueprint_json TEXT NOT NULL
);
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
INSERT INTO "blueprint_drafts"("draft_id","actor_id","project_id","revision","locale","blueprint_json") VALUES('golden-personal-blueprint','web-user',NULL,1,'en','{"title":{"literal":"Golden blueprint draft"},"purpose":{"audience":{"literal":"Golden blueprint draft"},"work":{"literal":"Golden blueprint draft"},"inputs":{"literal":"Golden blueprint draft"},"outputs":{"literal":"Golden blueprint draft"},"first_result":{"literal":"Golden blueprint draft"}},"parts":[{"part_id":"note","layer":"personal","required":false,"proposal":{"kind":"content","type":"notes.outline.v1","body":{}}}],"steps":[{"step_id":"next","title":{"literal":"Golden blueprint draft"},"part_ids":["note"]}],"example_task":{"title":{"literal":"Golden blueprint draft"},"input":{"literal":"Golden blueprint draft"},"step_ids":["next"],"result":{"part_id":"note","location":{"literal":"Golden blueprint draft"}}}}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
CREATE UNIQUE INDEX adoptions_personal_request ON adoptions (actor_id, apply_request) WHERE origin_project IS NULL;
CREATE UNIQUE INDEX adoptions_project_request ON adoptions (actor_id, origin_project, apply_request) WHERE origin_project IS NOT NULL AND origin_detached=0;
PRAGMA user_version=1;
COMMIT;
