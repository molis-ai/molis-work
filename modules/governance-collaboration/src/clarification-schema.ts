
/** The clarification tables, as one current schema. */
export const CLARIFICATION_SCHEMA_SQL = `
        CREATE TABLE clarification_sessions (
          session_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          claim_id TEXT REFERENCES claims(claim_id),
          run_id TEXT REFERENCES runs(run_id),
          rough_idea TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposal_ready', 'closed')),
          current_understanding TEXT,
          next_question TEXT,
          proposal_summary TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );
        CREATE UNIQUE INDEX clarification_one_open_session_per_goal
          ON clarification_sessions(goal_id)
          WHERE state != 'closed';
        CREATE INDEX clarification_sessions_goal_idx
          ON clarification_sessions(board_id, goal_id, updated_at DESC, session_id);

        CREATE TABLE clarification_turns (
          turn_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES clarification_sessions(session_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          run_id TEXT REFERENCES runs(run_id),
          actor_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          turn_kind TEXT NOT NULL CHECK (turn_kind IN ('rough_idea', 'user_answer')),
          user_message TEXT NOT NULL,
          current_understanding TEXT,
          known_facts_json TEXT NOT NULL DEFAULT '[]',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          next_question TEXT,
          proposal_summary TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, turn_index)
        );
        CREATE INDEX clarification_turns_session_idx
          ON clarification_turns(session_id, turn_index, turn_id);
`;
