import { COGNIA_UI_CONTRIBUTION_ID, type CogniaUiModel } from "@molis-ai/molis-work-plugin-cognia";
import { IMAGES_UI_CONTRIBUTION_ID, type ImagesUiModel } from "@molis-ai/molis-work-plugin-images";
import { JELLY_UI_CONTRIBUTION_ID, type JellyUiModel, type JellyUiSurface } from "@molis-ai/molis-work-plugin-jelly";
import { EXPERIMENTS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-experiments";
import { THEME_BOOTSTRAP_SCRIPT, icon, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { codingSettingsContribution } from "@molis-ai/molis-work-plugin-coding";
import type {
  UiRenderRequest,
  UiSlotDescriptor,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, type ArtifactReferenceUiPrimitives } from "@molis-ai/molis-work-plugin-artifacts";
import {
  FEED_UI_CONTRIBUTION_ID,
  type FeedUiSurface,
  type FeedUiModel,
  type PersistedFeedDetailModel,
} from "@molis-ai/molis-work-plugin-feed";
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
  SHELF_UI_CONTRIBUTION_ID,
  SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  type ShelfUiModel,
  type ShelfUiSurface,
  type ShelfSettingsUiModel,
} from "@molis-ai/molis-work-plugin-shelf";
import {
  PAGES_UI_CONTRIBUTION_ID,
  type PagesUiModel,
  type PagesUiSurface,
} from "@molis-ai/molis-work-plugin-pages";
import {
  FORM_UI_CONTRIBUTION_ID,
  type FormUiModel,
  type FormUiSurface,
} from "@molis-ai/molis-work-plugin-form";
import {
  DATASET_UI_CONTRIBUTION_ID,
  type DatasetUiModel,
  type DatasetUiSurface,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  PPT_UI_CONTRIBUTION_ID,
  type PptUiModel,
  type PptUiSurface,
} from "@molis-ai/molis-work-plugin-ppt";
import {
  LINGGUANG_UI_CONTRIBUTION_ID,
  type LingguangUiModel,
  type LingguangUiSurface,
} from "@molis-ai/molis-work-plugin-lingguang";
import {
  ALCHEMIST_UI_CONTRIBUTION_ID,
  type AlchemistUiModel,
  type AlchemistUiSurface,
} from "@molis-ai/molis-work-plugin-alchemist";
import {
  WORKFLOWS_UI_CONTRIBUTION_ID,
  type WorkflowsUiModel,
  type WorkflowsUiSurface,
} from "@molis-ai/molis-work-plugin-workflows";
import { WORK_TERMINAL_UI_CONTRIBUTION_ID, type WorkTerminalUiModel } from "@molis-ai/molis-work-plugin-work";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { BUILTIN_PLUGIN_WORKBENCH } from "./plugin-workbench.js";
import { createArtifactWorkbenchRenderer, type ArtifactImportWorkbenchRequest, type ArtifactWorkbenchRequest } from "./artifact-ui.js";
import { createGoalsContextWorkbenchRenderer } from "./goals-context-ui.js";
import { createGoalsDecisionResultsWorkbenchRenderer } from "./goals-decision-results-ui.js";
import { createGoalsDialogsWorkbenchRenderer } from "./goals-dialogs-ui.js";
import { createGoalsDocumentWorkbenchRenderer } from "./goals-document-ui.js";
import { createGoalsFactorsWorkbenchRenderer } from "./goals-factors-ui.js";
import { createGoalsMomentumWorkbenchRenderer } from "./goals-momentum-ui.js";
import { createGoalsPlanningWorkbenchRenderer } from "./goals-planning-ui.js";
import { createGoalsPolicyWorkbenchRenderer } from "./goals-policy-ui.js";
import { createGoalsProposalWorkbenchRenderer } from "./goals-proposal-ui.js";
import { createGoalsRelationWorkbenchRenderer } from "./goals-relation-ui.js";
import { createGoalsSafetyWorkbenchRenderer } from "./goals-safety-ui.js";
import { createGoalsStatusWorkbenchRenderer } from "./goals-status-ui.js";
import { createGoalsTreeWorkbenchRenderer } from "./goals-tree-ui.js";
import { createWorkSessionRenderer } from "./work-ui.js";

export { WORKBENCH_UI_SLOTS, renderWorkbenchDocument } from "./document-shell.js";
import { WORKBENCH_UI_SLOTS, renderWorkbenchDocument } from "./document-shell.js";


const INBOX_SURFACE_SLOTS: Readonly<Record<InboxUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const SCHEDULE_SURFACE_SLOTS: Readonly<Record<ScheduleUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const SHELF_SURFACE_SLOTS: Readonly<Record<ShelfUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};


