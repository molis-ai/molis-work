// Event work's recorded facts in a project's library, as GOALS_PROJECT_DATABASE (./project-database.ts) declares them.

/**
 * Which requirement Goals hung on the platform's acceptance store for a Goal, and where it came from (`create_input`, an imported
 * acceptance criterion with its pass condition, or an imported human approval with its policy binding). Only the origin lives here;
 * the statement, its version, and its state belong to the platform's acceptance store.
 */
export const GOALS_REQUIREMENT_LINKS_SQL = `  CREATE TABLE IF NOT EXISTS goal_requirement_links (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    origin_json TEXT,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, requirement_id)
  );
`;

/** Event configuration, types, requirement bindings, work events, and platform requirement origin links. */
export const GOALS_EVENT_FACTS_SQL = `
  CREATE TABLE IF NOT EXISTS goal_event_configs (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    current_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );

  CREATE TABLE IF NOT EXISTS goal_event_config_versions (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    config_event_id TEXT NOT NULL,
    PRIMARY KEY (goal_id, version)
  );

  CREATE TABLE IF NOT EXISTS goal_event_types (
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
    PRIMARY KEY (goal_id, type_id, type_version)
  );
  CREATE INDEX IF NOT EXISTS goal_event_types_goal_idx
    ON goal_event_types(goal_id, type_id, type_version);

  CREATE TABLE IF NOT EXISTS goal_event_requirement_bindings (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, type_id, requirement_id)
  );

  CREATE TABLE IF NOT EXISTS goal_work_events (
    event_id TEXT PRIMARY KEY,
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
    ON goal_work_events(goal_id, journal_seq);

${GOALS_REQUIREMENT_LINKS_SQL}`;
