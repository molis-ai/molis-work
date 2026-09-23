CREATE TABLE source_settings (
  source_id TEXT PRIMARY KEY CHECK (source_id IN ('toolify', 'watcha', 'github')),
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  homepage_url TEXT NOT NULL,
  capability TEXT NOT NULL,
  limitation TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pulse_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
  stage TEXT NOT NULL CHECK (stage IN ('planning', 'collecting', 'cross_checking', 'synthesizing')),
  source_ids_json TEXT NOT NULL,
  runtime_label TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX pulse_runs_workspace_idx ON pulse_runs(workspace_id, created_at DESC);

CREATE TABLE source_fetches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pulse_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL CHECK (source_id IN ('toolify', 'watcha', 'github')),
  request_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'error')),
  http_status INTEGER,
  fetched_at TEXT NOT NULL,
  content_hash TEXT,
  error_code TEXT,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  UNIQUE (run_id, source_id)
);

CREATE TABLE supply_signals (
  id TEXT PRIMARY KEY,
  fetch_id TEXT NOT NULL REFERENCES source_fetches(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL CHECK (source_id IN ('toolify', 'watcha', 'github')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  published_at TEXT,
  categories_json TEXT NOT NULL,
  native_metrics_json TEXT NOT NULL,
  supports_json TEXT NOT NULL,
  cannot_prove_json TEXT NOT NULL
);

CREATE INDEX supply_signals_source_idx ON supply_signals(source_id, observed_at DESC);

CREATE TABLE pulse_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pulse_runs(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  runtime_label TEXT NOT NULL,
  successful_source_ids_json TEXT NOT NULL,
  failed_source_ids_json TEXT NOT NULL,
  coverage_gaps_json TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, revision)
);

CREATE TABLE pulse_report_signals (
  report_id TEXT NOT NULL REFERENCES pulse_reports(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL REFERENCES supply_signals(id) ON DELETE RESTRICT,
  PRIMARY KEY (report_id, signal_id)
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES pulse_reports(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  title TEXT NOT NULL,
  highlight TEXT NOT NULL,
  rationale TEXT NOT NULL,
  demand_inference TEXT NOT NULL,
  counter_signals_json TEXT NOT NULL,
  unknowns_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'saved_for_later', 'converted_to_direction', 'dismissed')),
  saved_at TEXT,
  dismissed_at TEXT,
  converted_at TEXT,
  converted_direction_id TEXT REFERENCES directions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (report_id, position)
);

CREATE INDEX opportunities_status_idx ON opportunities(status, created_at DESC);

CREATE TABLE opportunity_signals (
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL REFERENCES supply_signals(id) ON DELETE RESTRICT,
  PRIMARY KEY (opportunity_id, signal_id)
);
