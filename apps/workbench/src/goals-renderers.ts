import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createGoalStateExplainer, GOAL_DISPLAY_STATUSES, sortGoalTreeItems, type WebGoalView } from "./goals-plugin.js";
import { createWorkbenchFocusSections } from "./focus-sections.js";
import type { MolisWorkWebView } from "./page-view.js";
import type { RendererLocale } from "./renderer-helpers.js";
import {
  createArtifactReferenceRenderer,
  createWorkbenchGoalsContextRenderer,
  createWorkbenchGoalsMomentumRenderer,
  createWorkbenchGoalsPolicyRenderer,
  createWorkbenchGoalsProposalRenderer,
  createWorkbenchGoalsRelationRenderer,
  createWorkbenchGoalsStatusRenderer,
  createWorkbenchGoalsTreeRenderer,
} from "./ui-composition.js";

/** The Goals owners' renderers bound to this request's words: status, tree, momentum, relations, context, policy and proposals. */
export function createWorkbenchGoalsRenderers(ports: {
  L: RendererLocale["L"];
  goalsL: RendererLocale["L"];
  currentLocale: RendererLocale["currentLocale"];
  listJoin: RendererLocale["listJoin"];
  formatDate(value: string | null | undefined): string;
  renderList(values: string[], empty: string): string;
  defaultPolicy: { human_approval: boolean };
}) {
  const { L, goalsL, currentLocale, listJoin, formatDate, renderList, defaultPolicy } = ports;
  const { sectionHeading, subsectionHeading, renderFocusSectionDeck } = createWorkbenchFocusSections({ L, escapeHtml });
  const { renderGoalTreeProposalDecision, renderGoalTreeProposalList } = createWorkbenchGoalsProposalRenderer({ translate: goalsL, escapeHtml, icon, renderList });
  const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(goalsL);
  const artifactReferenceRenderer = createArtifactReferenceRenderer({ escape: escapeHtml, icon, text: L });

  function renderReference(value: string, label = value): string {
    return artifactReferenceRenderer(value, label);
  }

  const { renderStatus, renderActionStatus, renderVisibleGoalStatus, visibleGoalStatusIcon } = createWorkbenchGoalsStatusRenderer({ translate: goalsL, escapeHtml, icon });

  function sortGoals(items: WebGoalView[]): WebGoalView[] {
    return sortGoalTreeItems(items);
  }

  const goalsTreeRenderer = createWorkbenchGoalsTreeRenderer({
    translate: goalsL, escapeHtml, listJoin, icon,
    renderStatus, renderActionStatus, renderVisibleGoalStatus, displayStatuses: GOAL_DISPLAY_STATUSES,
  });
  const { renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban } = createWorkbenchGoalsMomentumRenderer({
    translate: goalsL, escapeHtml, currentLocale, icon, renderVisibleGoalStatus,
  });
  const goalsRelationRenderer = createWorkbenchGoalsRelationRenderer({ translate: goalsL, escapeHtml, icon });

  function renderRelations(item: WebGoalView, view: MolisWorkWebView, editable = true): string {
    return goalsRelationRenderer.renderRelations(item, view, editable);
  }

  const { renderChildProgress, renderContractCoverage } = createWorkbenchGoalsContextRenderer({
    translate: goalsL, escapeHtml, icon, currentLocale,
    subsectionHeading, explainWorkState, explainParentCompletion,
  });
  const { renderProjectPolicyDocument, renderPolicyEditor } = createWorkbenchGoalsPolicyRenderer({
    translate: goalsL, escapeHtml, formatDate, icon, defaultPolicy,
  });

  return {
    sectionHeading, renderFocusSectionDeck, renderGoalTreeProposalDecision, renderGoalTreeProposalList, explainWorkState, renderReference,
    renderStatus, renderVisibleGoalStatus, visibleGoalStatusIcon, sortGoals, goalsTreeRenderer,
    renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban, renderRelations, renderChildProgress, renderContractCoverage,
    renderProjectPolicyDocument, renderPolicyEditor,
  };
}
