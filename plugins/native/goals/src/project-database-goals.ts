// The Goals tables in a partition's main database, as the statements GOALS_PROJECT_DATABASE (./project-database.ts) declares in the Manifest.
// The library holds exactly one partition (U3, batch 109), so no row names it: `boards` is a single row, and nothing else keeps a project id.

/** The Goal tree: Goals, criteria, relations, and trash. */
export const GOALS_TABLES_SQL = `
  CREATE TABLE goals (
    goal_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    why TEXT NOT NULL,
    business_logic TEXT NOT NULL,
    in_scope_json TEXT NOT NULL DEFAULT '[]',
    out_of_scope_json TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    required_inputs_json TEXT NOT NULL DEFAULT '[]',
    promised_outputs_json TEXT NOT NULL DEFAULT '[]',
    decomposition_review_json TEXT,
    definition_state TEXT NOT NULL CHECK (definition_state IN ('draft', 'accepted')),
    decomposition_state TEXT NOT NULL CHECK (decomposition_state IN ('abstract', 'frontier_open', 'closed_leaf', 'closed_compound')),
    validity_state TEXT NOT NULL CHECK (validity_state IN ('valid', 'needs_revalidation', 'invalidated')),
    fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('unmet', 'satisfied')),
    trashed_at TEXT,
    trashed_by TEXT,
    archived_at TEXT,
    archived_by TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    accepted_by TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX goals_ready_idx ON goals(definition_state, decomposition_state, validity_state, fulfillment_state);
  CREATE INDEX goals_trash_idx ON goals(trashed_at);
  CREATE INDEX goals_archive_idx ON goals(archived_at);

  CREATE TABLE acceptance_criteria (
    criterion_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    decision_method TEXT NOT NULL,
    pass_condition TEXT NOT NULL,
    target_json TEXT,
    required_evidence_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);

  CREATE TABLE goal_relations (
    relation_id TEXT PRIMARY KEY,
    from_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    to_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deactivated_at TEXT
  );
  CREATE INDEX relations_from_idx ON goal_relations(from_goal_id, state);
  CREATE INDEX relations_to_idx ON goal_relations(to_goal_id, state);

  CREATE TABLE goal_trash_records (
    trash_record_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    trashed_at TEXT NOT NULL,
    trashed_by TEXT NOT NULL,
    trash_reason TEXT NOT NULL,
    restored_at TEXT,
    restored_by TEXT,
    restore_reason TEXT
  );
  CREATE UNIQUE INDEX goal_trash_one_open_per_goal
    ON goal_trash_records(goal_id)
    WHERE restored_at IS NULL;
  CREATE INDEX goal_trash_records_goal_idx
    ON goal_trash_records(goal_id, restored_at, trashed_at);

  CREATE TABLE goal_trash_relation_records (
    trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
    relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
    prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
    deactivated_at TEXT NOT NULL,
    restored_at TEXT,
    PRIMARY KEY (trash_record_id, relation_id)
  );
  CREATE INDEX goal_trash_relation_records_relation_idx
    ON goal_trash_relation_records(relation_id, restored_at);

`;

/**
 * The board that names the partition's current Goal, owned by Goals: one row (`id` 1), as the library holds one partition. The
 * partition's name is the Catalog's, never kept here.
 */
export const GOALS_BOARDS_SQL = `
        CREATE TABLE boards (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          active_goal_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
`;

/** What a person confirmed as the source of a Goal's input. */
export const GOALS_INPUT_BINDINGS_SQL = `
  CREATE TABLE input_bindings (
    binding_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    input_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    source_edge_key TEXT,
    snapshot_digest TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;
