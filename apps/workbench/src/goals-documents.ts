import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { buildDecisionGroups, buildGoalsNavigationItems, countGoalDecisions, partOfChildViews, type WebGoalView } from "./goals-plugin.js";
import { createWorkbenchGoalsFragmentRenderer } from "./goals-fragment-renderer.js";
import { renderGoalInputsHtml } from "./goal-inputs-html.js";
import type { createWorkbenchGoalsRenderers } from "./goals-renderers.js";
import type { MolisWorkWebView } from "./page-view.js";
import { creatableKinds, pluginDirectoryFor } from "./plugin-catalog.js";
import { shownPagePlugins } from "./page-plugin-visibility.js";
import type { RendererLocale } from "./renderer-helpers.js";
import { renderTerminalPane } from "./terminal/pane.js";
import {
  createWorkbenchGoalsDialogsRenderer,
  createWorkbenchGoalsDocumentRenderer,
  createWorkbenchGoalsFactorsRenderer,
} from "./ui-composition.js";

/** A Goal's document, its fragments, dialogs and terminal pane, composed from the Goals owners' renderers. */
export function createWorkbenchGoalsDocuments(ports: {
  L: RendererLocale["L"];
  goalsL: RendererLocale["L"];
  formatDate(value: string | null | undefined): string;
  prefixLocalLinks(html: string, routePrefix: string, desktopShell?: boolean): string;
  goals: ReturnType<typeof createWorkbenchGoalsRenderers>;
}) {
  const { L, goalsL, formatDate, prefixLocalLinks, goals } = ports;
  const {
    sectionHeading, renderFocusSectionDeck, renderGoalTreeProposalDecision, explainWorkState, renderReference,
    renderStatus, renderVisibleGoalStatus, visibleGoalStatusIcon, sortGoals,
    renderGoalMomentum, renderGoalKanban, renderRelations, renderChildProgress, renderContractCoverage, renderPolicyEditor,
  } = goals;

  function dataJson(view: MolisWorkWebView): string {
    const summarize = (items: WebGoalView[]) => buildGoalsNavigationItems(
      items, goalId => partOfChildViews(goalId, view), visibleGoalStatusIcon,
    );
    return JSON.stringify({
      snapshot: {
        board: { project_id: view.snapshot.board.project_id },
        cursor: view.snapshot.cursor,
      },
      project: view.project,
      active_goal_id: view.active_goal_id,
      goals: summarize(view.goals),
      archived_goals: summarize(view.archived_goals),
      trashed_goals: summarize(view.trashed_goals),
      inbox_judgment: view.inbox_judgment ?? null,
    }).replaceAll("<", "\\u003c");
  }

  const goalsFactorsRenderer = createWorkbenchGoalsFactorsRenderer({ translate: goalsL, escapeHtml, icon, renderFocusSectionDeck });

  function renderGoalFactors(item: WebGoalView, view: MolisWorkWebView): string {
    return goalsFactorsRenderer(item, {
      relationsHtml: renderRelations(item, view, Boolean(item.event_document?.state.owner)),
      policyHtml: renderPolicyEditor(item),
    });
  }

  const goalsDocumentRenderer = createWorkbenchGoalsDocumentRenderer({
    translate: goalsL, escapeHtml, icon, formatDate, renderVisibleGoalStatus, renderStatus, sectionHeading,
  });

  const { renderTrashGoalDocument } = goalsDocumentRenderer;

  /** The Goal's inputs, followed and fixed, in one list with one 「加输入」 (goal-inputs-html.ts). */
  function renderInputBindingsHtml(item: WebGoalView, view: MolisWorkWebView): string {
    return renderGoalInputsHtml(item, { L, escapeHtml, renderReference }, creatableKinds(shownPagePlugins(view), pluginDirectoryFor(view.plugin_directory)));
  }

  function renderGoalDecisionHtml(item: WebGoalView, view: MolisWorkWebView): string {
    const group = buildDecisionGroups(view).find((entry) => entry.item?.goal.goal_id === item.goal.goal_id);
    if (!group?.goalTreeProposals.length) return "";
    return group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("");
  }

  function renderGoalDocument(item: WebGoalView, view: MolisWorkWebView, selected: boolean): string {
    return goalsDocumentRenderer.renderGoalDocument(item, {
      activeGoalId: view.snapshot.board.active_goal_id,
      decisionCount: countGoalDecisions(view, item.goal.goal_id),
      relatedWorkHtml: renderGoalFactors(item, view),
      artifactHtml: item.artifact_embed_html
        ? `<h3>${L("交付物")}</h3>${item.artifact_embed_html}`
        : "",
      coverageHtml: `${renderInputBindingsHtml(item, view)}${renderContractCoverage(item, view)}${renderChildProgress(item, view)}`,
      decisionHtml: renderGoalDecisionHtml(item, view),
      eventDocument: item.event_document ?? null,
    }, selected);
  }

  /** Bind the public fragment composition to existing content owners. */
  const {
    renderGoalDocumentFragment, renderMolisWorkMomentumFragment,
  } = createWorkbenchGoalsFragmentRenderer<WebGoalView, MolisWorkWebView>({
    document: (item, view) => renderGoalDocument(item, view, true),
    trash: (item) => renderTrashGoalDocument(item, true),
    momentum: (view, goalId, items) => renderGoalMomentum(view, goalId, [...items]) + renderGoalKanban(view, goalId, [...items]),
    prefixLinks: prefixLocalLinks,
  });

  /** Event history content remains with the execution/records owner, not the route adapter. */
  const goalsDialogsRenderer = createWorkbenchGoalsDialogsRenderer({ translate: goalsL, escapeHtml, icon });

  const { renderGoalTrashDialog } = goalsDialogsRenderer;

  function renderCreateDialog(view: MolisWorkWebView): string {
    return goalsDialogsRenderer.renderCreateDialog(view.goals);
  }

  function renderTuiPane(
    selected: WebGoalView | undefined,
    view: MolisWorkWebView,
    cliAvailability: Record<string, boolean> = {},
  ): string {
    return renderTerminalPane({
      selected: selected ? {
        ...selected.goal,
        event_work: selected.event_work === true,
        statusHtml: renderVisibleGoalStatus(selected, "data-tui-owner-status", "data-tui-owner-status-label"),
      } : undefined,
      children: (selected ? sortGoals(partOfChildViews(selected.goal.goal_id, view)) : []).map((child) => {
        const explanation = explainWorkState(child.status);
        return { goal_id: child.goal.goal_id, title: child.goal.title, statusLabel: explanation.label, nextAction: explanation.nextAction };
      }),
      cliAvailability,
      promptRoute: "/api/plugins/io.molis.work.goals/goals/:goalId/advance-prompt",
      terminalsRoute: "/api/plugins/io.molis.work.goals/goals/:goalId/terminals",
      text: L,
      icon,
    });
  }

  return {
    dataJson, goalsDocumentRenderer, renderGoalDocument, renderTrashGoalDocument,
    renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderGoalTrashDialog, renderCreateDialog, renderTuiPane,
  };
}
