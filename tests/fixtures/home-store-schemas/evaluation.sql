CREATE TABLE evaluation_samples (
    sample_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    work_mode TEXT NOT NULL,
    project_id TEXT,
    frozen_digest TEXT NOT NULL,
    spec_json TEXT NOT NULL,
    hold_id TEXT,
    held_record_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (sample_id, version)
  );
  CREATE INDEX evaluation_samples_project ON evaluation_samples (project_id, purpose, work_mode);
  CREATE TABLE evaluation_runs (
    run_id TEXT PRIMARY KEY,
    sample_id TEXT NOT NULL,
    sample_version INTEGER NOT NULL,
    sample_purpose TEXT NOT NULL,
    work_mode TEXT NOT NULL,
    project_id TEXT,
    execution_kind TEXT NOT NULL,
    automated_verdict TEXT NOT NULL,
    effective_verdict TEXT NOT NULL,
    verdict_source TEXT NOT NULL,
    evaluated_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    outcome_counts TEXT NOT NULL DEFAULT '{}',
    run_json TEXT NOT NULL
  );
  CREATE INDEX evaluation_runs_sample ON evaluation_runs (sample_id, sample_version, evaluated_at DESC);
  CREATE INDEX evaluation_runs_project ON evaluation_runs (project_id, sample_purpose, evaluated_at DESC);
  CREATE TABLE evaluation_reviews (
    review_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    expectation_id TEXT,
    reviewer_actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    stage TEXT,
    rationale TEXT NOT NULL,
    cited_record_ids TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX evaluation_reviews_run ON evaluation_reviews (run_id, created_at ASC);
