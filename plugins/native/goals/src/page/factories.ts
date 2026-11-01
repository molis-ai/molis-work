import { GOALS_CONTEXT_UI_CONTRIBUTION_ID, GOALS_CONTEXT_UI_SURFACES, type GoalsContextRenderer } from "../context-ui.js";
import type { GoalsContextUiPrimitives } from "../context-ui-model.js";
import { GOALS_DIALOGS_UI_CONTRIBUTION_ID, GOALS_DIALOGS_UI_SURFACES, type GoalsDialogsRenderer, type GoalsDialogPrimitives } from "../dialogs-ui.js";
import { GOALS_DOCUMENT_UI_CONTRIBUTION_ID, GOALS_DOCUMENT_UI_SURFACES, type GoalsDocumentRenderer } from "../document-ui.js";
import type { GoalsDocumentUiPrimitives } from "../document-ui-model.js";
import { GOALS_FACTORS_UI_CONTRIBUTION_ID, GOALS_FACTORS_UI_SURFACE, type GoalsFactorsRenderer, type GoalsFactorsPrimitives } from "../factors-ui.js";
import { GOALS_MOMENTUM_UI_CONTRIBUTION_ID, GOALS_MOMENTUM_UI_SURFACES, type GoalsMomentumRenderer } from "../momentum-ui.js";
import type { GoalsMomentumUiPrimitives } from "../momentum-ui-model.js";
import { GOALS_PLANNING_UI_CONTRIBUTION_ID, GOALS_PLANNING_UI_SURFACES, type GoalsPlanningRenderer } from "../planning-ui.js";
import type { GoalsPlanningPrimitives } from "../planning-ui-model.js";
import { GOALS_POLICY_UI_CONTRIBUTION_ID, GOALS_POLICY_UI_SURFACES, type GoalsPolicyRenderer } from "../policy-ui.js";
import type { GoalsPolicyUiPrimitives } from "../policy-ui-model.js";
import { GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES, type GoalsProposalRenderer } from "../proposal-ui.js";
import type { GoalsProposalUiPrimitives } from "../proposal-ui-model.js";
import { GOALS_RELATION_UI_CONTRIBUTION_ID, GOALS_RELATION_UI_SURFACES, type GoalsRelationRenderer } from "../relation-ui.js";
import type { GoalsRelationUiPrimitives } from "../relation-ui-model.js";
import { GOALS_STATUS_UI_CONTRIBUTION_ID, GOALS_STATUS_UI_SURFACES, type GoalsStatusRenderer, type GoalsStatusPrimitives } from "../status-ui.js";
import { GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_TREE_UI_SURFACES, type GoalsTreeRenderer } from "../tree-ui.js";
import type { GoalsTreeUiPrimitives } from "../tree-ui-model.js";
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
