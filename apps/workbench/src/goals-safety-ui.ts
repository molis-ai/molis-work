import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_SAFETY_UI_CONTRIBUTION_ID, type GoalsSafetyRenderer, type GoalsSafetyUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsSafetyWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsSafetyUiPrimitives): GoalsSafetyRenderer => ({
    renderRiskDecision: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_SAFETY_UI_CONTRIBUTION_ID, surface: "risk-decision", model: { kind: "risk-decision", args, primitives } } }).html,
    renderRiskWorkbench: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_SAFETY_UI_CONTRIBUTION_ID, surface: "risk", model: { kind: "risk", args, primitives } } }).html,
    renderImpactWorkbench: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_SAFETY_UI_CONTRIBUTION_ID, surface: "impact", model: { kind: "impact", args, primitives } } }).html,
  });
}
