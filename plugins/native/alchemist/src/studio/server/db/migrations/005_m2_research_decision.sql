CREATE TABLE mvp_scope_versions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  in_scope_json TEXT NOT NULL,
  out_of_scope_json TEXT NOT NULL,
  platform_assumptions_json TEXT NOT NULL,
  integration_assumptions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (idea_id, version),
  UNIQUE (idea_id, idea_version)
);

CREATE TABLE research_plans (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
  mvp_scope_version INTEGER,
  lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
  scope_summary TEXT NOT NULL,
  model_policy TEXT NOT NULL CHECK (model_policy IN ('auto', 'fixed')),
  model_id TEXT NOT NULL,
  runtime_label TEXT NOT NULL,
  estimated_min_minutes INTEGER NOT NULL CHECK (estimated_min_minutes >= 0),
  estimated_max_minutes INTEGER NOT NULL CHECK (estimated_max_minutes >= estimated_min_minutes),
  budget_kind TEXT NOT NULL CHECK (budget_kind IN ('calls', 'tokens', 'money')),
  budget_limit REAL NOT NULL CHECK (budget_limit > 0),
  budget_currency TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (lens = 'market_space' AND mvp_scope_version IS NULL) OR
    (lens = 'build_cost' AND mvp_scope_version IS NOT NULL)
  )
);

CREATE INDEX research_plans_key_idx
  ON research_plans(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);

CREATE TABLE lens_runs (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE RESTRICT,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
  mvp_scope_version INTEGER,
  lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
  stage TEXT NOT NULL CHECK (stage IN ('planning', 'collecting', 'cross_checking', 'synthesizing')),
  runtime_label TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (lens = 'market_space' AND mvp_scope_version IS NULL) OR
    (lens = 'build_cost' AND mvp_scope_version IS NOT NULL)
  )
);

CREATE INDEX lens_runs_key_idx
  ON lens_runs(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lens_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official', 'user_signal', 'independent_analysis', 'repository')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE lens_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lens_runs(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
  mvp_scope_version INTEGER,
  lens TEXT NOT NULL CHECK (lens IN ('market_space', 'build_cost')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial')),
  runtime_label TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, revision),
  UNIQUE (id, revision)
);

CREATE INDEX lens_reports_key_idx
  ON lens_reports(idea_id, idea_version, lens, mvp_scope_version, created_at DESC);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES lens_reports(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('supported', 'tentative', 'disputed', 'unknown')),
  conclusion TEXT NOT NULL,
  rationale TEXT NOT NULL,
  unknowns_json TEXT NOT NULL,
  change_conditions_json TEXT NOT NULL,
  UNIQUE (report_id, position)
);

CREATE TABLE claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('support', 'counter')),
  PRIMARY KEY (claim_id, evidence_id, relation)
);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  idea_version INTEGER NOT NULL CHECK (idea_version >= 1),
  mvp_scope_version INTEGER NOT NULL CHECK (mvp_scope_version >= 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('build', 'hold', 'drop')),
  reason TEXT NOT NULL,
  market_report_id TEXT NOT NULL,
  market_report_revision INTEGER NOT NULL,
  cost_report_id TEXT NOT NULL,
  cost_report_revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (idea_id, idea_version),
  FOREIGN KEY (market_report_id, market_report_revision) REFERENCES lens_reports(id, revision) ON DELETE RESTRICT,
  FOREIGN KEY (cost_report_id, cost_report_revision) REFERENCES lens_reports(id, revision) ON DELETE RESTRICT
);

CREATE INDEX decisions_created_idx ON decisions(created_at DESC);
