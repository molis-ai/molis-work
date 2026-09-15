import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_FACTORS_UI_CONTRIBUTION_ID, type GoalsFactorsRenderer, type GoalsFactorsPrimitives } from "@molis-ai/molis-work-plugin-goals";
export function createGoalsFactorsWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
    return (primitives: GoalsFactorsPrimitives): GoalsFactorsRenderer => (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_FACTORS_UI_CONTRIBUTION_ID, surface: "factors", model: { args, primitives } } }).html;
}
