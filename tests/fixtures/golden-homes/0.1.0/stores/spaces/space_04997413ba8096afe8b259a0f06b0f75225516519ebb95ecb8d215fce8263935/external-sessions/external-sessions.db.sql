PRAGMA foreign_keys=OFF;
BEGIN;
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
    UNIQUE (entry_id, location_key, native_id)
  );
CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL);
CREATE TABLE session_attributions (
    session_key TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    project_id TEXT,
    basis TEXT,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
  );
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
CREATE TABLE session_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
CREATE TABLE session_project_ai_reads (
    project_id TEXT PRIMARY KEY,
    allowed INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL
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
INSERT INTO "molis_storage_space"("singleton","space_id","descriptor") VALUES(1,'space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935','{"spaceId":"space_04997413ba8096afe8b259a0f06b0f75225516519ebb95ecb8d215fce8263935","kind":"personal","ownerUserId":"golden-person","teamId":null,"issuer":"https://golden.invalid","applicationId":"io.molis.work.golden"}');
INSERT INTO "session_meta"("key","value") VALUES('binding_snapshot_digest','8277c508113f2293f83d4f12b59bbc8f');
INSERT INTO "session_meta"("key","value") VALUES('directory_snapshot_digest','ef0d8a4836892d223fd64e5613f1d970');
INSERT INTO "session_project_ai_reads"("project_id","allowed","revision","decided_by","decided_at") VALUES('project-adcfbd21-e22e-44f4-af64-38851fbc840c',0,2,'web-user','2026-01-15T09:00:00.000Z');
CREATE INDEX external_sessions_activity_idx
    ON external_sessions (last_activity_at DESC, session_key ASC);
CREATE INDEX external_sessions_directory_idx
    ON external_sessions (directory_key, last_activity_at DESC, session_key ASC);
CREATE INDEX external_sessions_reported_idx
    ON external_sessions (reported_project_id, last_activity_at DESC, session_key ASC);
CREATE INDEX external_sessions_source_idx
    ON external_sessions (entry_id, location_key);
CREATE INDEX session_attributions_project_idx
    ON session_attributions (project_id);
CREATE INDEX session_directories_project_idx
    ON session_directories (derived_project_id);
PRAGMA user_version=1;
COMMIT;
