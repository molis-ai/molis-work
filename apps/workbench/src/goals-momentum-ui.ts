import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_MOMENTUM_UI_CONTRIBUTION_ID, type GoalsMomentumRenderer, type GoalsMomentumUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsMomentumWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsMomentumUiPrimitives): GoalsMomentumRenderer => ({
    renderGoalMomentum: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_MOMENTUM_UI_CONTRIBUTION_ID, surface: "momentum", model: { kind: "momentum", args, primitives } } }).html,
    renderMomentumPlaceholder: () => host.mount({ slot, contribution: { contribution_id: GOALS_MOMENTUM_UI_CONTRIBUTION_ID, surface: "placeholder", model: { kind: "placeholder", args: [], primitives } } }).html,
  });
}
