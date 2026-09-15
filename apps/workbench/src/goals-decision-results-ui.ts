import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_DECISION_RESULTS_UI_CONTRIBUTION_ID, type GoalsDecisionResultsPrimitives, type GoalsDecisionView } from "@molis-ai/molis-work-plugin-goals";
export function createGoalsDecisionResultsWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsDecisionResultsPrimitives) => (view: GoalsDecisionView): string => host.mount({ slot, contribution: {
    contribution_id: GOALS_DECISION_RESULTS_UI_CONTRIBUTION_ID, surface: "recent", model: { view, primitives },
  } }).html;
}
