import type { StageTerminalReadOnlyGuard } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { GOALS_PLUGIN_ID } from "../identity.js";
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
  ports: Pick<GoalsPagePorts<TView>, "readText" | "goalsL" | "formatDate" | "prefixLocalLinks" | "creatableKinds" | "renderTerminalPane">
    & { goals: ReturnType<typeof createGoalsRenderers<TView>> },
  factories: GoalsRendererFactories,
) {
  const { readText, goalsL, formatDate, prefixLocalLinks, goals, creatableKinds, renderTerminalPane } = ports;
  const {
    sectionHeading, renderFocusSectionDeck, renderGoalTreeProposalDecision, explainWorkState, renderReference,
    renderStatus, renderVisibleGoalStatus, visibleGoalStatusIcon, sortGoals,
    renderGoalMomentum, renderGoalKanban, renderRelations, renderChildProgress, renderContractCoverage, renderPolicyEditor,
  } = goals;

  function goalTerminalReadOnly(item: WebGoalView | undefined, view: TView): StageTerminalReadOnlyGuard | undefined {
    if (!item || item.goal.decomposition_state !== "closed_compound" || item.event_work === true) return undefined;
    const completed = item.goal.fulfillment_state === "satisfied";
    const choices = sortGoals(partOfChildViews(item.goal.goal_id, view)).map((child) => {
      const explanation = explainWorkState(child.status);
      return {
        href: `/goals/${encodeURIComponent(child.goal.goal_id)}`,
        title: child.goal.title,
        subtitle: `${explanation.label} · ${explanation.nextAction}`,
        action_label: uiText.text("goals.terminal.open-child-goal"),
      };
    });
    return {
      reason: uiText.text("goals.terminal.parent-read-only-message"),
      heading: uiText.text("goals.terminal.parent-does-not-use-terminal"),
      summary: uiText.text(completed ? "goals.terminal.child-goals-completed" : "goals.terminal.parent-does-not-complete-own"),
      empty_summary: uiText.text("goals.terminal.open-specific-child-goal-above"),
      add_disabled_title: uiText.text("goals.terminal.open-specific-child-goal"),
      empty_choices_text: uiText.text("goals.terminal.no-child-goal-ready"),
      choices,
    };
  }

  function clientData(view: TView) {
    const summarize = (items: WebGoalView[]) => buildGoalsNavigationItems(
      items, goalId => partOfChildViews(goalId, view), visibleGoalStatusIcon,
    ).map((entry, index) => {
      const readOnly = goalTerminalReadOnly(items[index], view);
      return readOnly ? { ...entry, terminal_read_only: readOnly } : entry;
    });
    return {
      snapshot: {
        board: { project_id: view.snapshot.board.project_id },
        cursor: view.snapshot.cursor,
      },
      project: view.project,
      active_goal_id: view.active_goal_id,
      goals: summarize(view.goals),
      archived_goals: summarize(view.archived_goals),
      trashed_goals: summarize(view.trashed_goals),
    };
  }
  const dataJson = (view: TView): string => JSON.stringify(clientData(view)).replaceAll("<", "\\u003c");

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
    return renderGoalInputsHtml(item, { readText, escapeHtml, renderReference }, creatableKinds(view));
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
        ? `<h3>${uiText("goals.documents.deliverable")}</h3>${item.artifact_embed_html}`
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
      plugin_id: GOALS_PLUGIN_ID,
      subject_kind: "goal",
      selected: selected ? {
        id: selected.goal.goal_id,
        title: selected.goal.title,
        status_html: renderVisibleGoalStatus(selected, "data-tui-owner-status", "data-tui-owner-status-label"),
      } : undefined,
      read_only: goalTerminalReadOnly(selected, view),
      cliAvailability,
      text: readText,
      icon,
    });
  }

  return {
    clientData, dataJson, goalsDocumentRenderer, renderGoalDocument, renderTrashGoalDocument,
    renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderGoalTrashDialog, renderCreateDialog, renderTuiPane,
  };
}
