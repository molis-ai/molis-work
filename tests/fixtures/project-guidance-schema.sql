-- A project's guidance (specs/plugin-equal-standing/contract-design.md §9, batch 44 item 2): the platform's two tables and its sync collection's transport.
CREATE TABLE guidance_entries (
  guidance_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  confirmation_summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, position),
  UNIQUE(project_id, kind, content_hash)
);
CREATE INDEX guidance_entries_project_idx ON guidance_entries(project_id, position, guidance_id);
CREATE TABLE guidance_revisions (
  revision_id TEXT PRIMARY KEY,
  guidance_id TEXT NOT NULL REFERENCES guidance_entries(guidance_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  changed_by TEXT NOT NULL,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('created', 'edited', 'deactivated', 'restored')),
  confirmation_summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(guidance_id, revision)
);
CREATE INDEX guidance_revisions_project_idx ON guidance_revisions(project_id, guidance_id, revision DESC);

CREATE TABLE project_guidance_replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_guidance_replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
CREATE INDEX project_guidance_replica_changes_key ON project_guidance_replica_changes(key);
CREATE TABLE project_guidance_replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
CREATE TABLE project_guidance_replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
CREATE TABLE project_guidance_replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
CREATE TABLE project_guidance_replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
CREATE TRIGGER project_guidance_entries_insert AFTER INSERT ON guidance_entries BEGIN
  INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id)
  WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1);
END;
CREATE TRIGGER project_guidance_entries_update AFTER UPDATE ON guidance_entries BEGIN
  INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id)
  WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1);
END;
CREATE TRIGGER project_guidance_revisions_insert AFTER INSERT ON guidance_revisions BEGIN
  INSERT INTO project_guidance_replica_changes(key) SELECT json_array(NEW.project_id,'project_guidance',NEW.project_id)
  WHERE (SELECT applying FROM project_guidance_replica_state WHERE id=1)=0 AND (1=1);
END;
