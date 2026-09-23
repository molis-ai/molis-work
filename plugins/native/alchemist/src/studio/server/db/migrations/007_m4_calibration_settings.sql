CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('idea_brief', 'lens_report', 'pulse_report')),
  object_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
  block_id TEXT NOT NULL,
  quoted_snapshot TEXT NOT NULL CHECK (length(trim(quoted_snapshot)) > 0),
  comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX annotations_target_idx
  ON annotations(target_kind, object_id, target_revision, created_at);

CREATE TABLE action_proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
  source_id TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('create_playbook_rule', 'create_taste_rule', 'revise_idea')),
  target_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  version_impact TEXT NOT NULL,
  cost_impact TEXT NOT NULL,
  memory_impact TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  rejected_at TEXT
);

CREATE INDEX action_proposals_workspace_idx
  ON action_proposals(workspace_id, status, created_at DESC);

CREATE TABLE taste_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  exceptions_json TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX taste_rules_workspace_idx ON taste_rules(workspace_id, status, updated_at DESC);

CREATE TABLE research_playbook_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  original_feedback TEXT NOT NULL,
  method_change TEXT NOT NULL,
  positive_examples_json TEXT NOT NULL,
  negative_examples_json TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('report', 'direction', 'global_market_space')),
  report_id TEXT,
  direction_id TEXT REFERENCES directions(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('annotation', 'conversation', 'direct')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (scope_kind = 'report' AND report_id IS NOT NULL AND direction_id IS NULL) OR
    (scope_kind = 'direction' AND direction_id IS NOT NULL AND report_id IS NULL) OR
    (scope_kind = 'global_market_space' AND report_id IS NULL AND direction_id IS NULL)
  )
);

CREATE INDEX research_playbook_rules_workspace_idx
  ON research_playbook_rules(workspace_id, status, updated_at DESC);

ALTER TABLE research_plans
  ADD COLUMN applied_playbook_rule_ids_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE memory_rule_applications (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES research_playbook_rules(id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES lens_runs(id) ON DELETE SET NULL,
  applied_at TEXT NOT NULL,
  UNIQUE (rule_id, plan_id)
);

CREATE TABLE runtime_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('none', 'openai')),
  base_url TEXT NOT NULL,
  secret_alias TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_policy TEXT NOT NULL CHECK (model_policy IN ('auto', 'fixed')),
  market_budget_kind TEXT NOT NULL CHECK (market_budget_kind IN ('calls', 'tokens', 'money')),
  market_budget_limit REAL NOT NULL CHECK (market_budget_limit > 0),
  cost_budget_kind TEXT NOT NULL CHECK (cost_budget_kind IN ('calls', 'tokens', 'money')),
  cost_budget_limit REAL NOT NULL CHECK (cost_budget_limit > 0),
  updated_at TEXT NOT NULL
);

ALTER TABLE decisions ADD COLUMN revisit_condition TEXT NOT NULL DEFAULT '';
ALTER TABLE decisions ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'direct'
  CHECK (source_kind IN ('direct', 'annotation', 'conversation'));

CREATE TABLE conversation_messages_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES workspace_actors(id) ON DELETE RESTRICT,
  author TEXT NOT NULL CHECK (author IN ('user', 'assistant')),
  body TEXT NOT NULL,
  context_json TEXT NOT NULL,
  response_state TEXT NOT NULL CHECK (response_state IN ('complete', 'runtime_unavailable', 'failed')),
  parent_message_id TEXT REFERENCES conversation_messages_v2(id) ON DELETE SET NULL,
  runtime_label TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO conversation_messages_v2
  (id, workspace_id, actor_id, author, body, context_json, response_state, created_at)
SELECT id, workspace_id, actor_id, author, body, context_json, response_state, created_at
FROM conversation_messages;

DROP TABLE conversation_messages;
ALTER TABLE conversation_messages_v2 RENAME TO conversation_messages;

CREATE INDEX conversation_messages_workspace_created_idx
  ON conversation_messages(workspace_id, created_at, id);
