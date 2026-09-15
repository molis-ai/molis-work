import type { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import type { SessionHandoffGoalContext } from "@molis-ai/molis-work-plugin-work";

type SqlDatabase = {
  prepare(sql: string): { run(...params: unknown[]): unknown };
};

const DEFAULT_POLICY_JSON = JSON.stringify({
  goal_mode: "preferred",
  required_capabilities: [],
  self_verification: true,
  cross_reviewers: 0,
  adversarial_reviewers: 0,
  human_approval: false,
  max_lease_seconds: 1800,
});

/** Temporary historical Claim row. Production Claim writers are retired. */
export function insertHistoricalClaim(
  db: SqlDatabase,
  input: {
    claim_id: string;
    board_id: string;
    goal_id: string;
    actor_id: string;
    role?: string;
    state?: string;
    claimed_at?: string;
    expires_at?: string;
    released_at?: string | null;
    release_reason?: string | null;
    contract_revision?: number;
    action_kind?: string | null;
    action_target_id?: string | null;
    resolved_policy_json?: string;
  },
): void {
  db.prepare(`
    INSERT INTO claims (
      claim_id, board_id, goal_id, actor_id, role, contract_revision, action_kind, action_target_id,
      state, capabilities_json, goal_mode_attestation, resolved_policy_json, claimed_at, expires_at,
      renewed_at, released_at, release_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, ?, NULL, ?, ?)
  `).run(
    input.claim_id,
    input.board_id,
    input.goal_id,
    input.actor_id,
    input.role ?? "executor",
    input.contract_revision ?? 1,
    input.action_kind ?? "execute",
    input.action_target_id ?? input.goal_id,
    input.state ?? "released",
    input.resolved_policy_json ?? DEFAULT_POLICY_JSON,
    input.claimed_at ?? "2026-09-02T00:00:00.000Z",
    input.expires_at ?? "2026-09-02T00:30:00.000Z",
    input.released_at === undefined ? "2026-09-02T00:02:00.000Z" : input.released_at,
    input.release_reason === undefined ? "historical fixture" : input.release_reason,
  );
}

/** Temporary historical Run row. Production Run writers are retired. */
export function insertHistoricalRun(
  db: SqlDatabase,
  input: {
    run_id: string;
    board_id: string;
    goal_id: string;
    claim_id: string;
    actor_id: string;
    role?: string;
    state?: string;
    started_at?: string;
    ended_at?: string | null;
    block_reason?: string | null;
    output_refs_json?: string;
  },
): void {
  db.prepare(`
    INSERT INTO runs (
      run_id, board_id, goal_id, claim_id, actor_id, role, state, block_reason,
      output_refs_json, discovery_refs_json, started_at, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
  `).run(
    input.run_id,
    input.board_id,
    input.goal_id,
    input.claim_id,
    input.actor_id,
    input.role ?? "executor",
    input.state ?? "started",
    input.block_reason ?? null,
    input.output_refs_json ?? "[]",
    input.started_at ?? "2026-09-02T00:00:01.000Z",
    input.ended_at === undefined ? null : input.ended_at,
  );
}

/** Temporary historical Evidence row. Production Evidence writers are retired. */
export function insertHistoricalEvidence(
  db: SqlDatabase,
  input: {
    evidence_id: string;
    board_id: string;
    goal_id: string;
    producer_actor_id: string;
    kind?: string;
    locator: string;
    result?: string;
    criterion_ids?: readonly string[];
    run_id?: string | null;
    locator_status?: string;
    locator_validation_reason?: string;
    locator_checked_at?: string | null;
    locator_workspace_id?: string | null;
    locator_workspace_root?: string | null;
    digest?: string | null;
    captured_at?: string;
    contract_revision?: number;
  },
): void {
  db.prepare(`
    INSERT INTO evidence (
      evidence_id, board_id, goal_id, contract_revision, criterion_ids_json, producer_actor_id,
      run_id, review_id, kind, locator, locator_status, locator_validation_reason, locator_checked_at,
      locator_workspace_id, locator_workspace_root, digest, captured_at, result, historical_unmapped
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    input.evidence_id,
    input.board_id,
    input.goal_id,
    input.contract_revision ?? 1,
    JSON.stringify(input.criterion_ids ?? []),
    input.producer_actor_id,
    input.run_id ?? null,
    input.kind ?? "artifact",
    input.locator,
    input.locator_status ?? "unverified",
    input.locator_validation_reason ?? "历史 Evidence 未进行 locator 预检",
    input.locator_checked_at ?? null,
    input.locator_workspace_id ?? null,
    input.locator_workspace_root ?? null,
    input.digest ?? null,
    input.captured_at ?? "2026-09-02T00:00:02.000Z",
    input.result ?? "inconclusive",
  );
}

/** Temporary historical Risk row plus Goal links. Production Risk writers are retired. */
export function insertHistoricalRisk(
  db: SqlDatabase,
  input: {
    risk_id: string;
    board_id: string;
    goal_ids: readonly string[];
    description: string;
    probability?: string;
    impact?: string;
    trigger?: string;
    treatment?: string;
    treatment_plan?: string;
    blocking_mode?: string;
    revisit_condition?: string;
    owner?: string;
    state?: string;
    affected_surfaces?: readonly string[];
    created_at?: string;
  },
): void {
  const at = input.created_at ?? "2026-09-01T01:00:00.000Z";
  db.prepare(`
    INSERT INTO risks (
      risk_id, board_id, description, probability, impact, affected_surfaces_json, trigger, treatment,
      treatment_plan, blocking_mode, revisit_condition, owner, state, resolution_basis_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    input.risk_id,
    input.board_id,
    input.description,
    input.probability ?? "low",
    input.impact ?? "high",
    JSON.stringify(input.affected_surfaces ?? []),
    input.trigger ?? "fixture condition",
    input.treatment ?? "mitigate",
    input.treatment_plan ?? "",
    input.blocking_mode ?? "none",
    input.revisit_condition ?? "",
    input.owner ?? "runtime",
    input.state ?? "open",
    at,
    at,
  );
  const link = db.prepare("INSERT INTO goal_risks (goal_id, risk_id) VALUES (?, ?)");
  for (const goalId of input.goal_ids) link.run(goalId, input.risk_id);
}

/** Temporary historical Policy binding. Production Policy writers are retired. */
export function insertHistoricalPolicy(
  db: SqlDatabase,
  input: {
    policy_binding_id: string;
    board_id: string;
    goal_id?: string | null;
    scope?: string;
    policy: unknown;
    policy_json?: string;
    state?: string;
    created_by?: string;
    reason?: string;
    created_at?: string;
  },
): void {
  db.prepare(`
    INSERT INTO policy_bindings (
      policy_binding_id, board_id, goal_id, scope, policy_json, state, created_by, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.policy_binding_id,
    input.board_id,
    input.goal_id ?? null,
    input.scope ?? "project_default",
    input.policy_json ?? JSON.stringify(input.policy),
    input.state ?? "active",
    input.created_by ?? "original-user",
    input.reason ?? "historical policy",
    input.created_at ?? "2026-09-01T00:00:00.000Z",
  );
}

/** Temporary historical clarification session for migration 12. Production dialogue writers are retired. */
export function insertHistoricalClarificationSession(
  db: SqlDatabase,
  input: {
    session_id: string;
    board_id: string;
    goal_id: string;
    claim_id?: string | null;
    run_id?: string | null;
    rough_idea?: string;
    state?: string;
    created_by?: string;
    created_at?: string;
  },
): void {
  const at = input.created_at ?? "2026-08-15T00:00:00.000Z";
  db.prepare(`
    INSERT INTO clarification_sessions (
      session_id, board_id, goal_id, claim_id, run_id, rough_idea, state, current_understanding,
      next_question, proposal_summary, created_by, created_at, updated_at, closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, NULL)
  `).run(
    input.session_id,
    input.board_id,
    input.goal_id,
    input.claim_id ?? null,
    input.run_id ?? null,
    input.rough_idea ?? "historical clarification fixture",
    input.state ?? "proposal_ready",
    input.created_by ?? "runtime-migration",
    at,
    at,
  );
}

/** Temporary historical clarification turn. Production dialogue writers are retired. */
export function insertHistoricalClarificationTurn(
  db: SqlDatabase,
  input: {
    turn_id: string;
    session_id: string;
    board_id: string;
    goal_id: string;
    actor_id?: string;
    turn_index?: number;
    turn_kind?: string;
    user_message: string;
    run_id?: string | null;
    created_at?: string;
  },
): void {
  const at = input.created_at ?? "2026-08-15T00:00:00.000Z";
  db.prepare(`
    INSERT INTO clarification_turns (
      turn_id, session_id, board_id, goal_id, run_id, actor_id, turn_index, turn_kind,
      user_message, current_understanding, known_facts_json, assumptions_json,
      next_question, proposal_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', NULL, NULL, ?)
  `).run(
    input.turn_id,
    input.session_id,
    input.board_id,
    input.goal_id,
    input.run_id ?? null,
    input.actor_id ?? "runtime-migration",
    input.turn_index ?? 1,
    input.turn_kind ?? "rough_idea",
    input.user_message,
    at,
  );
}

/** Temporary historical Evidence correction. Production correction writers are retired. */
export function insertHistoricalEvidenceCorrection(
  db: SqlDatabase,
  input: {
    correction_id: string;
    board_id: string;
    goal_id: string;
    target_evidence_id: string;
    action: "supersede" | "retract";
    replacement_evidence_id?: string | null;
    actor_id?: string;
    reason?: string;
    created_at?: string;
  },
): void {
  db.prepare(`
    INSERT INTO evidence_corrections (
      correction_id, board_id, goal_id, target_evidence_id, action, replacement_evidence_id,
      actor_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.correction_id,
    input.board_id,
    input.goal_id,
    input.target_evidence_id,
    input.action,
    input.replacement_evidence_id ?? null,
    input.actor_id ?? "runtime-history",
    input.reason ?? "historical correction fixture",
    input.created_at ?? "2026-09-02T00:00:03.000Z",
  );
}

/** Same current/history assembly Host uses for Session Handoff. */
export function sessionHandoffGoalContext(
  app: GoalProjectApplication,
  boardId: string,
  goalId: string,
): SessionHandoffGoalContext {
  const history = app.goalQueries.readGoalContract(boardId, goalId);
  const event_work = app.goalEvents.isEventStateOwner(boardId, goalId);
  const state = event_work ? app.goalEvents.readState(boardId, goalId) : null;
  return {
    board: history.board,
    goal: history.goal,
    runs: history.runs,
    evidence: history.evidence,
    risks: history.risks,
    event_work,
    event_facts: state
      ? {
          work_status: state.work_status,
          outcome: state.agreement.outcome,
          next_step: state.progress_summary?.next_step ?? null,
          pending_decisions: state.pending_decisions.map((item) => item.question),
          current_decisions: state.current_decisions.map((item) => item.conclusion),
          gaps: state.gaps.map((item) => item.statement),
          requirements: state.requirements.map((item) => item.statement),
          stale_summary: state.progress_summary?.stale === true,
          resume_required: state.work_status === "completed" || state.work_status === "cancelled",
          closure_reason: state.closure?.reason ?? null,
        }
      : null,
  };
}
