import { THEME_BOOTSTRAP_SCRIPT, icon, renderIconSprite } from "@molis-ai/molis-work-design-system";
import type { GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type {
  UiRenderRequest,
  UiSlotDescriptor,
  WorkbenchDocumentRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { artifactReferenceUiContribution, artifactBrowserUiContribution, ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID, type ArtifactReferenceUiPrimitives } from "@molis-ai/molis-work-plugin-artifacts";
import {
  FEED_UI_CONTRIBUTION_ID,
  feedUiContribution,
  type FeedUiSurface,
  type FeedUiModel,
  type PersistedFeedDetailModel,
} from "@molis-ai/molis-work-plugin-feed";
import {
  goalsContextUiContribution,
  goalsDecisionResultsUiContribution,
  goalsDialogsUiContribution,
  goalsDocumentUiContribution,
  goalsFactorsUiContribution,
  goalsMomentumUiContribution,
  goalsPlanningUiContribution,
  goalsPolicyUiContribution,
  goalsProposalUiContribution,
  goalsRelationUiContribution,
  goalsSafetyUiContribution,
  goalsStatusUiContribution,
  goalsTreeUiContribution,
} from "@molis-ai/molis-work-plugin-goals";
import {
  INBOX_UI_CONTRIBUTION_ID,
  inboxUiContribution,
  type InboxUiModel,
  type InboxUiSurface,
} from "@molis-ai/molis-work-plugin-inbox";
import {
  SHELF_UI_CONTRIBUTION_ID,
  SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  shelfUiContribution,
  shelfSettingsUiContribution,
  type ShelfUiModel,
  type ShelfUiSurface,
  type ShelfSettingsUiModel,
} from "@molis-ai/molis-work-plugin-shelf";
import { workUiContribution, workTerminalUiContribution, WORK_TERMINAL_UI_CONTRIBUTION_ID, type WorkTerminalUiModel } from "@molis-ai/molis-work-plugin-work";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createArtifactWorkbenchRenderer, type ArtifactWorkbenchRequest } from "./artifact-ui.js";
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

export type WorkbenchGoalsAdapter = GoalsApplicationApi;

export const WORKBENCH_UI_SLOTS = {
  directory: { slot_id: "workbench.directory", version: 1, accepts: ["declarative-html"] },
  main: { slot_id: "workbench.main", version: 1, accepts: ["declarative-html"] },
  overlay: { slot_id: "workbench.overlay", version: 1, accepts: ["declarative-html"] },
  settings: { slot_id: "workbench.settings", version: 1, accepts: ["declarative-html"] },
} as const satisfies Record<string, UiSlotDescriptor>;

const INBOX_SURFACE_SLOTS: Readonly<Record<InboxUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
};

const SHELF_SURFACE_SLOTS: Readonly<Record<ShelfUiSurface, UiSlotDescriptor>> = {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAttributes(attributes: WorkbenchDocumentRenderRequest["body_attributes"]): string {
  return Object.entries(attributes ?? {})
    .filter((entry): entry is [string, string | boolean] => entry[1] !== null && entry[1] !== undefined && entry[1] !== false)
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`)
    .join("");
}

/** Own the stable HTML document shell while product Plugins own their rendered surfaces. */
export function renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string {
  return `${request.preamble_html ?? ""}<!doctype html>
<html lang="${escapeHtml(request.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${request.head_before_title_html ?? ""}
  <title>${escapeHtml(request.title)}</title>
  ${request.head_html ?? ""}
</head>
  <body${renderAttributes(request.body_attributes)}>
${request.body_html}
</body>
</html>`;
}

/** Bind Workbench routes to the public Goals Contract without copying Module rules. */
export function createWorkbenchGoalsAdapter(
  goals: GoalsApplicationApi,
): WorkbenchGoalsAdapter {
  return {
    impacts: goals.impacts,
    commands: goals.commands,
    lifecycle: goals.lifecycle,
    planning: goals.planning,
  };
}

/** Shared Workbench composition root. Product renderers never import a Plugin implementation directly. */
export function createWorkbenchUiHost(): UiHost {
  const host = new UiHost();
  host.register(feedUiContribution);
  host.register(inboxUiContribution);
  host.register(shelfUiContribution);
  host.register(shelfSettingsUiContribution);
  host.register(workUiContribution);
  host.register(workTerminalUiContribution);
  host.register(artifactReferenceUiContribution);
  host.register(artifactBrowserUiContribution);
  host.register(goalsPolicyUiContribution);
  host.register(goalsProposalUiContribution);
  host.register(goalsDecisionResultsUiContribution);
  host.register(goalsSafetyUiContribution);
  host.register(goalsRelationUiContribution);
  host.register(goalsTreeUiContribution);
  host.register(goalsMomentumUiContribution);
  host.register(goalsDocumentUiContribution);
  host.register(goalsContextUiContribution);
  host.register(goalsPlanningUiContribution);
  host.register(goalsStatusUiContribution);
  host.register(goalsFactorsUiContribution);
  host.register(goalsDialogsUiContribution);
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
