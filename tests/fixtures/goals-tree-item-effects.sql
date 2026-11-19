
CREATE TABLE goal_tree_item_effects (
  effect_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
  approval_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('confirmed', 'rejected', 'revised', 'conflict')),
  runtime_actor_id TEXT,
  reason TEXT NOT NULL,
  revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
  materialized_objects_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX goal_tree_item_effects_proposal_idx ON goal_tree_item_effects(project_id, proposal_id, item_id, created_at, effect_id);

-- Goals v6 (batch 44 item 3): acceptance moved to platform; closures track acceptance_round, decision requests allow 'moved', requirement origins live in goal_requirement_links.
ALTER TABLE goal_event_closures ADD COLUMN acceptance_round INTEGER;
DROP TABLE goal_event_decision_requests;
CREATE TABLE goal_event_decision_requests (
  request_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'suggestion' CHECK (purpose IN ('suggestion', 'requirement_acceptance', 'action', 'agreement_change')),
  proposed_change_json TEXT,
  commitment_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'decided', 'moved')),
  created_at TEXT NOT NULL
);
CREATE INDEX goal_event_decision_requests_goal_idx
  ON goal_event_decision_requests(project_id, goal_id, status);
CREATE TABLE goal_requirement_links (
  project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  origin_json TEXT,
  created_in_config_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, goal_id, requirement_id)
);
