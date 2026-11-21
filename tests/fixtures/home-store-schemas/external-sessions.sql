CREATE TABLE external_sessions (
    session_key TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    native_id TEXT NOT NULL,
    seen_via TEXT NOT NULL,
    title TEXT,
    directory_key TEXT,
    directory_path TEXT,
    activity TEXT NOT NULL DEFAULT 'unknown',
    return_target_kind TEXT,
    return_target_label TEXT,
    reported_project_id TEXT,
    last_activity_at TEXT NOT NULL,
    forked_from TEXT,
    gone_at TEXT,
    subagent INTEGER NOT NULL DEFAULT 0,
    UNIQUE (entry_id, location_key, native_id)
  );
  CREATE INDEX external_sessions_activity_idx
    ON external_sessions (last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_directory_idx
    ON external_sessions (directory_key, last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_reported_idx
    ON external_sessions (reported_project_id, last_activity_at DESC, session_key ASC);
  CREATE INDEX external_sessions_source_idx
    ON external_sessions (entry_id, location_key);
  CREATE TABLE session_directories (
    directory_key TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    realpath_verified INTEGER NOT NULL,
    repository_key TEXT,
    worktree_relative TEXT,
    derived_state TEXT NOT NULL,
    derived_project_id TEXT,
    evidence_kind TEXT,
    evidence_path TEXT,
    candidates TEXT NOT NULL,
    directory_digest TEXT NOT NULL
  );
  CREATE INDEX session_directories_project_idx
    ON session_directories (derived_project_id);
  CREATE TABLE session_sources (
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    state TEXT NOT NULL,
    reason TEXT,
    progress_cursor TEXT,
    progress_read INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER,
    session_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (entry_id, location_key)
  );
  CREATE TABLE session_read_scopes (
    entry_id TEXT NOT NULL,
    location_key TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    directories TEXT NOT NULL,
    connection_id TEXT,
    revision INTEGER NOT NULL,
    decided_at TEXT NOT NULL,
    PRIMARY KEY (entry_id, location_key)
  );
  CREATE TABLE session_project_ai_reads (
    project_id TEXT PRIMARY KEY,
    allowed INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE TABLE session_attributions (
    session_key TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    project_id TEXT,
    basis TEXT,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE INDEX session_attributions_project_idx
    ON session_attributions (project_id);
  CREATE TABLE session_suggestions (
    session_key TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    project_id TEXT,
    alternatives TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence TEXT NOT NULL,
    input_digest TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE session_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
