CREATE TABLE blueprint_drafts (
  draft_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT, revision INTEGER NOT NULL,
  locale TEXT NOT NULL, blueprint_json TEXT NOT NULL
);
CREATE TABLE adoptions (
  preview_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, origin_project TEXT, origin_detached INTEGER NOT NULL DEFAULT 0, project_id TEXT,
  preview_json TEXT NOT NULL, title_json TEXT NOT NULL, adoption_id TEXT UNIQUE, apply_request TEXT, selection_json TEXT,
  undo_request TEXT, undo_operation TEXT
);
CREATE UNIQUE INDEX adoptions_personal_request ON adoptions (actor_id, apply_request) WHERE origin_project IS NULL;
CREATE UNIQUE INDEX adoptions_project_request ON adoptions (actor_id, origin_project, apply_request) WHERE origin_project IS NOT NULL AND origin_detached=0;
CREATE TABLE adoption_steps (
  preview_id TEXT NOT NULL REFERENCES adoptions(preview_id) ON DELETE CASCADE,
  part_id TEXT NOT NULL, position INTEGER NOT NULL, plan_json TEXT NOT NULL,
  apply_json TEXT NOT NULL, undo_json TEXT, revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (preview_id, part_id)
);

CREATE TABLE IF NOT EXISTS personal_blueprints_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS personal_blueprints_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS personal_blueprints_replica_changes_key ON personal_blueprints_replica_changes(key);
    CREATE TABLE IF NOT EXISTS personal_blueprints_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_blueprints_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_blueprints_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS personal_blueprints_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

INSERT INTO personal_blueprints_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER personal_blueprints_insert AFTER INSERT ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT NEW.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (NEW.project_id IS NULL); END;
CREATE TRIGGER personal_blueprints_update AFTER UPDATE ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT NEW.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (NEW.project_id IS NULL); END;
CREATE TRIGGER personal_blueprints_delete AFTER DELETE ON blueprint_drafts BEGIN INSERT INTO personal_blueprints_replica_changes(key) SELECT OLD.draft_id WHERE (SELECT applying FROM personal_blueprints_replica_state WHERE id=1)=0 AND (OLD.project_id IS NULL); END;
