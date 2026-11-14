import type { GoalEventStateView, GoalPolicy } from "./contract/goals.js";

/** The Web projection of a rule binding; its scope strings are the page's, not the Module's binding scopes. */
export interface GoalsPolicyBinding {
  policy_binding_id: string;
  goal_id: string | null;
  scope: string;
  policy: Partial<GoalPolicy>;
  state: string;
  created_by: string;
  reason: string;
  created_at: string;
}

export interface GoalsPolicyItem {
  goal: { goal_id: string };
  policy_bindings: GoalsPolicyBinding[];
  resolved_policy: GoalPolicy;
  event_document?: { state: Pick<GoalEventStateView, "requirements"> } | null;
}

export interface GoalsPolicyUiPrimitives {
  escapeHtml(value: unknown): string;
  icon(name: "shield" | "folder"): string;
}
