CREATE TABLE memory_candidates (
  candidate_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE memory_changes (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, memory_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE memory_meta (
  memory_id TEXT PRIMARY KEY, scope TEXT NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE memory_migrations (
  actor_id TEXT NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, source)
);

CREATE TABLE memory_owners (
  scope TEXT NOT NULL, owner TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, subject TEXT, PRIMARY KEY (scope, owner)
);

CREATE TABLE memory_pairs (
  pair_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE memory_prefs (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (actor_id, key)
);

CREATE TABLE memory_revisions (
  memory_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (memory_id, version)
);

CREATE TABLE memory_signal_events (
  event_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, key TEXT NOT NULL, occurrence TEXT NOT NULL, at TEXT NOT NULL
);

CREATE TABLE memory_uses (
  memory_id TEXT NOT NULL, receipt_id TEXT NOT NULL, at TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY (memory_id, receipt_id)
);

CREATE INDEX memory_candidates_actor ON memory_candidates(actor_id);

CREATE INDEX memory_changes_actor ON memory_changes(actor_id, at);

CREATE INDEX memory_changes_memory ON memory_changes(memory_id);

CREATE INDEX memory_meta_owner ON memory_meta(scope, owner);

CREATE INDEX memory_signal_key ON memory_signal_events(actor_id, key);

CREATE INDEX memory_uses_receipt ON memory_uses(receipt_id);

CREATE INDEX memory_uses_work ON memory_uses(work_id);
