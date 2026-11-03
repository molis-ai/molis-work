import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { GOAL_DISPLAY_STATUSES } from "../action-presentation.js";
import type { GoalsDocumentView as WebGoalView } from "../document-view.js";
import { createGoalStateExplainer } from "../goal-state-explanation.js";
import { sortGoalTreeItems } from "../tree-order.js";
import { createFocusSections } from "./focus-sections.js";
import type { GoalsPageView } from "./view.js";
import type { GoalsPagePorts } from "./ports.js";
import type { GoalsRendererFactories } from "./factories.js";

/** The Goals owners' renderers bound to this request's words: status, tree, momentum, relations, context, policy and proposals. */
export function createGoalsRenderers<TView extends GoalsPageView>(
  ports: Pick<GoalsPagePorts<TView>, "L" | "goalsL" | "currentLocale" | "listJoin" | "formatDate" | "renderList" | "renderReference"> & { defaultPolicy: { human_approval: boolean } },
  factories: GoalsRendererFactories,
) {
  const { L, goalsL, currentLocale, listJoin, formatDate, renderList, defaultPolicy } = ports;
  const { sectionHeading, subsectionHeading, renderFocusSectionDeck } = createFocusSections({ L, escapeHtml });
  const { renderGoalTreeProposalDecision, renderGoalTreeProposalList } = factories.proposal({ translate: goalsL, escapeHtml, icon, renderList });
  const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(goalsL);
  function renderReference(value: string, label = value): string {
    return ports.renderReference(value, label);
  }

  const { renderStatus, renderActionStatus, renderVisibleGoalStatus, visibleGoalStatusIcon } = factories.status({ translate: goalsL, escapeHtml, icon });

  function sortGoals(items: WebGoalView[]): WebGoalView[] {
    return sortGoalTreeItems(items);
  }

  const goalsTreeRenderer = factories.tree({
    translate: goalsL, escapeHtml, listJoin, icon,
    renderStatus, renderActionStatus, renderVisibleGoalStatus, displayStatuses: GOAL_DISPLAY_STATUSES,
  });
  const { renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban } = factories.momentum({
    translate: goalsL, escapeHtml, currentLocale, icon, renderVisibleGoalStatus,
  });
  const goalsRelationRenderer = factories.relation({ translate: goalsL, escapeHtml, icon });

  function renderRelations(item: WebGoalView, view: TView, editable = true): string {
    return goalsRelationRenderer.renderRelations(item, view, editable);
  }

  const { renderChildProgress, renderContractCoverage } = factories.context({
    translate: goalsL, escapeHtml, icon, currentLocale,
    subsectionHeading, explainWorkState, explainParentCompletion,
  });
  const { renderProjectPolicyDocument, renderPolicyEditor } = factories.policy({
    translate: goalsL, escapeHtml, formatDate, icon, defaultPolicy,
  });

  return {
    sectionHeading, renderFocusSectionDeck, renderGoalTreeProposalDecision, renderGoalTreeProposalList, explainWorkState, renderReference,
    renderStatus, renderVisibleGoalStatus, visibleGoalStatusIcon, sortGoals, goalsTreeRenderer,
    renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban, renderRelations, renderChildProgress, renderContractCoverage,
    renderProjectPolicyDocument, renderPolicyEditor,
  };
}
