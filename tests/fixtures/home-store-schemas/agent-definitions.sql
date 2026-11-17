-- Frozen complete current baseline; test-only schema, no real Home receipt.

CREATE TABLE prompt_overrides (
  key TEXT PRIMARY KEY, revision INTEGER NOT NULL, base_version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT
);
CREATE TABLE prompt_history (
  key TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, body TEXT, base_version INTEGER NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL, default_ref TEXT,
  PRIMARY KEY (key, revision)
);
CREATE TABLE prompt_uses (
  key TEXT NOT NULL, at TEXT NOT NULL, version INTEGER NOT NULL, user_revision INTEGER, caller TEXT NOT NULL, source_ref TEXT
);
CREATE INDEX prompt_uses_by_key ON prompt_uses(key, at);

CREATE TABLE skill_settings (
  scope_ref TEXT NOT NULL, install_id TEXT NOT NULL, skill_id TEXT NOT NULL, state TEXT NOT NULL, enabled_at TEXT NOT NULL, enabled_by TEXT NOT NULL,
  revision INTEGER PRIMARY KEY AUTOINCREMENT, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL,
  UNIQUE (scope_ref, install_id, skill_id)
);
CREATE TABLE skill_uses (
  install_id TEXT NOT NULL, skill_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, ref TEXT NOT NULL, scope_ref TEXT NOT NULL,
  caller TEXT NOT NULL, run_ref TEXT, at TEXT NOT NULL
);
CREATE INDEX skill_uses_by_skill ON skill_uses(install_id, skill_id, at);
CREATE TABLE skill_drafts (
  draft_id TEXT PRIMARY KEY, scope_ref TEXT NOT NULL, target TEXT NOT NULL, fields TEXT NOT NULL, replacements TEXT NOT NULL, revision INTEGER NOT NULL,
  origin TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, discarded_at TEXT
);
CREATE INDEX skill_drafts_by_scope ON skill_drafts(scope_ref, discarded_at);
CREATE TABLE skill_cases (
  case_id TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, title TEXT NOT NULL, task TEXT NOT NULL, material TEXT, expected TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX skill_cases_by_owner ON skill_cases(owner_ref, created_at);
CREATE TABLE skill_trials (
  trial_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, draft_revision INTEGER NOT NULL, case_id TEXT NOT NULL, cells TEXT NOT NULL, verdict TEXT NOT NULL,
  ran_at TEXT NOT NULL, actor_id TEXT NOT NULL
);
CREATE INDEX skill_trials_by_draft ON skill_trials(draft_id, ran_at);
CREATE TABLE skill_lineage (
  scope_ref TEXT NOT NULL, skill_id TEXT NOT NULL, source TEXT NOT NULL, replacements TEXT NOT NULL, seen_version INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_ref, skill_id)
);
