import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_RELATION_UI_CONTRIBUTION_ID, type GoalsRelationRenderer, type GoalsRelationUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

/** Only mount the Plugin's public contribution; trusted history HTML comes from its separate owner. */
export function createGoalsRelationWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsRelationUiPrimitives): GoalsRelationRenderer => ({
    renderRelations: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_RELATION_UI_CONTRIBUTION_ID, surface: "relations", model: { kind: "relations", args, primitives } } }).html,
    renderRelationForm: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_RELATION_UI_CONTRIBUTION_ID, surface: "form", model: { kind: "form", args, primitives } } }).html,
  });
}
