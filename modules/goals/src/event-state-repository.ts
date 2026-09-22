import type {
  GoalEventAgreementChange,
  GoalEventAgreementView,
  GoalEventAppliedDecisionView,
  GoalEventClosureView,
  GoalEventConcernStatus,
  GoalEventConcernView,
  GoalEventDecisionCommitment,
  GoalEventDecisionEffect,
  GoalEventDecisionOption,
  GoalEventDecisionPurpose,
  GoalEventDecisionRequestView,
  GoalEventImportedCompletion,
  GoalEventProgressSummaryView,
  GoalEventScope,
  GoalEventStateOwnerView,
  GoalEventTrustedAuthoritySource,
  GoalEventUnmetReason,
  GoalEventUserConclusion,
  GoalEventWorkStatus,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

const EMPTY_SCOPE: GoalEventScope = {
  requirement_ids: [],
  event_ids: [],
  concern_ids: [],
  action: null,
};

export function goalHasEventStateOwner(db: GoalsSqliteDatabase, boardId: string, goalId: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM goal_event_state_owners WHERE board_id = ? AND goal_id = ? LIMIT 1",
  ).get(boardId, goalId));
}

export class GoalEventStateRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  isOwner(boardId: string, goalId: string): boolean {
    return goalHasEventStateOwner(this.db, boardId, goalId);
  }

  readOwner(boardId: string, goalId: string): GoalEventStateOwnerView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_state_owners WHERE board_id = ? AND goal_id = ?",
    ).get(boardId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      kind: "event_work",
      adopted_at: rowText(row.adopted_at),
      adopted_by: rowText(row.adopted_by),
      source: rowText(row.source) as GoalEventStateOwnerView["source"],
    };
  }

  adoptOwner(input: {
    boardId: string;
    goalId: string;
    actorId: string;
    source: "intent" | "configuration" | "continue" | "migration";
    at: string;
  }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO goal_event_state_owners (
        board_id, goal_id, owner, source, adopted_at, adopted_by
      ) VALUES (?, ?, 'event_work', ?, ?, ?)
    `).run(input.boardId, input.goalId, input.source, input.at, input.actorId);
    this.db.prepare(`
      INSERT OR IGNORE INTO goal_event_work_status (board_id, goal_id, work_status, updated_at)
      VALUES (?, ?, 'open', ?)
    `).run(input.boardId, input.goalId, input.at);
  }

  workStatus(boardId: string, goalId: string): GoalEventWorkStatus {
    const row = this.db.prepare(
      "SELECT work_status FROM goal_event_work_status WHERE board_id = ? AND goal_id = ?",
    ).get(boardId, goalId) as Row | undefined;
    return row ? rowText(row.work_status) as GoalEventWorkStatus : "open";
  }

  setWorkStatus(boardId: string, goalId: string, status: GoalEventWorkStatus, at: string): void {
    this.db.prepare(`
      INSERT INTO goal_event_work_status (board_id, goal_id, work_status, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(goal_id) DO UPDATE SET work_status = excluded.work_status, updated_at = excluded.updated_at
    `).run(boardId, goalId, status, at);
  }

  latestAgreement(boardId: string, goalId: string): { version: number; outcome: string; actor_id: string; created_at: string } | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_agreements
      WHERE board_id = ? AND goal_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      version: Number(row.version),
      outcome: rowText(row.outcome),
      actor_id: rowText(row.actor_id),
      created_at: rowText(row.created_at),
    };
  }

  insertAgreement(input: {
    boardId: string;
    goalId: string;
    version: number;
    outcome: string;
    actorId: string;
    at: string;
    eventId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_agreements (
        board_id, goal_id, version, outcome, actor_id, created_at, event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.boardId, input.goalId, input.version, input.outcome, input.actorId, input.at, input.eventId);
  }

  insertProgress(input: {
    summaryId: string;
    boardId: string;
    goalId: string;
    eventId: string;
    summary: string;
    basedOnCursor: number;
    nextStep: string | null;
    nextActor: string | null;
    actorId: string;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_progress_summaries (
        summary_id, board_id, goal_id, event_id, summary_text, based_on_cursor,
        next_step, next_actor, actor_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.summaryId, input.boardId, input.goalId, input.eventId, input.summary,
      input.basedOnCursor, input.nextStep, input.nextActor, input.actorId, input.at,
    );
  }

  latestProgress(boardId: string, goalId: string): Omit<GoalEventProgressSummaryView, "stale" | "stale_because_cursor"> | null {
    const row = this.db.prepare(`
      SELECT s.* FROM goal_event_progress_summaries s
      JOIN goal_work_events e ON e.event_id = s.event_id AND e.board_id = s.board_id AND e.goal_id = s.goal_id
      WHERE s.board_id = ? AND s.goal_id = ?
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      summary_id: rowText(row.summary_id),
      event_id: rowText(row.event_id),
      summary: rowText(row.summary_text),
      based_on_cursor: Number(row.based_on_cursor),
      next_step: row.next_step == null ? null : rowText(row.next_step),
      next_actor: row.next_actor == null ? null : rowText(row.next_actor),
      recorded_at: rowText(row.recorded_at),
      actor_id: rowText(row.actor_id),
    };
  }

  insertConcern(input: {
    concernId: string;
    boardId: string;
    goalId: string;
    eventId: string;
    title: string;
    statement: string;
    scope: GoalEventScope;
    blocksClosure: boolean;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_concerns (
        concern_id, board_id, goal_id, event_id, title, statement, scope_json,
        blocks_closure, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      input.concernId, input.boardId, input.goalId, input.eventId, input.title, input.statement,
      sqliteJson(input.scope), input.blocksClosure ? 1 : 0, input.at, input.at,
    );
  }

  getConcern(boardId: string, goalId: string, concernId: string): GoalEventConcernView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_concerns WHERE concern_id = ? AND board_id = ? AND goal_id = ?",
    ).get(concernId, boardId, goalId) as Row | undefined;
    return row ? mapConcern(row) : null;
  }

  updateConcern(input: {
    concernId: string;
    status: GoalEventConcernStatus;
    previousStatus: GoalEventConcernStatus;
    reason: string;
    resolutionEventId: string;
    citedDecisionId: string | null;
    at: string;
  }): void {
    this.db.prepare(`
      UPDATE goal_event_concerns SET
        status = ?, previous_status = ?, resolution_reason = ?,
        resolution_event_id = ?, cited_decision_id = ?, updated_at = ?
      WHERE concern_id = ?
    `).run(
      input.status, input.previousStatus, input.reason, input.resolutionEventId,
      input.citedDecisionId, input.at, input.concernId,
    );
  }

  listConcerns(boardId: string, goalId: string): GoalEventConcernView[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_concerns WHERE board_id = ? AND goal_id = ?
      ORDER BY created_at ASC, concern_id ASC
    `).all(boardId, goalId) as Row[]).map(mapConcern);
  }

  openBlockingConcerns(boardId: string, goalId: string): GoalEventConcernView[] {
    return this.listConcerns(boardId, goalId).filter((concern) =>
      concern.status === "open" && concern.blocks_closure);
  }

  insertDecisionRequest(input: {
    requestId: string;
    boardId: string;
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
        request_id, board_id, goal_id, event_id, question, options_json, scope_json,
        purpose, proposed_change_json, commitment_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      input.requestId, input.boardId, input.goalId, input.eventId, input.question,
      sqliteJson(input.options), sqliteJson(input.scope), input.purpose,
      input.proposedChange == null ? null : sqliteJson(input.proposedChange),
      input.commitment == null ? null : sqliteJson(input.commitment), input.at,
    );
  }

  getDecisionRequest(boardId: string, goalId: string, requestId: string): GoalEventDecisionRequestView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_decision_requests WHERE request_id = ? AND board_id = ? AND goal_id = ?",
    ).get(requestId, boardId, goalId) as Row | undefined;
    return row ? mapDecisionRequest(row) : null;
  }

  markRequestDecided(requestId: string): void {
    this.db.prepare("UPDATE goal_event_decision_requests SET status = 'decided' WHERE request_id = ?")
      .run(requestId);
  }

  listDecisionRequests(boardId: string, goalId: string): GoalEventDecisionRequestView[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_decision_requests WHERE board_id = ? AND goal_id = ?
      ORDER BY created_at ASC, request_id ASC
    `).all(boardId, goalId) as Row[]).map(mapDecisionRequest);
  }

  insertAppliedDecision(input: {
    decisionId: string;
    boardId: string;
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
        decision_id, board_id, goal_id, governance_decision_id, request_id, event_id,
        selected_option_id, conclusion, accepts_requirements, effects_json, scope_json,
        commitment_json, authorized_change_json, config_version, agreement_version, actor_id, authority_source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.decisionId, input.boardId, input.goalId, input.governanceDecisionId, input.requestId,
      input.eventId, input.selectedOptionId, input.conclusion, input.acceptsRequirements ? 1 : 0,
      sqliteJson(input.effects), sqliteJson(input.scope), sqliteJson(input.commitment),
      input.authorizedChange == null ? null : sqliteJson(input.authorizedChange),
      input.configVersion, input.agreementVersion, input.actorId, input.authoritySource, input.at,
    );
  }

  getAppliedDecision(boardId: string, goalId: string, decisionId: string): GoalEventAppliedDecisionView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_applied_decisions
      WHERE decision_id = ? AND board_id = ? AND goal_id = ?
    `).get(decisionId, boardId, goalId) as Row | undefined;
    return row ? mapAppliedDecision(row) : null;
  }

  getAppliedDecisionByGovernanceId(boardId: string, goalId: string, governanceDecisionId: string): GoalEventAppliedDecisionView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_applied_decisions
      WHERE governance_decision_id = ? AND board_id = ? AND goal_id = ?
    `).get(governanceDecisionId, boardId, goalId) as Row | undefined;
    return row ? mapAppliedDecision(row) : null;
  }

  listAppliedDecisions(boardId: string, goalId: string): GoalEventAppliedDecisionView[] {
    return (this.db.prepare(`
      SELECT d.* FROM goal_event_applied_decisions d
      JOIN goal_work_events e ON e.event_id = d.event_id AND e.board_id = d.board_id AND e.goal_id = d.goal_id
      WHERE d.board_id = ? AND d.goal_id = ?
      ORDER BY e.journal_seq ASC, d.decision_id ASC
    `).all(boardId, goalId) as Row[]).map(mapAppliedDecision);
  }

  insertConclusions(input: {
    boardId: string;
    goalId: string;
    requirementIds: string[];
    decisionId: string;
    actorId: string;
    verdict: "accepted" | "rejected";
    at: string;
    journalSeq: number;
  }): void {
    const insert = this.db.prepare(`
      INSERT INTO goal_event_requirement_conclusions (
        board_id, goal_id, requirement_id, decision_id, actor_id, verdict, received_at, journal_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const requirementId of input.requirementIds) {
      insert.run(
        input.boardId, input.goalId, requirementId, input.decisionId,
        input.actorId, input.verdict, input.at, input.journalSeq,
      );
    }
  }

  latestConclusions(boardId: string, goalId: string): Map<string, GoalEventUserConclusion> {
    const rows = this.db.prepare(`
      SELECT * FROM goal_event_requirement_conclusions
      WHERE board_id = ? AND goal_id = ?
      ORDER BY journal_seq DESC, decision_id DESC
    `).all(boardId, goalId) as Row[];
    const latest = new Map<string, GoalEventUserConclusion>();
    for (const row of rows) {
      const requirementId = rowText(row.requirement_id);
      if (latest.has(requirementId)) continue;
      latest.set(requirementId, {
        decision_id: rowText(row.decision_id),
        actor_id: rowText(row.actor_id),
        verdict: rowText(row.verdict) as GoalEventUserConclusion["verdict"],
        received_at: rowText(row.received_at),
        journal_seq: Number(row.journal_seq),
      });
    }
    return latest;
  }

  insertClosure(input: {
    closureId: string;
    boardId: string;
    goalId: string;
    eventId: string;
    kind: "complete" | "cancel";
    result: string | null;
    reason: string;
    completionApplied: boolean;
    expectedConfigVersion: number;
    expectedAgreementVersion: number;
    configVersion: number | null;
    agreementVersion: number | null;
    unmetReasons: GoalEventUnmetReason[];
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_closures (
        closure_id, board_id, goal_id, event_id, kind, result, reason, completion_applied,
        expected_config_version, expected_agreement_version, config_version, agreement_version,
        unmet_reasons_json, superseded, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      input.closureId, input.boardId, input.goalId, input.eventId, input.kind, input.result,
      input.reason, input.completionApplied ? 1 : 0, input.expectedConfigVersion,
      input.expectedAgreementVersion, input.configVersion, input.agreementVersion,
      sqliteJson(input.unmetReasons), input.at,
    );
  }

  latestImportedCompletion(boardId: string, goalId: string): GoalEventImportedCompletion | null {
    const row = this.db.prepare(`
      SELECT payload_json, received_at FROM goal_work_events
      WHERE board_id = ? AND goal_id = ? AND kind = 'system'
        AND payload_json LIKE '%"legacy_completion_imported"%'
      ORDER BY journal_seq DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    if (!row) return null;
    const payload = rowJson<Record<string, unknown>>(row.payload_json, {});
    return {
      source: "legacy_fulfillment",
      imported_at: rowText(row.received_at),
      label: "迁入的历史完成",
      historical: {
        journal_type: payload.journal_type == null ? null : String(payload.journal_type),
        journal_seq: payload.journal_seq == null ? null : Number(payload.journal_seq),
        journal_at: payload.journal_at == null ? null : String(payload.journal_at),
        evidence_ids: Array.isArray(payload.evidence_ids) ? payload.evidence_ids.map(String) : [],
        review_ids: Array.isArray(payload.review_ids) ? payload.review_ids.map(String) : [],
        contract_accepted_at: payload.contract_accepted_at == null ? null : String(payload.contract_accepted_at),
        contract_accepted_by: payload.contract_accepted_by == null ? null : String(payload.contract_accepted_by),
      },
    };
  }

  latestClosure(boardId: string, goalId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT c.* FROM goal_event_closures c
      JOIN goal_work_events e ON e.event_id = c.event_id AND e.board_id = c.board_id AND e.goal_id = c.goal_id
      WHERE c.board_id = ? AND c.goal_id = ?
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  currentAppliedClosure(boardId: string, goalId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT c.* FROM goal_event_closures c
      JOIN goal_work_events e ON e.event_id = c.event_id AND e.board_id = c.board_id AND e.goal_id = c.goal_id
      WHERE c.board_id = ? AND c.goal_id = ?
        AND c.completion_applied = 1 AND c.superseded = 0
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  closureByEventId(boardId: string, goalId: string, eventId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_closures WHERE event_id = ? AND board_id = ? AND goal_id = ?
    `).get(eventId, boardId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  supersedeAppliedClosures(boardId: string, goalId: string, reason: string): void {
    this.db.prepare(`
      UPDATE goal_event_closures SET superseded = 1, superseded_reason = ?
      WHERE board_id = ? AND goal_id = ? AND completion_applied = 1 AND superseded = 0
    `).run(reason, boardId, goalId);
  }

  setFulfillment(goalId: string, state: "unmet" | "satisfied", at: string): void {
    this.db.prepare("UPDATE goals SET fulfillment_state = ?, updated_at = ? WHERE goal_id = ?")
      .run(state, at, goalId);
  }
}

export function normalizeScope(raw?: Partial<GoalEventScope> | null): GoalEventScope {
  return {
    requirement_ids: uniqueStrings(raw?.requirement_ids),
    event_ids: uniqueStrings(raw?.event_ids),
    concern_ids: uniqueStrings(raw?.concern_ids),
    action: raw?.action?.trim() ? raw.action.trim() : null,
  };
}

export function scopeIsSubset(inner: GoalEventScope, outer: GoalEventScope): boolean {
  const outerRequirements = new Set(outer.requirement_ids);
  const outerEvents = new Set(outer.event_ids);
  const outerConcerns = new Set(outer.concern_ids);
  if (inner.requirement_ids.some((id) => !outerRequirements.has(id))) return false;
  if (inner.event_ids.some((id) => !outerEvents.has(id))) return false;
  if (inner.concern_ids.some((id) => !outerConcerns.has(id))) return false;
  if (inner.action && outer.action && inner.action !== outer.action) return false;
  if (inner.action && !outer.action && (outer.requirement_ids.length > 0 || outer.event_ids.length > 0 || outer.concern_ids.length > 0)) {
    return false;
  }
  return true;
}

export function emptyScope(scope: GoalEventScope): boolean {
  return scope.requirement_ids.length === 0
    && scope.event_ids.length === 0
    && scope.concern_ids.length === 0
    && !scope.action;
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function mapConcern(row: Row): GoalEventConcernView {
  return {
    concern_id: rowText(row.concern_id),
    event_id: rowText(row.event_id),
    title: rowText(row.title),
    statement: rowText(row.statement),
    scope: rowJson(row.scope_json, EMPTY_SCOPE),
    blocks_closure: Number(row.blocks_closure) === 1,
    status: rowText(row.status) as GoalEventConcernStatus,
    resolution_reason: row.resolution_reason == null ? null : rowText(row.resolution_reason),
    resolution_event_id: row.resolution_event_id == null ? null : rowText(row.resolution_event_id),
    cited_decision_id: row.cited_decision_id == null ? null : rowText(row.cited_decision_id),
    previous_status: row.previous_status == null ? null : rowText(row.previous_status) as GoalEventConcernStatus,
    created_at: rowText(row.created_at),
    updated_at: rowText(row.updated_at),
  };
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

function mapClosure(row: Row): GoalEventClosureView {
  return {
    closure_id: rowText(row.closure_id),
    event_id: rowText(row.event_id),
    kind: rowText(row.kind) as GoalEventClosureView["kind"],
    result: row.result == null ? null : rowText(row.result),
    reason: rowText(row.reason),
    recorded: true,
    completion_applied: Number(row.completion_applied) === 1,
    expected_config_version: Number(row.expected_config_version),
    expected_agreement_version: Number(row.expected_agreement_version ?? 0),
    config_version: row.config_version == null ? null : Number(row.config_version),
    agreement_version: row.agreement_version == null ? null : Number(row.agreement_version),
    unmet_reasons: rowJson(row.unmet_reasons_json, []),
    superseded: Number(row.superseded) === 1,
    superseded_reason: row.superseded_reason == null ? null : rowText(row.superseded_reason),
    recorded_at: rowText(row.recorded_at),
  };
}

export function agreementView(
  agreement: { version: number; outcome: string; actor_id: string; created_at: string } | null,
  requirementCount: number,
  goalOutcome: string,
): GoalEventAgreementView {
  const outcome = agreement?.outcome?.trim() || goalOutcome.trim();
  const missing: string[] = [];
  if (!outcome) missing.push("具体结果约定");
  if (requirementCount < 1) missing.push("至少一项有效结果要求");
  return {
    version: agreement?.version ?? 0,
    outcome,
    has_minimum_result_agreement: missing.length === 0,
    missing,
    updated_at: agreement?.created_at ?? null,
    updated_by: agreement?.actor_id ?? null,
  };
}
