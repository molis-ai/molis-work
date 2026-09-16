import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { GOALS_TREE_UI_CONTRIBUTION_ID, type GoalsTreeRenderer, type GoalsTreeUiPrimitives } from "@molis-ai/molis-work-plugin-goals";

/** Mount the public directory contribution; no Goal traversal or status rules live here. */
export function createGoalsTreeWorkbenchRenderer(host: UiHostApi, slot: UiSlotDescriptor) {
  return (primitives: GoalsTreeUiPrimitives): GoalsTreeRenderer => ({
    renderGoalRootEntry: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "root-entry", model: { kind: "root-entry", args, primitives } } }).html,
    renderGoalDirectory: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "directory", model: { kind: "directory", args, primitives } } }).html,
    renderGoalRefreshDirectory: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "refresh", model: { kind: "refresh", args, primitives } } }).html,
    renderGoalStageList: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "stage-list", model: { kind: "stage-list", args, primitives } } }).html,
    renderGoalTree: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "tree", model: { kind: "tree", args, primitives } } }).html,
    renderTreeChrome: (...args) => host.mount({ slot, contribution: { contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, surface: "chrome", model: { kind: "chrome", args, primitives } } }).html,
  });
}