const PAGES_SURFACE_SLOTS: Readonly<Record<PagesUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const FORM_SURFACE_SLOTS: Readonly<Record<FormUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const DATASET_SURFACE_SLOTS: Readonly<Record<DatasetUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const PPT_SURFACE_SLOTS: Readonly<Record<PptUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const LINGGUANG_SURFACE_SLOTS: Readonly<Record<LingguangUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const ALCHEMIST_SURFACE_SLOTS: Readonly<Record<AlchemistUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const WORKFLOWS_SURFACE_SLOTS: Readonly<Record<WorkflowsUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const FEED_SURFACE_SLOTS: Readonly<Record<FeedUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
  "workbench-fragment": WORKBENCH_UI_SLOTS.main,
  "source-directory": WORKBENCH_UI_SLOTS.directory,
  "source-workbench": WORKBENCH_UI_SLOTS.main,
  overlays: WORKBENCH_UI_SLOTS.overlay,
  "persisted-detail": WORKBENCH_UI_SLOTS.main,
  "frame-block": WORKBENCH_UI_SLOTS.main,
};


/** Shared Workbench composition root. Product renderers never import a Plugin implementation directly. */
export function createWorkbenchUiHost(): UiHost {
  const host = new UiHost();
  for (const pack of BUILTIN_PLUGIN_WORKBENCH) {
    for (const contribution of pack.contributions) host.register(contribution);
  }
  host.register(codingSettingsContribution);
  return host;
}

const workbenchUiHost = createWorkbenchUiHost();

export const createWorkbenchGoalsDecisionResultsRenderer = createGoalsDecisionResultsWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsProposalRenderer = createGoalsProposalWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsPolicyRenderer = createGoalsPolicyWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsSafetyRenderer = createGoalsSafetyWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsRelationRenderer = createGoalsRelationWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsTreeRenderer = createGoalsTreeWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.directory);

export const createWorkbenchGoalsMomentumRenderer = createGoalsMomentumWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsDocumentRenderer = createGoalsDocumentWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsContextRenderer = createGoalsContextWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsPlanningRenderer = createGoalsPlanningWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsStatusRenderer = createGoalsStatusWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsFactorsRenderer = createGoalsFactorsWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.main);

export const createWorkbenchGoalsDialogsRenderer = createGoalsDialogsWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS.overlay);

export const artifactWorkbench = createArtifactWorkbenchRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS, renderWorkbenchDocument);

export function createArtifactReferenceRenderer(primitives: ArtifactReferenceUiPrimitives) {
  return (value: string, label = value, evidenceId?: string): string => workbenchUiHost.mount({
    slot: WORKBENCH_UI_SLOTS.main,
    contribution: {
      contribution_id: ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID,
      surface: "reference",
      model: { value, label, evidenceId, primitives },
    },
  }).html;
}

export const renderProjectOperations = createWorkSessionRenderer(workbenchUiHost, WORKBENCH_UI_SLOTS);

export const renderWorkTerminal = (model: WorkTerminalUiModel): string => workbenchUiHost.mount({
  slot: WORKBENCH_UI_SLOTS.main,
  contribution: { contribution_id: WORK_TERMINAL_UI_CONTRIBUTION_ID, surface: "terminal", model },
}).html;

