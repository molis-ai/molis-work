import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsSafetyItem } from "./safety-ui-model.js";
export interface GoalsDecisionEvent {
  seq: number;
  event_id: string;
  actor_id: string;
  type: string;
  object_type: string;
  object_id: string;
  reason: string;
  payload: unknown;
  at: string;
}
/** A closure counts as completion only when it applied; a saved report with unmet requirements did not. */
export function isAppliedGoalCompletion(event: Pick<GoalsDecisionEvent, "type"> & { payload?: unknown }): boolean {
  if (event.type !== "goal.event_state.closure_submitted") return false;
  const payload = event.payload;
  return typeof payload === "object" && payload !== null && (payload as { completion_applied?: unknown }).completion_applied === true;
}
export interface GoalsDecisionView<T extends GoalsSafetyItem = GoalsSafetyItem> {
  goals: T[];
  archived_goals: T[];
  events: GoalsDecisionEvent[];
  snapshot: {
    goal_tree_proposals: GoalTreeProposalRecord[];
    relations: GoalRelationRecord[];
  };
}
export interface GoalsDecisionGroup<T extends GoalsSafetyItem = GoalsSafetyItem> {
  ownerGoalId: string | null;
  item: T | null;
  goalTreeProposals: GoalTreeProposalRecord[];
}
