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
