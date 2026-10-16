CREATE TABLE jelly_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL);
  CREATE TABLE jelly_note_versions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
  CREATE TABLE jelly_history (id INTEGER PRIMARY KEY AUTOINCREMENT, command TEXT NOT NULL, before_body TEXT NOT NULL, after_body TEXT NOT NULL, before_checksum TEXT NOT NULL, after_checksum TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE jelly_previews (token TEXT PRIMARY KEY, type TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS replica_changes_key ON replica_changes(key);
    CREATE TABLE IF NOT EXISTS replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
