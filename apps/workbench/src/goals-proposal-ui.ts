import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_PROPOSAL_UI_CONTRIBUTION_ID, type GoalsProposalRenderer, type GoalsProposalUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsProposalWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsProposalUiPrimitives): GoalsProposalRenderer => ({
    renderGoalTreeProposalDecision: (proposal, view) => host.mount({ slot, contribution: {
      contribution_id: GOALS_PROPOSAL_UI_CONTRIBUTION_ID, surface: "decision", model: { proposal, view, primitives },
    } }).html,
  });
}
