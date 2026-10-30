import type {
  GoalEventAgreementChange,
  GoalEventAppliedDecisionView,
  GoalEventDecisionCommitment,
  GoalEventDecisionEffect,
  GoalEventDecisionOption,
  GoalEventDecisionPurpose,
  GoalEventDecisionRequestView,
  GoalEventScope,
  GoalEventTrustedAuthoritySource,
} from "../contract/goals.js";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";
import { EMPTY_SCOPE } from "./event-state-scope.js";

type Row = Record<string, unknown>;

/** `goal_event_decision_requests` and `goal_event_applied_decisions`: the decisions asked for and the ones applied. */
export class GoalEventDecisionRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertDecisionRequest(input: {
    requestId: string;
    projectId: string;
    goalId: string;
    eventId: string;
    question: string;
    options: GoalEventDecisionOption[];
    scope: GoalEventScope;
    purpose: GoalEventDecisionPurpose;
    proposedChange: GoalEventAgreementChange | null;
    commitment: GoalEventDecisionCommitment | null;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_decision_requests (
        request_id, project_id, goal_id, event_id, question, options_json, scope_json,
        purpose, proposed_change_json, commitment_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      input.requestId, input.projectId, input.goalId, input.eventId, input.question,
      sqliteJson(input.options), sqliteJson(input.scope), input.purpose,
      input.proposedChange == null ? null : sqliteJson(input.proposedChange),
      input.commitment == null ? null : sqliteJson(input.commitment), input.at,
    );
  }

  getDecisionRequest(projectId: string, goalId: string, requestId: string): GoalEventDecisionRequestView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_decision_requests WHERE request_id = ? AND project_id = ? AND goal_id = ?",
    ).get(requestId, projectId, goalId) as Row | undefined;
    return row ? mapDecisionRequest(row) : null;
  }

  markRequestDecided(requestId: string): void {
    this.db.prepare("UPDATE goal_event_decision_requests SET status = 'decided' WHERE request_id = ?")
      .run(requestId);
  }

  listDecisionRequests(projectId: string, goalId: string): GoalEventDecisionRequestView[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_decision_requests WHERE project_id = ? AND goal_id = ?
      ORDER BY created_at ASC, request_id ASC
    `).all(projectId, goalId) as Row[]).map(mapDecisionRequest);
  }

  insertAppliedDecision(input: {
    decisionId: string;
    projectId: string;
    goalId: string;
    governanceDecisionId: string;
    requestId: string | null;
    eventId: string;
    selectedOptionId: string | null;
    conclusion: string;
    acceptsRequirements: boolean;
    effects: GoalEventDecisionEffect[];
    scope: GoalEventScope;
    commitment: GoalEventDecisionCommitment;
    authorizedChange: GoalEventAgreementChange | null;
    configVersion: number | null;
    agreementVersion: number | null;
    actorId: string;
    authoritySource: GoalEventTrustedAuthoritySource;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_applied_decisions (
        decision_id, project_id, goal_id, governance_decision_id, request_id, event_id,
        selected_option_id, conclusion, accepts_requirements, effects_json, scope_json,
        commitment_json, authorized_change_json, config_version, agreement_version, actor_id, authority_source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.decisionId, input.projectId, input.goalId, input.governanceDecisionId, input.requestId,
      input.eventId, input.selectedOptionId, input.conclusion, input.acceptsRequirements ? 1 : 0,
      sqliteJson(input.effects), sqliteJson(input.scope), sqliteJson(input.commitment),
      input.authorizedChange == null ? null : sqliteJson(input.authorizedChange),
      input.configVersion, input.agreementVersion, input.actorId, input.authoritySource, input.at,
    );
  }

  getAppliedDecision(projectId: string, goalId: string, decisionId: string): GoalEventAppliedDecisionView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_applied_decisions
      WHERE decision_id = ? AND project_id = ? AND goal_id = ?
    `).get(decisionId, projectId, goalId) as Row | undefined;
    return row ? mapAppliedDecision(row) : null;
  }

  getAppliedDecisionByGovernanceId(projectId: string, goalId: string, governanceDecisionId: string): GoalEventAppliedDecisionView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_applied_decisions
      WHERE governance_decision_id = ? AND project_id = ? AND goal_id = ?
    `).get(governanceDecisionId, projectId, goalId) as Row | undefined;
    return row ? mapAppliedDecision(row) : null;
  }

  listAppliedDecisions(projectId: string, goalId: string): GoalEventAppliedDecisionView[] {
    return (this.db.prepare(`
      SELECT d.* FROM goal_event_applied_decisions d
      JOIN goal_work_events e ON e.event_id = d.event_id AND e.project_id = d.project_id AND e.goal_id = d.goal_id
      WHERE d.project_id = ? AND d.goal_id = ?
      ORDER BY e.journal_seq ASC, d.decision_id ASC
    `).all(projectId, goalId) as Row[]).map(mapAppliedDecision);
  }
}

/** A decision of the Goal, marked with whether it was recorded in the round of work the Goal is in now. */
export type AppliedDecisionWithRound = GoalEventAppliedDecisionView & { in_current_round: boolean };

/**
 * Every decision of the Goal in the order it was recorded, each marked with whether it falls in the round of work the Goal is in
 * now: after the latest time it was reopened or resumed. A completed or cancelled Goal works again only through one of those two
 * events, so what was decided before the latest of them belongs to a round that is over.
 */
export function listDecisionsByRound(db: GoalsSqliteDatabase, projectId: string, goalId: string): AppliedDecisionWithRound[] {
  return (db.prepare(`
    SELECT d.*, e.journal_seq > COALESCE((
      SELECT MAX(r.journal_seq) FROM goal_work_events r
      WHERE r.project_id = ? AND r.goal_id = ? AND r.kind = 'system'
        AND json_extract(r.payload_json, '$.operation') IN ('completion_reopened', 'work_resumed')
    ), 0) AS in_current_round
    FROM goal_event_applied_decisions d
    JOIN goal_work_events e ON e.event_id = d.event_id AND e.project_id = d.project_id AND e.goal_id = d.goal_id
    WHERE d.project_id = ? AND d.goal_id = ?
    ORDER BY e.journal_seq ASC, d.decision_id ASC
  `).all(projectId, goalId, projectId, goalId) as Row[]).map((row) => ({
    ...mapAppliedDecision(row),
    in_current_round: Number(row.in_current_round) === 1,
  }));
}

function mapDecisionRequest(row: Row): GoalEventDecisionRequestView {
  return {
    request_id: rowText(row.request_id),
    event_id: rowText(row.event_id),
    question: rowText(row.question),
    options: rowJson(row.options_json, []),
    scope: rowJson(row.scope_json, EMPTY_SCOPE),
    purpose: (row.purpose == null ? "suggestion" : rowText(row.purpose)) as GoalEventDecisionPurpose,
    proposed_change: row.proposed_change_json == null ? null : rowJson<GoalEventAgreementChange | null>(row.proposed_change_json, null),
    commitment: row.commitment_json == null ? null : rowJson<GoalEventDecisionCommitment>(row.commitment_json, { outcome: "", requirements: [] }),
    status: rowText(row.status) as GoalEventDecisionRequestView["status"],
    created_at: rowText(row.created_at),
  };
}

function mapAppliedDecision(row: Row): GoalEventAppliedDecisionView {
  return {
    decision_id: rowText(row.decision_id),
    governance_decision_id: rowText(row.governance_decision_id),
    request_id: row.request_id == null ? null : rowText(row.request_id),
    selected_option_id: row.selected_option_id == null ? null : rowText(row.selected_option_id),
    conclusion: rowText(row.conclusion),
    accepts_requirements: Number(row.accepts_requirements) === 1,
    effects: rowJson<GoalEventDecisionEffect[]>(row.effects_json, []),
    scope: rowJson(row.scope_json, EMPTY_SCOPE),
    commitment: rowJson<GoalEventDecisionCommitment>(row.commitment_json, { outcome: "", requirements: [] }),
    authorized_change: row.authorized_change_json == null ? null : rowJson<GoalEventAgreementChange | null>(row.authorized_change_json, null),
    config_version: row.config_version == null ? null : Number(row.config_version),
    agreement_version: row.agreement_version == null ? null : Number(row.agreement_version),
    actor_id: rowText(row.actor_id),
    authority_source: rowText(row.authority_source) as GoalEventTrustedAuthoritySource,
    recorded_at: rowText(row.recorded_at),
  };
}
