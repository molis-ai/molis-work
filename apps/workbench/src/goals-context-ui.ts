import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_CONTEXT_UI_CONTRIBUTION_ID, type GoalsContextRenderer, type GoalsContextUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsContextWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsContextUiPrimitives): GoalsContextRenderer => ({
    renderAcceptanceSummary: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_CONTEXT_UI_CONTRIBUTION_ID, surface: "acceptance-summary", model: { kind: "acceptance-summary", args, primitives } } }).html,
    renderChildProgress: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_CONTEXT_UI_CONTRIBUTION_ID, surface: "child-progress", model: { kind: "child-progress", args, primitives } } }).html,
    renderContractCoverage: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_CONTEXT_UI_CONTRIBUTION_ID, surface: "contract-coverage", model: { kind: "contract-coverage", args, primitives } } }).html,
  });
}
