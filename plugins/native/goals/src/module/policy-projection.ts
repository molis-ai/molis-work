import type { ProjectApprovalRule } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { GoalPolicyBindingRecord, GoalPolicyHistoryRecord } from "../contract/goals.js";

export type GoalApprovalRules = (projectId: string, history: boolean) => readonly ProjectApprovalRule[];

function applies(rule: ProjectApprovalRule): boolean {
  return rule.scope.kind === "project_default" || rule.scope.subject.kind === "goal";
}

export function goalApprovalBindings(rules: readonly ProjectApprovalRule[], goalId?: string): GoalPolicyBindingRecord[] {
  const active = rules.filter(rule => rule.state === "active" && applies(rule));
  const defaults = active.filter(rule => rule.scope.kind === "project_default" && rule.requires_person !== null);
  const project = defaults.filter(rule => rule.scope.owner === undefined).at(-1);
  const original = defaults.filter(rule => rule.scope.owner !== undefined).at(-1);
  const defaultPolicy = project || original ? [{
    scope: "project_default" as const, goal_id: null,
    policy: { human_approval: project?.requires_person === true || original?.requires_person === true },
  }] : [];
  return [...defaultPolicy, ...active.flatMap<GoalPolicyBindingRecord>(({ scope, requires_person }) => {
    if (scope.kind === "project_default" || goalId !== undefined && scope.subject.id !== goalId) return [];
    return [{ scope: scope.kind === "object" ? "goal_override" : "ancestor_minimum", goal_id: scope.subject.id,
      policy: requires_person === null ? {} : { human_approval: requires_person } }];
  })];
}

export function goalApprovalHistory(rules: readonly ProjectApprovalRule[]): GoalPolicyHistoryRecord[] {
  return rules.filter(applies).map(({ id, scope, requires_person, state, created_by, reason, created_at }) => ({
    policy_binding_id: id, scope: scope.kind === "object" ? "goal" : scope.kind,
    goal_id: scope.kind === "project_default" ? null : scope.subject.id,
    policy: requires_person === null ? {} : { human_approval: requires_person }, state, created_by, reason, created_at,
  }));
}
