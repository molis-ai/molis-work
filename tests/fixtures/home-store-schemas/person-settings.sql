-- Frozen complete current baseline (batch 106, specs/unified-partition-plugins); test-only schema, no real Home receipt.
CREATE TABLE person_settings (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'secret_ref', 'connection_ref', 'local_path')),
  portable INTEGER NOT NULL CHECK (portable IN (0, 1) AND (portable = 0 OR kind = 'preference')),
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (install_id, key)
);

    CREATE TABLE IF NOT EXISTS person_settings_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS person_settings_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS person_settings_replica_changes_key ON person_settings_replica_changes(key);
    CREATE TABLE IF NOT EXISTS person_settings_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS person_settings_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS person_settings_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS person_settings_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
  
INSERT INTO person_settings_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER person_settings_insert AFTER INSERT ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
CREATE TRIGGER person_settings_update AFTER UPDATE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT NEW.plugin_id || '/' || NEW.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (NEW.portable = 1); END;
CREATE TRIGGER person_settings_delete AFTER DELETE ON person_settings BEGIN INSERT INTO person_settings_replica_changes(key) SELECT OLD.plugin_id || '/' || OLD.key WHERE (SELECT applying FROM person_settings_replica_state WHERE id=1)=0 AND (OLD.portable = 1); END;
