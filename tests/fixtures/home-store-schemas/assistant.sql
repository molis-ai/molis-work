CREATE TABLE assistant_cards (
  card_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE assistant_followups (
  followup_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE assistant_jobs (
  key TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);

CREATE TABLE assistant_memory_candidates (
  candidate_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE assistant_notices (
  notice_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
  dedupe TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(actor_id, dedupe)
);

CREATE TABLE assistant_observed (
  actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor_id, work_id)
);

CREATE TABLE assistant_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id)
);

CREATE TABLE assistant_rounds (
  work_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(work_id, run_id)
);

CREATE TABLE assistant_settings (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(actor_id, key)
);

CREATE TABLE assistant_undos (
  undo_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE assistant_unsettled (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);

CREATE TABLE assistant_usage (
  run_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, ended_at TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cached INTEGER NOT NULL
);

CREATE TABLE assistant_works (
  work_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);

CREATE TABLE context_edges (
      scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
      scope_id TEXT NOT NULL,
      edge_key TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      relation_type TEXT NOT NULL,
      source_json TEXT NOT NULL,
      target_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      cause TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
      PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
    );

CREATE INDEX assistant_cards_by_work ON assistant_cards(work_id, created_at);

CREATE INDEX assistant_notices_open ON assistant_notices(actor_id, state, created_at);

CREATE INDEX assistant_usage_by_day ON assistant_usage(actor_id, ended_at);

CREATE INDEX assistant_works_by_actor ON assistant_works(actor_id, archived, updated_at);

CREATE INDEX context_edges_source_idx ON context_edges
      (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
