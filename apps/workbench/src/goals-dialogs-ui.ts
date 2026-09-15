import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_DIALOGS_UI_CONTRIBUTION_ID, type GoalsDialogsRenderer, type GoalsDialogPrimitives } from "@molis-ai/molis-work-plugin-goals";
export function createGoalsDialogsWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
    return (primitives: GoalsDialogPrimitives): GoalsDialogsRenderer => ({
        renderCreateDialog: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DIALOGS_UI_CONTRIBUTION_ID, surface: "create", model: { kind: "create", args, primitives } } }).html,
        renderGoalTrashDialog: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DIALOGS_UI_CONTRIBUTION_ID, surface: "trash", model: { kind: "trash", args, primitives } } }).html,
    });
}
