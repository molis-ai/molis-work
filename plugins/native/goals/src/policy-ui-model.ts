import type { GoalEventStateView, GoalPolicy } from "./contract/goals.js";

export interface GoalsPolicyItem {
  goal: { goal_id: string };
  resolved_policy: GoalPolicy;
  event_document?: { state: Pick<GoalEventStateView, "requirements"> } | null;
}

export interface GoalsPolicyUiPrimitives {
  escapeHtml(value: unknown): string;
  icon(name: "shield" | "folder"): string;
}
