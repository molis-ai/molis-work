-- Frozen complete current baseline; test-only schema, no real Home receipt.

  CREATE TABLE functions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    function_key TEXT NOT NULL UNIQUE,
    primitive TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER,
    model TEXT NOT NULL,
    instructions TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    last_preview_json TEXT,
    samples_json TEXT NOT NULL DEFAULT '[]',
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    scene_id TEXT,
    subject_kinds_json TEXT NOT NULL DEFAULT '[]',
    scene_map_json TEXT NOT NULL DEFAULT '{}',
    scene_version INTEGER,
    scene_provider_id TEXT,
    action_map_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE function_judgments (
    judgment_id TEXT PRIMARY KEY,
    function_key TEXT NOT NULL,
    function_version INTEGER NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    scene_id TEXT,
    outcome TEXT NOT NULL,
    suggested_json TEXT NOT NULL,
    error_code TEXT,
    created_at TEXT NOT NULL,
    scene_provenance_json TEXT,
    recommended_actions_json TEXT,
    install_id TEXT
  );
  CREATE INDEX function_judgments_subject_idx
    ON function_judgments(subject_kind, subject_id, project_id, created_at);
  CREATE TABLE function_scene_bindings (
    scene_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    action_binding_json TEXT NOT NULL,
    binding_revision TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scene_id, project_id)
  );

CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS personal_judgment_rules_replica_changes_key ON personal_judgment_rules_replica_changes(key);
    CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS personal_judgment_rules_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

INSERT INTO personal_judgment_rules_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER personal_judgment_rules_insert AFTER INSERT ON functions BEGIN INSERT INTO personal_judgment_rules_replica_changes(key) SELECT NEW.id WHERE (SELECT applying FROM personal_judgment_rules_replica_state WHERE id=1)=0 AND (NEW.id NOT LIKE 'declared:%'); END;
CREATE TRIGGER personal_judgment_rules_update AFTER UPDATE ON functions BEGIN INSERT INTO personal_judgment_rules_replica_changes(key) SELECT NEW.id WHERE (SELECT applying FROM personal_judgment_rules_replica_state WHERE id=1)=0 AND (NEW.id NOT LIKE 'declared:%'); END;
CREATE TRIGGER personal_judgment_rules_delete AFTER DELETE ON functions BEGIN INSERT INTO personal_judgment_rules_replica_changes(key) SELECT OLD.id WHERE (SELECT applying FROM personal_judgment_rules_replica_state WHERE id=1)=0 AND (OLD.id NOT LIKE 'declared:%'); END;
