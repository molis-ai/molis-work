export const GOVERNANCE_SCHEMA_SQL = `
  CREATE TABLE goal_tree_proposals (
    proposal_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
    submitted_by TEXT NOT NULL,
    submitted_session_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
    version INTEGER NOT NULL,
    supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    base_event_cursor INTEGER NOT NULL,
    summary TEXT NOT NULL,
    narrative_json TEXT,
    decision_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT
  );
  CREATE INDEX goal_tree_proposals_board_idx
    ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
  CREATE INDEX goal_tree_proposals_supersedes_idx
    ON goal_tree_proposals(supersedes_proposal_id);

  CREATE TABLE goal_tree_proposal_items (
    item_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('goal', 'contract', 'relation', 'dependency', 'risk', 'policy', 'candidate', 'rewire')),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'deactivate')),
    payload_json TEXT NOT NULL,
    source_refs_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    explanation_json TEXT,
    confidence REAL NOT NULL,
    affected_objects_json TEXT NOT NULL,
    baseline_versions_json TEXT NOT NULL,
    requires_user_confirmation INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL CHECK (state IN ('pending', 'conflict', 'superseded', 'approved', 'applied', 'rejected', 'dismissed')),
    conflict_json TEXT,
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    supersedes_item_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(proposal_id, ordinal)
  );
  CREATE INDEX goal_tree_proposal_items_proposal_idx
    ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
  CREATE INDEX goal_tree_proposal_items_board_idx
    ON goal_tree_proposal_items(board_id, state, item_id);

  CREATE TABLE goal_tree_proposal_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
    runtime_actor_id TEXT,
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    reason TEXT NOT NULL,
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX goal_tree_proposal_decisions_item_idx
    ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);

  CREATE TABLE IF NOT EXISTS goal_event_trusted_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind = 'user'),
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    request_id TEXT,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    scope_json TEXT NOT NULL,
    change_json TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS goal_event_trusted_decisions_goal_idx
    ON goal_event_trusted_decisions(board_id, goal_id, recorded_at);
`;

export interface GovernanceSchemaDatabase {
  exec(sql: string): unknown;
}

export function createGovernanceSchema(db: GovernanceSchemaDatabase): void {
  db.exec(GOVERNANCE_SCHEMA_SQL);
}
