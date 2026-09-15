import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsProjectPolicyArguments } from "@molis-ai/molis-work-plugin-goals";
import { GOALS_POLICY_UI_CONTRIBUTION_ID, type GoalsPolicyUiPrimitives, type GoalsPolicyFormArguments, type GoalsPolicyEditorArguments, type GoalsPolicyCheckSummaryArguments } from "@molis-ai/molis-work-plugin-goals";

/** Workbench mounts the official Plugin; it owns no form markup or policy rules. */
export function createGoalsPolicyWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsPolicyUiPrimitives) => ({
    renderProjectPolicyDocument: (...args: GoalsProjectPolicyArguments): string => host.mount({
      slot, contribution: { contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID, surface: "project", model: { kind: "project", args, primitives } },
    }).html,
    renderProgressCheckSummary: (...args: GoalsPolicyCheckSummaryArguments): string => host.mount({
      slot, contribution: { contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID, surface: "check-summary", model: { kind: "check-summary", args, primitives } },
    }).html,
    renderPolicyForm: (...args: GoalsPolicyFormArguments): string => host.mount({
      slot, contribution: { contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID, surface: "form", model: { kind: "form", args, primitives } },
    }).html,
    renderPolicyEditor: (...args: GoalsPolicyEditorArguments): string => host.mount({
      slot, contribution: { contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID, surface: "editor", model: { kind: "editor", args, primitives } },
    }).html,
  });
}
