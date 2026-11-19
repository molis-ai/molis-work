// Event work's derived state in a project's library, as GOALS_PROJECT_DATABASE (./project-database.ts) declares it. Moved here whole
// from modules/goals (S8, PG-020); the text of each statement is as it was.

/** Requests for the person's decision. v6 adds `moved`: a request for accepting requirements that the 6→7 step handed to the platform's per-item review (contract-design §10.3). */
const DECISION_REQUESTS = (statuses: string) => `  CREATE TABLE IF NOT EXISTS goal_event_decision_requests (
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
    status TEXT NOT NULL CHECK (status IN (${statuses})),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS goal_event_decision_requests_goal_idx
    ON goal_event_decision_requests(project_id, goal_id, status);

`;

/** Up to v5: the person's conclusion on each requirement, which v6 leaves to the platform's acceptance. */
const CONCLUSIONS = `  CREATE TABLE IF NOT EXISTS goal_event_requirement_conclusions (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'rejected')),
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    checked_artifact_id TEXT,
    checked_version INTEGER,
    PRIMARY KEY (project_id, goal_id, requirement_id, decision_id)
  );
  CREATE INDEX IF NOT EXISTS goal_event_requirement_conclusions_latest_idx
    ON goal_event_requirement_conclusions(project_id, goal_id, requirement_id, journal_seq);

`;

/** Closures; v6 adds, last, the delivery round of the platform's acceptance a completion stood on (contract-design §10.3), none for a cancellation or an earlier closure. */
const CLOSURES = (v6: boolean) => `  CREATE TABLE IF NOT EXISTS goal_event_closures (
    closure_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('complete', 'cancel')),
    result TEXT,
    reason TEXT NOT NULL,
    completion_applied INTEGER NOT NULL CHECK (completion_applied IN (0, 1)),
    expected_config_version INTEGER NOT NULL,
    expected_agreement_version INTEGER NOT NULL DEFAULT 0,
    config_version INTEGER,
    agreement_version INTEGER,
    unmet_reasons_json TEXT NOT NULL DEFAULT '[]',
    superseded INTEGER NOT NULL CHECK (superseded IN (0, 1)),
    superseded_reason TEXT,
    recorded_at TEXT NOT NULL${v6 ? ",\n    acceptance_round INTEGER" : ""}
  );
  CREATE INDEX IF NOT EXISTS goal_event_closures_goal_idx
    ON goal_event_closures(project_id, goal_id, recorded_at);
`;

/** Who owns a Goal's event state, its agreements, summaries, concerns, decisions, conclusions, closures and status. */
const EVENT_STATE_SCHEMA = (concernSubjects: string, v6 = false) => `
  CREATE TABLE IF NOT EXISTS goal_event_state_owners (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    owner TEXT NOT NULL CHECK (owner = 'event_work'),
    source TEXT NOT NULL CHECK (source IN ('intent', 'configuration', 'continue')),
    adopted_at TEXT NOT NULL,
    adopted_by TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
  CREATE INDEX IF NOT EXISTS goal_event_state_owners_project_idx
    ON goal_event_state_owners(project_id, goal_id);

  CREATE TABLE IF NOT EXISTS goal_event_agreements (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_id TEXT,
    PRIMARY KEY (project_id, goal_id, version)
  );

  CREATE TABLE IF NOT EXISTS goal_event_progress_summaries (
    summary_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    based_on_cursor INTEGER NOT NULL,
    next_step TEXT,
    next_actor TEXT,
    actor_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS goal_event_progress_summaries_goal_idx
    ON goal_event_progress_summaries(project_id, goal_id, recorded_at);

  CREATE TABLE IF NOT EXISTS goal_event_concerns (
    concern_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    blocks_closure INTEGER NOT NULL CHECK (blocks_closure IN (0, 1)),
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'accepted', 'overturned')),
    resolution_reason TEXT,
    resolution_event_id TEXT,
    cited_decision_id TEXT,
    previous_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL${concernSubjects}
  );
  CREATE INDEX IF NOT EXISTS goal_event_concerns_goal_idx
    ON goal_event_concerns(project_id, goal_id, status);

${DECISION_REQUESTS(v6 ? "'pending', 'decided', 'moved'" : "'pending', 'decided'")}  CREATE TABLE IF NOT EXISTS goal_event_applied_decisions (
    decision_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    governance_decision_id TEXT NOT NULL,
    request_id TEXT,
    event_id TEXT NOT NULL,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    effects_json TEXT NOT NULL DEFAULT '[]',
    scope_json TEXT NOT NULL,
    commitment_json TEXT NOT NULL DEFAULT '{"outcome":"","requirements":[]}',
    authorized_change_json TEXT,
    config_version INTEGER,
    agreement_version INTEGER,
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS goal_event_applied_decisions_goal_idx
    ON goal_event_applied_decisions(project_id, goal_id, recorded_at);

${v6 ? "" : CONCLUSIONS}${CLOSURES(v6)}
  CREATE TABLE IF NOT EXISTS goal_event_work_status (
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    work_status TEXT NOT NULL CHECK (work_status IN ('open', 'completed', 'cancelled')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
`;

export const GOALS_EVENT_STATE_SQL = EVENT_STATE_SCHEMA(",\n    cited_subjects_json TEXT NOT NULL DEFAULT '[]'");
export const GOALS_V2_EVENT_STATE_SQL = EVENT_STATE_SCHEMA("");
/** v6: without the requirement conclusions, and with `moved` requests. */
export const GOALS_V6_EVENT_STATE_SQL = EVENT_STATE_SCHEMA(",\n    cited_subjects_json TEXT NOT NULL DEFAULT '[]'", true);
/** v6's decision requests alone: the 6→7 handover makes the table again from this very text. */
export const GOALS_V6_DECISION_REQUESTS_SQL = DECISION_REQUESTS("'pending', 'decided', 'moved'");
/** v6's closures alone: the 6→7 handover makes the table again from this very text, each row with no acceptance round. */
export const GOALS_V6_CLOSURES_SQL = CLOSURES(true);