export function renderFeedContribution(
  surface: UiRenderRequest<FeedUiModel | PersistedFeedDetailModel>["surface"],
  model: FeedUiModel | PersistedFeedDetailModel,
): string {
  return workbenchUiHost.mount({
    slot: FEED_SURFACE_SLOTS[surface as FeedUiSurface],
    contribution: {
      contribution_id: FEED_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderInboxContribution(
  surface: InboxUiSurface,
  model: InboxUiModel,
): string {
  return workbenchUiHost.mount({
    slot: INBOX_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: INBOX_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderScheduleContribution(
  surface: ScheduleUiSurface,
  model: ScheduleUiModel,
): string {
  return workbenchUiHost.mount({
    slot: SCHEDULE_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderShelfContribution(
  surface: ShelfUiSurface,
  model: ShelfUiModel,
): string {
  return workbenchUiHost.mount({
    slot: SHELF_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: SHELF_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}


export function renderPagesContribution(
  surface: PagesUiSurface,
  model: PagesUiModel,
): string {
  return workbenchUiHost.mount({
    slot: PAGES_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: PAGES_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderFormContribution(
  surface: FormUiSurface,
  model: FormUiModel,
): string {
  return workbenchUiHost.mount({
    slot: FORM_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: FORM_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderDatasetContribution(
  surface: DatasetUiSurface,
  model: DatasetUiModel,
): string {
  return workbenchUiHost.mount({
    slot: DATASET_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: DATASET_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderPptContribution(
  surface: PptUiSurface,
  model: PptUiModel,
): string {
  return workbenchUiHost.mount({
    slot: PPT_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: PPT_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderAlchemistContribution(
  surface: AlchemistUiSurface,
  model: AlchemistUiModel,
): string {
  return workbenchUiHost.mount({
    slot: ALCHEMIST_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: ALCHEMIST_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderWorkflowsContribution(
  surface: WorkflowsUiSurface,
  model: WorkflowsUiModel,
): string {
  return workbenchUiHost.mount({
    slot: WORKFLOWS_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: WORKFLOWS_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderLingguangContribution(
  surface: LingguangUiSurface,
  model: LingguangUiModel,
): string {
  return workbenchUiHost.mount({
    slot: LINGGUANG_SURFACE_SLOTS[surface],
    contribution: {
      contribution_id: LINGGUANG_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function renderPluginSettingsContribution(
  contributionId: string,
  model: unknown,
): string {
  return workbenchUiHost.mount({
    slot: WORKBENCH_UI_SLOTS.settings,
    contribution: {
      contribution_id: contributionId,
      surface: "settings",
      model,
    },
  }).html;
}

export function renderShelfSettingsContribution(model: ShelfSettingsUiModel): string {
  return renderPluginSettingsContribution(SHELF_SETTINGS_UI_CONTRIBUTION_ID, model);
}


export function listWorkbenchUiContributions() {
  return workbenchUiHost.list();
}

export function renderArtifactWorkbenchPage(
  request: Omit<ArtifactWorkbenchRequest, "headHtml" | "backIconHtml" | "iconSpriteHtml"> & { nativeDesktopBootstrapScript: string },
): string {
  return artifactWorkbench.page({
    ...request,
    headHtml: `<script>${THEME_BOOTSTRAP_SCRIPT}${request.nativeDesktopBootstrapScript}</script><link rel="stylesheet" href="/assets/molis-work-workbench.css">`,
    backIconHtml: icon("arrow"), iconSpriteHtml: renderIconSprite(),
  });
}

export function renderArtifactImportPage(
  request: Omit<ArtifactImportWorkbenchRequest, "headHtml" | "iconSpriteHtml"> & { nativeDesktopBootstrapScript: string },
): string {
  return artifactWorkbench.importPage({
    ...request,
    headHtml: `<script>${THEME_BOOTSTRAP_SCRIPT}${request.nativeDesktopBootstrapScript}</script><link rel="stylesheet" href="/assets/molis-work-workbench.css">`,
    iconSpriteHtml: renderIconSprite(),
  });
}

export function renderExperimentsContribution(): string { return workbenchUiHost.mount({slot:WORKBENCH_UI_SLOTS.main,contribution:{contribution_id:EXPERIMENTS_UI_CONTRIBUTION_ID,surface:"workbench",model:{}}}).html; }

export function renderImagesContribution(model: ImagesUiModel): string {
  return workbenchUiHost.mount({ slot: WORKBENCH_UI_SLOTS.main, contribution: { contribution_id: IMAGES_UI_CONTRIBUTION_ID, surface: "workbench", model } }).html;
}

export function renderJellyContribution(surface: JellyUiSurface, model: JellyUiModel): string {
  return workbenchUiHost.mount({ slot: surface === "directory" ? WORKBENCH_UI_SLOTS.directory : WORKBENCH_UI_SLOTS.main, contribution: { contribution_id: JELLY_UI_CONTRIBUTION_ID, surface, model } }).html;
}

export function renderCogniaContribution(surface: "directory" | "workbench", model: CogniaUiModel): string {
  return workbenchUiHost.mount({ slot: surface === "directory" ? WORKBENCH_UI_SLOTS.directory : WORKBENCH_UI_SLOTS.main, contribution: { contribution_id: COGNIA_UI_CONTRIBUTION_ID, surface, model } }).html;
}
