import type { UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, type ArtifactReferenceUiPrimitives } from "@molis-ai/molis-work-plugin-artifacts";
import {
  FEED_UI_CONTRIBUTION_ID,
  type FeedUiModel,
  type PersistedFeedDetailModel,
} from "@molis-ai/molis-work-plugin-feed";
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
} from "@molis-ai/molis-work-plugin-goals";
import {
  INBOX_UI_CONTRIBUTION_ID,
  type InboxUiModel,
  type InboxUiSurface,
} from "@molis-ai/molis-work-plugin-inbox";
import {
  SCHEDULE_UI_CONTRIBUTION_ID,
  type ScheduleUiModel,
  type ScheduleUiSurface,
} from "@molis-ai/molis-work-plugin-schedule";
import {
  SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  type ShelfSettingsUiModel,
} from "@molis-ai/molis-work-plugin-shelf";
import { UiHost, createSurfaceRenderer, createSurfaceRenderers } from "@molis-ai/molis-work-ui-host";
import { BUILTIN_PLUGIN_WORKBENCH, type BuiltinPluginWorkbenchPack } from "./plugin-workbench.js";
import { createArtifactWorkbenchRenderer } from "./artifact-ui.js";
import { createWorkSessionRenderer } from "./work-ui.js";

export { WORKBENCH_UI_SLOTS, renderWorkbenchDocument } from "./document-shell.js";
import { WORKBENCH_UI_SLOTS } from "./document-shell.js";


/**
 * Shared Workbench composition root. Product renderers never import a Plugin implementation directly. The host offers
 * the five workbench slots, and every surface is mounted in the slot its contribution declares (W5-06): no
 * surface→slot table and no per-plugin mount adapter lives here.
 */
export function createWorkbenchUiHost(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): UiHost {
  const host = new UiHost({ slots: Object.values(WORKBENCH_UI_SLOTS) });
  for (const pack of packs) {
    for (const contribution of pack.contributions) host.register(contribution);
  }
  return host;
}

const workbenchUiHost = createWorkbenchUiHost();


// The Goals renderers the shell still calls by name (until Goals S11 and W5-10); each method mounts the surface the
// plugin's own map names.
export const createWorkbenchGoalsProposalRenderer = createSurfaceRenderers<GoalsProposalRenderer, GoalsProposalUiPrimitives>(workbenchUiHost, GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES);
export const createWorkbenchGoalsPolicyRenderer = createSurfaceRenderers<GoalsPolicyRenderer, GoalsPolicyUiPrimitives>(workbenchUiHost, GOALS_POLICY_UI_CONTRIBUTION_ID, GOALS_POLICY_UI_SURFACES);
export const createWorkbenchGoalsRelationRenderer = createSurfaceRenderers<GoalsRelationRenderer, GoalsRelationUiPrimitives>(workbenchUiHost, GOALS_RELATION_UI_CONTRIBUTION_ID, GOALS_RELATION_UI_SURFACES);
export const createWorkbenchGoalsTreeRenderer = createSurfaceRenderers<GoalsTreeRenderer, GoalsTreeUiPrimitives>(workbenchUiHost, GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_TREE_UI_SURFACES);
export const createWorkbenchGoalsMomentumRenderer = createSurfaceRenderers<GoalsMomentumRenderer, GoalsMomentumUiPrimitives>(workbenchUiHost, GOALS_MOMENTUM_UI_CONTRIBUTION_ID, GOALS_MOMENTUM_UI_SURFACES);
export const createWorkbenchGoalsDocumentRenderer = createSurfaceRenderers<GoalsDocumentRenderer, GoalsDocumentUiPrimitives>(workbenchUiHost, GOALS_DOCUMENT_UI_CONTRIBUTION_ID, GOALS_DOCUMENT_UI_SURFACES);
export const createWorkbenchGoalsContextRenderer = createSurfaceRenderers<GoalsContextRenderer, GoalsContextUiPrimitives>(workbenchUiHost, GOALS_CONTEXT_UI_CONTRIBUTION_ID, GOALS_CONTEXT_UI_SURFACES);
export const createWorkbenchGoalsPlanningRenderer = createSurfaceRenderers<GoalsPlanningRenderer, GoalsPlanningPrimitives>(workbenchUiHost, GOALS_PLANNING_UI_CONTRIBUTION_ID, GOALS_PLANNING_UI_SURFACES);
export const createWorkbenchGoalsStatusRenderer = createSurfaceRenderers<GoalsStatusRenderer, GoalsStatusPrimitives>(workbenchUiHost, GOALS_STATUS_UI_CONTRIBUTION_ID, GOALS_STATUS_UI_SURFACES);
export const createWorkbenchGoalsFactorsRenderer = createSurfaceRenderer<GoalsFactorsRenderer, GoalsFactorsPrimitives>(workbenchUiHost, GOALS_FACTORS_UI_CONTRIBUTION_ID, GOALS_FACTORS_UI_SURFACE);
export const createWorkbenchGoalsDialogsRenderer = createSurfaceRenderers<GoalsDialogsRenderer, GoalsDialogPrimitives>(workbenchUiHost, GOALS_DIALOGS_UI_CONTRIBUTION_ID, GOALS_DIALOGS_UI_SURFACES);

export const artifactWorkbench = createArtifactWorkbenchRenderer(workbenchUiHost);

export function createArtifactReferenceRenderer(primitives: ArtifactReferenceUiPrimitives) {
  return (value: string, label = value): string => renderWorkbenchContribution(ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, "reference", { value, label, primitives });
}

export const renderProjectOperations = createWorkSessionRenderer(workbenchUiHost);

/** Mount one surface of a registered contribution in the slot the contribution declares for it. */
export function renderWorkbenchContribution(contributionId: string, surface: string, model: unknown): string {
  return workbenchUiHost.mountDeclared({ contribution_id: contributionId, surface, model }).html;
}

export function renderFeedContribution(
  surface: UiRenderRequest<FeedUiModel | PersistedFeedDetailModel>["surface"],
  model: FeedUiModel | PersistedFeedDetailModel,
): string {
  return renderWorkbenchContribution(FEED_UI_CONTRIBUTION_ID, surface, model);
}

export function renderInboxContribution(surface: InboxUiSurface, model: InboxUiModel): string {
  return renderWorkbenchContribution(INBOX_UI_CONTRIBUTION_ID, surface, model);
}

export function renderScheduleContribution(surface: ScheduleUiSurface, model: ScheduleUiModel): string {
  return renderWorkbenchContribution(SCHEDULE_UI_CONTRIBUTION_ID, surface, model);
}

/** The settings page asks for the settings slot itself: a contribution whose `settings` surface targets another slot is refused. */
export function renderPluginSettingsContribution(
  contributionId: string,
  model: unknown,
): string {
  return workbenchUiHost.mount({
    slot: WORKBENCH_UI_SLOTS.settings,
    contribution: { contribution_id: contributionId, surface: "settings", model },
  }).html;
}

export function renderShelfSettingsContribution(model: ShelfSettingsUiModel): string {
  return renderPluginSettingsContribution(SHELF_SETTINGS_UI_CONTRIBUTION_ID, model);
}


export function listWorkbenchUiContributions() {
  return workbenchUiHost.list();
}
