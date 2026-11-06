-- Frozen current owner schema, captured from a clean synthetic baseline.
CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE TABLE character_runs (
  run_id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL UNIQUE,
  owner_actor_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'dispatched', 'failed')),
  status_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX character_runs_by_character ON character_runs (owner_actor_id, project_id, character_id, created_at);
    CREATE TABLE IF NOT EXISTS characters_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS characters_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS characters_replica_changes_key ON characters_replica_changes(key);
    CREATE TABLE IF NOT EXISTS characters_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS characters_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS characters_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS characters_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
  CREATE TRIGGER characters_sync_insert AFTER INSERT ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_update AFTER UPDATE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(NEW.owner_actor_id,'character',NEW.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
CREATE TRIGGER characters_sync_delete AFTER DELETE ON character_drafts BEGIN INSERT INTO characters_replica_changes(key) SELECT json_array(OLD.owner_actor_id,'character',OLD.character_id) WHERE (SELECT applying FROM characters_replica_state WHERE id=1)=0 AND (1=1); END;
