import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";

export interface GoalsSafetyItem {
  goal: { goal_id: string; title: string; archived_at: string | null; trashed_at?: string | null; priority: number; created_at: string };
  status: GoalPresentationState;
  display_status?: GoalDisplayStatus;
}
