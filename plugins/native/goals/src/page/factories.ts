import {
  GOALS_CONTEXT_UI_CONTRIBUTION_ID, GOALS_CONTEXT_UI_SURFACES, type GoalsContextRenderer, type GoalsContextUiPrimitives,
  GOALS_DIALOGS_UI_CONTRIBUTION_ID, GOALS_DIALOGS_UI_SURFACES, type GoalsDialogsRenderer, type GoalsDialogPrimitives,
  GOALS_DOCUMENT_UI_CONTRIBUTION_ID, GOALS_DOCUMENT_UI_SURFACES, type GoalsDocumentRenderer, type GoalsDocumentUiPrimitives,
  GOALS_FACTORS_UI_CONTRIBUTION_ID, GOALS_FACTORS_UI_SURFACE, type GoalsFactorsRenderer, type GoalsFactorsPrimitives,
  GOALS_MOMENTUM_UI_CONTRIBUTION_ID, GOALS_MOMENTUM_UI_SURFACES, type GoalsMomentumRenderer, type GoalsMomentumUiPrimitives,
  GOALS_PLANNING_UI_CONTRIBUTION_ID, GOALS_PLANNING_UI_SURFACES, type GoalsPlanningRenderer, type GoalsPlanningPrimitives,
  GOALS_POLICY_UI_CONTRIBUTION_ID, GOALS_POLICY_UI_SURFACES, type GoalsPolicyRenderer, type GoalsPolicyUiPrimitives,
  GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES, type GoalsProposalRenderer, type GoalsProposalUiPrimitives,
  GOALS_RELATION_UI_CONTRIBUTION_ID, GOALS_RELATION_UI_SURFACES, type GoalsRelationRenderer, type GoalsRelationUiPrimitives,
  GOALS_STATUS_UI_CONTRIBUTION_ID, GOALS_STATUS_UI_SURFACES, type GoalsStatusRenderer, type GoalsStatusPrimitives,
  GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_TREE_UI_SURFACES, type GoalsTreeRenderer, type GoalsTreeUiPrimitives,
} from "../index.js";
import type { MountSurface } from "./ports.js";
import { surfaceRenderer, surfaceRenderers } from "./surfaces.js";

/** Goals' own contributions as renderers: each method mounts its surface where the contribution declares it. */
export function createGoalsRendererFactories(mount: MountSurface) {
  return {
    proposal: surfaceRenderers<GoalsProposalRenderer, GoalsProposalUiPrimitives>(mount, GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES),
    policy: surfaceRenderers<GoalsPolicyRenderer, GoalsPolicyUiPrimitives>(mount, GOALS_POLICY_UI_CONTRIBUTION_ID, GOALS_POLICY_UI_SURFACES),
    relation: surfaceRenderers<GoalsRelationRenderer, GoalsRelationUiPrimitives>(mount, GOALS_RELATION_UI_CONTRIBUTION_ID, GOALS_RELATION_UI_SURFACES),
    tree: surfaceRenderers<GoalsTreeRenderer, GoalsTreeUiPrimitives>(mount, GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_TREE_UI_SURFACES),
    momentum: surfaceRenderers<GoalsMomentumRenderer, GoalsMomentumUiPrimitives>(mount, GOALS_MOMENTUM_UI_CONTRIBUTION_ID, GOALS_MOMENTUM_UI_SURFACES),
    document: surfaceRenderers<GoalsDocumentRenderer, GoalsDocumentUiPrimitives>(mount, GOALS_DOCUMENT_UI_CONTRIBUTION_ID, GOALS_DOCUMENT_UI_SURFACES),
    context: surfaceRenderers<GoalsContextRenderer, GoalsContextUiPrimitives>(mount, GOALS_CONTEXT_UI_CONTRIBUTION_ID, GOALS_CONTEXT_UI_SURFACES),
    planning: surfaceRenderers<GoalsPlanningRenderer, GoalsPlanningPrimitives>(mount, GOALS_PLANNING_UI_CONTRIBUTION_ID, GOALS_PLANNING_UI_SURFACES),
    status: surfaceRenderers<GoalsStatusRenderer, GoalsStatusPrimitives>(mount, GOALS_STATUS_UI_CONTRIBUTION_ID, GOALS_STATUS_UI_SURFACES),
    factors: surfaceRenderer<GoalsFactorsRenderer, GoalsFactorsPrimitives>(mount, GOALS_FACTORS_UI_CONTRIBUTION_ID, GOALS_FACTORS_UI_SURFACE),
    dialogs: surfaceRenderers<GoalsDialogsRenderer, GoalsDialogPrimitives>(mount, GOALS_DIALOGS_UI_CONTRIBUTION_ID, GOALS_DIALOGS_UI_SURFACES),
  };
}
export type GoalsRendererFactories = ReturnType<typeof createGoalsRendererFactories>;
