  CREATE TABLE briefs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    actor_id TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL CHECK (scope IN ('home', 'topic', 'personal')),
    title TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    fixed_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE UNIQUE INDEX briefs_project_home ON briefs (project_id) WHERE scope = 'home';
  CREATE UNIQUE INDEX briefs_personal ON briefs (actor_id) WHERE scope = 'personal';
  CREATE INDEX briefs_project ON briefs (project_id, updated_at);
  CREATE TABLE brief_versions (
    brief_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_version INTEGER,
    as_of TEXT NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    PRIMARY KEY (brief_id, version)
  );
  CREATE TABLE brief_edits (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    text TEXT,
    base_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX brief_edits_brief ON brief_edits (brief_id, at);
  CREATE TABLE brief_proposals (
    id TEXT PRIMARY KEY,
    brief_id TEXT NOT NULL UNIQUE,
    base_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    produced_by_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    conflicts_json TEXT NOT NULL
  );
  CREATE TABLE brief_next_marks (
    brief_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('later', 'handed', 'running', 'done', 'failed', 'stale')),
    card_json TEXT,
    actor_id TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (brief_id, option_id)
  );
  CREATE TABLE brief_requests (
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (project_id, actor_id, request_id)
  );
