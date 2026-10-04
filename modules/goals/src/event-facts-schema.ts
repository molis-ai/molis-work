export const GOAL_EVENT_FACTS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS goal_event_configs (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    current_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id)
  );

  CREATE TABLE IF NOT EXISTS goal_event_config_versions (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    adopted_planning_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    config_event_id TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, version)
  );

  CREATE TABLE IF NOT EXISTS goal_event_types (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    type_version INTEGER NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    semantic_family TEXT,
    source_json TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, type_id, type_version)
  );
  CREATE INDEX IF NOT EXISTS goal_event_types_goal_idx
    ON goal_event_types(board_id, goal_id, type_id, type_version);

  CREATE TABLE IF NOT EXISTS goal_event_requirements (
    requirement_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    bound_type_id TEXT,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    source_json TEXT,
    human_decision_required INTEGER NOT NULL DEFAULT 0 CHECK (human_decision_required IN (0, 1)),
    current_status TEXT NOT NULL DEFAULT 'active' CHECK (current_status IN ('active', 'retired')),
    revision INTEGER NOT NULL DEFAULT 1,
    support_valid_after_seq INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS goal_event_requirements_goal_idx
    ON goal_event_requirements(board_id, goal_id, requirement_id);

  CREATE TABLE IF NOT EXISTS goal_event_requirement_bindings (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, type_id, requirement_id)
  );

  CREATE TABLE IF NOT EXISTS goal_work_events (
    event_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('configuration', 'report', 'system')),
    type_id TEXT,
    type_version INTEGER,
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT,
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    config_version INTEGER
  );
  CREATE INDEX IF NOT EXISTS goal_work_events_goal_seq_idx
    ON goal_work_events(board_id, goal_id, journal_seq);

  CREATE TABLE IF NOT EXISTS goal_work_event_judgments (
    event_id TEXT NOT NULL REFERENCES goal_work_events(event_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('supports', 'contradicts', 'unknown')),
    PRIMARY KEY (event_id, requirement_id)
  );
  CREATE INDEX IF NOT EXISTS goal_work_event_judgments_requirement_idx
    ON goal_work_event_judgments(requirement_id, event_id);
`;
