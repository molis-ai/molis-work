import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_PLANNING_UI_CONTRIBUTION_ID, type GoalsPlanningRenderer, type GoalsPlanningPrimitives } from "@molis-ai/molis-work-plugin-goals";

export function createGoalsPlanningWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsPlanningPrimitives): GoalsPlanningRenderer => ({
    renderLibrary: (...args) => host.mount({slot, contribution: {contribution_id: GOALS_PLANNING_UI_CONTRIBUTION_ID, surface: "library", model: {kind: "library", args, primitives}}}).html,
    renderMethod: (...args) => host.mount({slot, contribution: {contribution_id: GOALS_PLANNING_UI_CONTRIBUTION_ID, surface: "method", model: {kind: "method", args, primitives}}}).html,
    renderProject: (...args) => host.mount({slot, contribution: {contribution_id: GOALS_PLANNING_UI_CONTRIBUTION_ID, surface: "project", model: {kind: "project", args, primitives}}}).html,
  });
}
