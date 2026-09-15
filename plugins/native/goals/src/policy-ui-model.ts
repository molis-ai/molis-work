import type { GoalPolicy } from "@molis-ai/molis-work-contracts/modules/goals";

/** Existing Web projection; its legacy scope strings are not Module binding scopes. */
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
}

export interface GoalsPolicyUiPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: "chevron-down" | "target" | "database" | "shield" | "history" | "arrow" | "folder"): string;
  currentLocale(): "zh" | "en";
  defaultPolicy: GoalPolicy;
}

/** Prefills editable fields only; resolved_policy from the Module remains authoritative. */
export function mergeGoalPolicyFormValues(base: GoalPolicy, binding?: GoalsPolicyBinding): GoalPolicy {
  const policy = binding?.policy ?? {};
  return {
    ...base,
    ...policy,
    required_capabilities: policy.required_capabilities == null
      ? [...base.required_capabilities]
      : [...policy.required_capabilities],
  };
}
