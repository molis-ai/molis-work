import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_STATUS_UI_CONTRIBUTION_ID, type GoalsStatusRenderer, type GoalsStatusPrimitives } from "@molis-ai/molis-work-plugin-goals";
export function createGoalsStatusWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
    return (primitives: GoalsStatusPrimitives): GoalsStatusRenderer => ({
        renderStatus: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, surface: "status", model: { kind: "status", args, primitives } } }).html,
        renderActionStatus: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, surface: "action", model: { kind: "action", args, primitives } } }).html,
        renderVisibleGoalStatus: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, surface: "visible", model: { kind: "visible", args, primitives } } }).html,
        visibleGoalStatusIcon: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_STATUS_UI_CONTRIBUTION_ID, surface: "icon", model: { kind: "icon", args, primitives } } }).html,
    });
}
