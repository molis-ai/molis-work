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
