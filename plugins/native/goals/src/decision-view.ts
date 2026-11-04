import type { GoalTreeProposalRecord } from "./contract/governance-collaboration.js";
import type { GoalRelationRecord } from "./contract/goals.js";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
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
/** The smallest shape of an item in a decision list: its goal, presentation state and, when it has one, display status. */
export interface GoalsDecisionItem {
  goal: { goal_id: string; title: string; archived_at: string | null; trashed_at?: string | null; priority: number; created_at: string };
  status: GoalPresentationState;
  display_status?: GoalDisplayStatus;
}
export interface GoalsDecisionView<T extends GoalsDecisionItem = GoalsDecisionItem> {
  goals: T[];
  archived_goals: T[];
  events: GoalsDecisionEvent[];
  snapshot: {
    goal_tree_proposals: GoalTreeProposalRecord[];
    relations: GoalRelationRecord[];
  };
}
export interface GoalsDecisionGroup<T extends GoalsDecisionItem = GoalsDecisionItem> {
  ownerGoalId: string | null;
  item: T | null;
  goalTreeProposals: GoalTreeProposalRecord[];
}
