import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsDocumentItem, GoalsDocumentContext, GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { renderGoalEventDocument } from "./event-document-ui.js";

function createDocumentRenderer(primitives: GoalsDocumentUiPrimitives) {
  const { escapeHtml, icon, formatDate, renderStatus, sectionHeading } = primitives;

  function renderGoalDocument(item: GoalsDocumentItem, context: GoalsDocumentContext, selected: boolean): string {
    return renderGoalEventDocument(item, context, selected, primitives);
  }

  function renderTrashGoalDocument(item: GoalsDocumentItem, selected: boolean): string {
    const goal = item.goal;
    const trashEvent = item.events.find((event) => event.type === "goal.trashed");
    const owner = goal.trashed_by ?? trashEvent?.actor_id ?? uiText.text("goals.document-ui.not-recorded");
    return `<article class="goal-document trash-goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <section class="goal-hero trash-goal-hero" aria-labelledby="trash-goal-title-${escapeHtml(goal.goal_id)}">
      <header class="goal-header">
        <div class="goal-title-kicker">${renderStatus("trashed")}<dl class="trash-goal-facts"><div>${icon("archive")}<dt>${uiText("goals.document-ui.moved")}</dt><dd>${formatDate(goal.trashed_at)}</dd></div><div>${icon("user")}<dt>${uiText("goals.document-ui.label")}</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("history")}<dt>${uiText("goals.document-ui.last-updated")}</dt><dd>${formatDate(goal.updated_at)}</dd></div></dl></div>
        <div class="goal-title-row"><div class="goal-title-copy"><h1 id="trash-goal-title-${escapeHtml(goal.goal_id)}">${escapeHtml(goal.title)}</h1><p class="goal-title-outcome">${uiText("goals.document-ui.goal-removed-active-list-but-its-content-history")}</p></div><div class="goal-title-actions"><button class="mw-btn mw-btn--secondary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${uiText("goals.document-ui.restore")}</span></button></div></div>
      </header>
    </section>
    <div class="goal-workspace-panels trash-goal-workspace">
    <section class="trash-goal-panel trash-goal-panel--state">
      ${sectionHeading("archive", "goals.document-ui.trash-state", "goals.document-ui.trash-preserves-goal")}
      <div class="trash-summary"><p><strong>${uiText("goals.document-ui.goals-content-full-history-kept")}</strong>${uiText("goals.document-ui.active-relations-pause-when-enters-trash-restore-only")}</p>${trashEvent ? `<p><strong>${uiText("goals.document-ui.trash-reason")}</strong><span translate="no">${escapeHtml(trashEvent.reason)}</span></p>` : ""}</div>
    </section>
    <section class="trash-goal-panel">
      ${sectionHeading("book", "goals.document-ui.original-goal")}
      <div class="business-copy"><p class="outcome"><strong>${uiText("goals.document-ui.result-want")}</strong>${escapeHtml(goal.outcome || uiText.text("goals.document-ui.needs-clarification"))}</p><p><strong>${uiText("goals.document-ui.why-do")}</strong>${escapeHtml(goal.why || uiText.text("goals.document-ui.needs-clarification"))}</p><p><strong>${uiText("goals.document-ui.how-works")}</strong>${escapeHtml(goal.business_logic || uiText.text("goals.document-ui.needs-clarification"))}</p></div>
    </section>
    <section class="trash-goal-panel trash-goal-panel--restore">
      ${sectionHeading("refresh", "goals.dialogs-client.restore-goal-tree", "goals.document-ui.restore-keeps-goal")}
      <div class="trash-restore-row"><p>${uiText("goals.document-ui.after-confirm-goal-returns-everyday-list-relations-that")}</p><button class="mw-btn mw-btn--primary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${uiText("goals.document-ui.restore-goal")}</span></button></div>
    </section>
    </div>
  </article>`;
  }

  function renderEmptyGoalCollection(trash: boolean, full: boolean): string {
    const title = trash ? uiText.text("goals.document-ui.trash-empty") : uiText.text("goals.document-ui.no-archived-goal-yet");
    const detail = full ? `<p>${trash ? uiText("goals.document-ui.goals-trash-can-be-restored-here-they-will") : uiText("goals.document-ui.finished-goal-can-be-archived-top-its-document")}</p><a href="/">${uiText("goals.document-ui.return-goal-tree")}</a>` : "";
    return `<div class="archive-empty">${icon("archive")}<h1>${title}</h1>${detail}</div>`;
  }
  return { renderGoalDocument, renderTrashGoalDocument, renderEmptyGoalCollection };
}
export type GoalsDocumentRenderer = ReturnType<typeof createDocumentRenderer>;
export const GOALS_DOCUMENT_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.document.v1";
export type GoalsDocumentUiModel = { primitives: GoalsDocumentUiPrimitives } & (
  | { kind: "document"; args: Parameters<GoalsDocumentRenderer["renderGoalDocument"]> }
  | { kind: "trash"; args: Parameters<GoalsDocumentRenderer["renderTrashGoalDocument"]> }
  | { kind: "empty-collection"; args: Parameters<GoalsDocumentRenderer["renderEmptyGoalCollection"]> }
);
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_DOCUMENT_UI_SURFACES = { renderGoalDocument: "document", renderTrashGoalDocument: "trash", renderEmptyGoalCollection: "empty-collection" } as const satisfies Record<keyof GoalsDocumentRenderer, GoalsDocumentUiModel["kind"]>;
export const goalsDocumentUiContribution: UiContribution<GoalsDocumentUiModel> = {
  descriptor: {
    contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal document",
    surfaces: Object.values(GOALS_DOCUMENT_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals document surface does not match its model");
    const renderer = createDocumentRenderer(model.primitives);
    switch (model.kind) {
      case "document": return renderer.renderGoalDocument(...model.args);
      case "trash": return renderer.renderTrashGoalDocument(...model.args);
      case "empty-collection": return renderer.renderEmptyGoalCollection(...model.args);
    }
  },
};
