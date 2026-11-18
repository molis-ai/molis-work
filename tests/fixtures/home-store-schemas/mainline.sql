-- Frozen complete current baseline; test-only schema, no real Home receipt.

CREATE TABLE mainline_items (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL,
  name TEXT, source_kind TEXT, source_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id),
  CHECK ((name IS NULL) != (source_kind IS NULL)), CHECK ((source_kind IS NULL) = (source_id IS NULL)));
CREATE UNIQUE INDEX mainline_items_source ON mainline_items (owner_actor_id, project_id, source_kind, source_id) WHERE source_kind IS NOT NULL;
CREATE TABLE mainline_arrangements (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, revision TEXT NOT NULL, arrangement TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id));
CREATE TABLE mainline_holds (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL, added_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id, subject_kind, subject_id));
CREATE INDEX mainline_holds_subject ON mainline_holds (owner_actor_id, project_id, subject_kind, subject_id);
