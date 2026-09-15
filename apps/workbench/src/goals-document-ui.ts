import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_DOCUMENT_UI_CONTRIBUTION_ID, type GoalsDocumentRenderer, type GoalsDocumentUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsDocumentWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsDocumentUiPrimitives): GoalsDocumentRenderer => ({
    renderGoalDocument: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, surface: "document", model: { kind: "document", args, primitives } } }).html,
    renderTrashGoalDocument: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, surface: "trash", model: { kind: "trash", args, primitives } } }).html,
    renderInitialGoalTab: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, surface: "initial-tab", model: { kind: "initial-tab", args, primitives } } }).html,
    renderEmptyGoalCollection: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, surface: "empty-collection", model: { kind: "empty-collection", args, primitives } } }).html,
  });
}
