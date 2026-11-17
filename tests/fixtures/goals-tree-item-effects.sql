
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
