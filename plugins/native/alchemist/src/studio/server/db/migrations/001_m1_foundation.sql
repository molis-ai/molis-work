CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE workspace_actors (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('local_user', 'system')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE directions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('user_input', 'pulse_opportunity')),
  source_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX directions_workspace_updated_idx ON directions(workspace_id, updated_at DESC);

CREATE TABLE exploration_runs (
  id TEXT PRIMARY KEY,
  direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
  runtime_label TEXT NOT NULL,
  understanding_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX exploration_runs_direction_idx ON exploration_runs(direction_id, created_at DESC);

CREATE TABLE ideas (
  id TEXT PRIMARY KEY,
  direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE RESTRICT,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('exploring', 'build', 'hold', 'drop', 'archived')),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE idea_cards (
  id TEXT PRIMARY KEY,
  exploration_run_id TEXT NOT NULL REFERENCES exploration_runs(id) ON DELETE CASCADE,
  direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'discarded', 'kept')),
  title TEXT NOT NULL,
  highlight TEXT NOT NULL,
  target_user TEXT NOT NULL,
  scenario TEXT NOT NULL,
  problem TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  value_proposition TEXT NOT NULL,
  why_it_may_work TEXT NOT NULL,
  unknowns_json TEXT NOT NULL,
  mvp_json TEXT NOT NULL,
  discarded_at TEXT,
  kept_at TEXT,
  kept_idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idea_cards_exploration_idx ON idea_cards(exploration_run_id, created_at, id);

CREATE TABLE idea_versions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  parent_version INTEGER,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_card_id TEXT NOT NULL REFERENCES idea_cards(id) ON DELETE RESTRICT,
  source_exploration_run_id TEXT NOT NULL REFERENCES exploration_runs(id) ON DELETE RESTRICT,
  content_json TEXT NOT NULL,
  UNIQUE (idea_id, version)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
  input_json TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  checkpoint_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX jobs_claim_idx ON jobs(status, lease_expires_at, created_at);

CREATE TABLE job_events (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, sequence)
);

CREATE TABLE ui_context (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('ideas', 'pulse', 'decisions')),
  direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
  idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
  idea_version INTEGER,
  panel TEXT CHECK (panel IN ('brief', 'market', 'cost', 'decision')),
  hand_focus INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX activity_events_workspace_idx ON activity_events(workspace_id, created_at DESC);
