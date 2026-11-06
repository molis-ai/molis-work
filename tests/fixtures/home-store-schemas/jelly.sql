-- Frozen complete current baseline; test-only schema, no real Home receipt.

  CREATE TABLE jelly_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL);
  CREATE TABLE jelly_note_versions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
  CREATE TABLE jelly_history (id INTEGER PRIMARY KEY AUTOINCREMENT, command TEXT NOT NULL, before_body TEXT NOT NULL, after_body TEXT NOT NULL, before_checksum TEXT NOT NULL, after_checksum TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE jelly_previews (token TEXT PRIMARY KEY, type TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL);


    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_changes_key ON sync_2fc991ea597a3cdf8037e3624d6d_replica_changes(key);
    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sync_2fc991ea597a3cdf8037e3624d6d_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);

CREATE TABLE sync_2fc991ea597a3cdf8037e3624d6d_aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE sync_2fc991ea597a3cdf8037e3624d6d_context (id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT);
INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_context(id,project_id) VALUES(1,NULL);
INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_replica_state(id,device) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER "sync_2fc991ea597a3cdf8037e3624d6d_track_0_insert" AFTER INSERT ON "jelly_workspace" BEGIN INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','workspace') AS key WHERE NEW."revision" > 0) WHERE (SELECT applying FROM sync_2fc991ea597a3cdf8037e3624d6d_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_2fc991ea597a3cdf8037e3624d6d_track_0_update" AFTER UPDATE ON "jelly_workspace" BEGIN INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','workspace') AS key WHERE NEW."revision" > 0) WHERE (SELECT applying FROM sync_2fc991ea597a3cdf8037e3624d6d_replica_state WHERE id=1)=0;INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','workspace') AS key WHERE OLD."revision" > 0 EXCEPT SELECT json_array('jelly','workspace') AS key WHERE NEW."revision" > 0) WHERE (SELECT applying FROM sync_2fc991ea597a3cdf8037e3624d6d_replica_state WHERE id=1)=0; END;
CREATE TRIGGER "sync_2fc991ea597a3cdf8037e3624d6d_track_0_delete" AFTER DELETE ON "jelly_workspace" BEGIN INSERT INTO sync_2fc991ea597a3cdf8037e3624d6d_replica_changes(key) SELECT key FROM (SELECT json_array('jelly','workspace') AS key WHERE OLD."revision" > 0) WHERE (SELECT applying FROM sync_2fc991ea597a3cdf8037e3624d6d_replica_state WHERE id=1)=0; END;
