import type { SessionHandoffGoalContext } from "@molis-ai/molis-work-plugin-work";
import type { GoalProjectApplication } from "./fixtures/goal-application.js";
import { GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";

type SqlDatabase = {
  prepare(sql: string): { run(...params: unknown[]): unknown };
};

/** Seed the platform projection of a v3 historical binding. The original columns are checked in the upgrade tests. */
export function insertHistoricalPolicy(
  db: SqlDatabase,
  input: {
    policy_binding_id: string;
    project_id: string;
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
  const owner = { kind: "plugin", plugin_id: GOALS_PLUGIN_ID, publisher_signature: goalsManifest.publisher.signature };
  const scope = input.goal_id ? { kind: input.scope === "ancestor_minimum" ? "ancestor_minimum" : "object", owner,
    subject: { kind: "goal", id: input.goal_id } } : { kind: "project_default", owner };
  const policy = (input.policy_json === undefined ? input.policy : JSON.parse(input.policy_json)) as { human_approval?: boolean };
  db.prepare(`INSERT INTO project_approval_rules (id, project_id, scope_json, requires_person, state, created_by, reason, created_at, rule_order, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(rule_order),0)+1 FROM project_approval_rules WHERE project_id=?), 1)`)
    .run(input.policy_binding_id, input.project_id, JSON.stringify(scope), typeof policy.human_approval === "boolean" ? Number(policy.human_approval) : null,
    input.state ?? "active",
    input.created_by ?? "original-user",
    input.reason ?? "historical policy",
    input.created_at ?? "2026-09-01T00:00:00.000Z",
    input.project_id,
  );
}

/** Same current/history assembly Host uses for Session Handoff. */
export function sessionHandoffGoalContext(
  app: GoalProjectApplication,
  projectId: string,
  goalId: string,
): SessionHandoffGoalContext {
  const history = app.goalQueries.readGoalContract(projectId, goalId);
  const event_work = app.goalEvents.isEventStateOwner(projectId, goalId);
  const state = event_work ? app.goalEvents.readState(projectId, goalId) : null;
  return {
    board: history.board,
    goal: history.goal,
    goal_event_cursor: app.goalEvents.readState(projectId, goalId).goal_event_cursor,
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
