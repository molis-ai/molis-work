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
CREATE TABLE personal_blueprints_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE TABLE personal_blueprints_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE personal_blueprints_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE personal_blueprints_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE personal_blueprints_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TABLE personal_blueprints_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
INSERT INTO "blueprint_drafts"("draft_id","actor_id","project_id","revision","locale","blueprint_json") VALUES('golden-personal-blueprint','web-user',NULL,1,'en','{"title":{"literal":"Golden blueprint draft"},"purpose":{"audience":{"literal":"Golden blueprint draft"},"work":{"literal":"Golden blueprint draft"},"inputs":{"literal":"Golden blueprint draft"},"outputs":{"literal":"Golden blueprint draft"},"first_result":{"literal":"Golden blueprint draft"}},"parts":[{"part_id":"note","layer":"personal","required":false,"proposal":{"kind":"content","type":"notes.outline.v1","body":{}}}],"steps":[{"step_id":"next","title":{"literal":"Golden blueprint draft"},"part_ids":["note"]}],"example_task":{"title":{"literal":"Golden blueprint draft"},"input":{"literal":"Golden blueprint draft"},"step_ids":["next"],"result":{"part_id":"note","location":{"literal":"Golden blueprint draft"}}}}');
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_golden_root_home','{"spaceId":"space_golden_root_home","kind":"local","ownerUserId":null,"teamId":null,"issuer":null,"applicationId":null}');
INSERT INTO "personal_blueprints_replica_changes"("seq","key") VALUES(1,'golden-personal-blueprint');
INSERT INTO "personal_blueprints_replica_state"("id","device","cursor","applying") VALUES(1,'7f550391ced7a3a82be88ee4481d8dcd',0,0);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name,seq) VALUES('personal_blueprints_replica_changes',1);
CREATE UNIQUE INDEX adoptions_personal_request ON adoptions (actor_id, apply_request) WHERE origin_project IS NULL;
CREATE UNIQUE INDEX adoptions_project_request ON adoptions (actor_id, origin_project, apply_request) WHERE origin_project IS NOT NULL AND origin_detached=0;
CREATE INDEX personal_blueprints_replica_changes_key ON personal_blueprints_replica_changes(key);
CREATE TRIGGER personal_blueprints_delete AFTER DELETE ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT OLD.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (OLD.project_id IS NULL); END;
CREATE TRIGGER personal_blueprints_insert AFTER INSERT ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT NEW.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (NEW.project_id IS NULL); END;
CREATE TRIGGER personal_blueprints_update AFTER UPDATE ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT NEW.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (NEW.project_id IS NULL); END;
PRAGMA user_version=1;
COMMIT;
