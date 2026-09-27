import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { SessionHandoffGoalContext } from "@molis-ai/molis-work-plugin-work";

/** What a Session handoff carries about its Goal, read through the Goals actions with the caller's own authority. */
export async function readWorkGoalContract(goals: BoundActionClient, goalId: string): Promise<SessionHandoffGoalContext> {
  const [history, currentState] = await Promise.all([goals.invoke(goalsActions.contract, { goal_id: goalId }), goals.invoke(goalsActions.state, { goal_id: goalId })]);
  const event_work = currentState.owner !== null;
  const state = event_work ? currentState : null;
  return {
    board: history.board, goal: history.goal, runs: history.runs, evidence: history.evidence, risks: history.risks, event_work,
    event_facts: state ? {
      work_status: state.work_status, outcome: state.agreement.outcome, next_step: state.progress_summary?.next_step ?? null,
      pending_decisions: state.pending_decisions.map((item) => item.question), current_decisions: state.current_decisions.map((item) => item.conclusion),
      gaps: state.gaps.map((item) => item.statement), requirements: state.requirements.map((item) => item.statement),
      stale_summary: state.progress_summary?.stale === true, resume_required: state.work_status === "completed" || state.work_status === "cancelled",
      closure_reason: state.closure?.reason ?? null,
    } : null,
  } as SessionHandoffGoalContext;
}
