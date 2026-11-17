import { createGoalsDocuments } from "./documents.js";
import { createGoalsRendererFactories } from "./factories.js";
import { createGoalsRenderers } from "./renderers.js";
import type { GoalsPagePorts } from "./ports.js";
import type { GoalsPageView } from "./view.js";

export { renderGoalsPageRequest, renderGoalsReadRequest, renderGoalsReadRoute, type GoalsPageSelection, type GoalsReadRenderers } from "./routes.js";
export { createGoalsFragmentRenderer, type GoalsFragmentRenderers } from "./fragments.js";
export { createProjectGuidanceDocumentRenderer } from "./guidance-document.js";
export { renderGoalDetailsAside, renderImmersiveGoalHeader, renderImmersiveWorkTabs, type GoalChromePrimitives } from "./chrome.js";
export { renderGoalFrameStage } from "./frame-stage.js";
export { createGoalsRendererFactories, type GoalsRendererFactories } from "./factories.js";
export { surfaceRenderer, surfaceRenderers, type SurfaceCallModel } from "./surfaces.js";
export type { GoalsHintOptions, GoalsPagePorts, GoalsTerminalPaneModel, GoalsTranslate, MountSurface } from "./ports.js";
export type { GoalsPageView } from "./view.js";
export type { GoalsStageData } from "../stage-action.js";
export type { GoalInputsCreatableKind } from "./inputs.js";

/**
 * The Goals page's drawing, the parts the shell used to hold for Goals: the Goal document with its fragments, dialogs and
 * terminal pane, and the owners' renderers it is made of (T-116). The workbench gives only what Goals does not own (`ports`).
 */
export function createGoalsPage<TView extends GoalsPageView>(ports: GoalsPagePorts<TView>) {
  const factories = createGoalsRendererFactories(ports.mount);
  const goals = createGoalsRenderers<TView>(ports, factories);
  const documents = createGoalsDocuments<TView>({ ...ports, goals }, factories);
  return { goals, documents };
}

export { createGoalsCapsuleProjection } from "./capsule.js";
export type { CapsuleGoalItem, CapsuleSnapshot, CapsuleState, CapsuleStateKind, CapsuleTab, CapsuleTabKind } from "./capsule-view.js";
