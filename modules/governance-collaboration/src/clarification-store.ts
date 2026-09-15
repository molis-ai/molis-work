import type {
  ClarificationSessionRecord, ClarificationTurnRecord, GovernanceClarificationApi,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { parseJson, text, optionalText, type GovernanceRow } from "./mappers.js";
import type { GovernanceSqliteDatabase } from "./repository.js";

/** Historical dialogue records. Current work does not write clarification sessions. */
export class GovernanceClarificationStore implements GovernanceClarificationApi {
  constructor(private readonly db: GovernanceSqliteDatabase) {}

  listSessions(boardId: string): ClarificationSessionRecord[] {
    return (this.db.prepare("SELECT * FROM clarification_sessions WHERE board_id = ? ORDER BY updated_at DESC, session_id")
      .all(boardId) as GovernanceRow[]).map(mapClarificationSession);
  }

  listTurns(boardId: string): ClarificationTurnRecord[] {
    return (this.db.prepare("SELECT * FROM clarification_turns WHERE board_id = ? ORDER BY session_id, turn_index, turn_id")
      .all(boardId) as GovernanceRow[]).map(mapClarificationTurn);
  }
}

function mapClarificationSession(row: GovernanceRow): ClarificationSessionRecord {
  return { session_id: text(row.session_id), board_id: text(row.board_id), goal_id: text(row.goal_id),
    claim_id: optionalText(row.claim_id), run_id: optionalText(row.run_id), rough_idea: text(row.rough_idea),
    state: text(row.state) as ClarificationSessionRecord["state"], current_understanding: optionalText(row.current_understanding),
    next_question: optionalText(row.next_question), proposal_summary: optionalText(row.proposal_summary),
    created_by: text(row.created_by), created_at: text(row.created_at), updated_at: text(row.updated_at), closed_at: optionalText(row.closed_at) };
}

function mapClarificationTurn(row: GovernanceRow): ClarificationTurnRecord {
  return { turn_id: text(row.turn_id), session_id: text(row.session_id), board_id: text(row.board_id),
    goal_id: text(row.goal_id), run_id: optionalText(row.run_id), actor_id: text(row.actor_id),
    turn_index: Number(row.turn_index), turn_kind: text(row.turn_kind) as ClarificationTurnRecord["turn_kind"],
    user_message: text(row.user_message), current_understanding: optionalText(row.current_understanding),
    known_facts: parseJson(row.known_facts_json, [] as ClarificationTurnRecord["known_facts"]),
    assumptions: parseJson(row.assumptions_json, [] as ClarificationTurnRecord["assumptions"]),
    next_question: optionalText(row.next_question), proposal_summary: optionalText(row.proposal_summary), created_at: text(row.created_at) };
}
