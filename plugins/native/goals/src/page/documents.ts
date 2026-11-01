import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { buildDecisionGroups, countGoalDecisions } from "../decision-groups.js";
import type { GoalsDocumentView as WebGoalView } from "../document-view.js";
import { buildGoalsNavigationItems } from "../navigation-model.js";
import { partOfChildViews } from "../tree-presentation.js";
import type { GoalsRendererFactories } from "./factories.js";
import { createGoalsFragmentRenderer } from "./fragments.js";
import { renderGoalInputsHtml } from "./inputs.js";
import type { GoalsPagePorts } from "./ports.js";
import type { createGoalsRenderers } from "./renderers.js";
import type { GoalsPageView } from "./view.js";

/** A Goal's document, its fragments, dialogs and terminal pane, composed from the Goals owners' renderers. */
export function createGoalsDocuments<TView extends GoalsPageView>(
  ports: Pick<GoalsPagePorts<TView>, "L" | "goalsL" | "formatDate" | "prefixLocalLinks" | "creatableKinds" | "inPluginWords" | "renderTerminalPane">
    & { goals: ReturnType<typeof createGoalsRenderers<TView>> },
  factories: GoalsRendererFactories,
) {
  const { L, goalsL, formatDate, prefixLocalLinks, goals, creatableKinds, inPluginWords, renderTerminalPane } = ports;
  const {
    sectionHeading, renderFocusSectionDeck, renderGoalTreeProposalDecision, explainWorkState, renderReference,
    renderStatus, renderVisibleGoalStatus, visibleGoalStatusIcon, sortGoals,
    renderGoalMomentum, renderGoalKanban, renderRelations, renderChildProgress, renderContractCoverage, renderPolicyEditor,
  } = goals;

  function dataJson(view: TView): string {
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

  const goalsFactorsRenderer = factories.factors({ translate: goalsL, escapeHtml, icon, renderFocusSectionDeck });

  function renderGoalFactors(item: WebGoalView, view: TView): string {
    return goalsFactorsRenderer(item, {
      relationsHtml: renderRelations(item, view, Boolean(item.event_document?.state.owner)),
      policyHtml: renderPolicyEditor(item),
    });
  }

  const goalsDocumentRenderer = factories.document({
    translate: goalsL, escapeHtml, icon, formatDate, renderVisibleGoalStatus, renderStatus, sectionHeading,
  });

  const { renderTrashGoalDocument } = goalsDocumentRenderer;

  /** The Goal's inputs, followed and fixed, in one list with one 「加输入」 (goal-inputs-html.ts). */
  function renderInputBindingsHtml(item: WebGoalView, view: TView): string {
    return renderGoalInputsHtml(item, { L, escapeHtml, renderReference, inPluginWords }, creatableKinds(view));
  }

  function renderGoalDecisionHtml(item: WebGoalView, view: TView): string {
    const group = buildDecisionGroups(view).find((entry) => entry.item?.goal.goal_id === item.goal.goal_id);
    if (!group?.goalTreeProposals.length) return "";
    return group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("");
  }

  function renderGoalDocument(item: WebGoalView, view: TView, selected: boolean): string {
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
  } = createGoalsFragmentRenderer<WebGoalView, TView>({
    document: (item, view) => renderGoalDocument(item, view, true),
    trash: (item) => renderTrashGoalDocument(item, true),
    momentum: (view, goalId, items) => renderGoalMomentum(view, goalId, [...items]) + renderGoalKanban(view, goalId, [...items]),
    prefixLinks: prefixLocalLinks,
  });

  /** Event history content remains with the execution/records owner, not the route adapter. */
  const goalsDialogsRenderer = factories.dialogs({ translate: goalsL, escapeHtml, icon });

  const { renderGoalTrashDialog } = goalsDialogsRenderer;

  function renderCreateDialog(view: TView): string {
    return goalsDialogsRenderer.renderCreateDialog(view.goals);
  }

  function renderTuiPane(
    selected: WebGoalView | undefined,
    view: TView,
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
      text: L,
      icon,
    });
  }

  return {
    dataJson, goalsDocumentRenderer, renderGoalDocument, renderTrashGoalDocument,
    renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderGoalTrashDialog, renderCreateDialog, renderTuiPane,
  };
}
