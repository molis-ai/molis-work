import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { buildGoalCollectionModel } from "../collection-model.js";
import { renderGoalDetailsAside, renderImmersiveGoalHeader, renderImmersiveWorkTabs } from "./chrome.js";
import { renderGoalFrameStage } from "./frame-stage.js";
import { createGoalsPage } from "./index.js";
import type { GoalsPagePorts } from "./ports.js";
import type { GoalsPageView } from "./view.js";
import type { StagePageModel, UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsStageData } from "../stage-action.js";

export const GOALS_STAGE_CONTRIBUTION_ID = "io.molis.work.goals.stage";

export function goalsPagePorts(model: Pick<StagePageModel, "drawing" | "primitives">): GoalsPagePorts<GoalsPageView> {
  const { drawing } = model;
  if (!drawing) throw new Error("Goals page drawing services are missing");
  const L = model.primitives.text;
  return { ...drawing, L, goalsL: L, formatDate: drawing.formatDocumentDate, creatableKinds: () => drawing.creatableKinds };
}

/** The actual Runtime and catalog register this same owner; shell publication exists only on the matched page render. */
export const goalsStageUiContribution: UiContribution<StagePageModel<GoalsStageData>> = {
  descriptor: { contribution_id: GOALS_STAGE_CONTRIBUTION_ID, kind: "primary-page", label: "Goals", slots: [], surfaces: [
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "create-dialog", target_slot_id: "workbench.overlay", format: "declarative-html" },
    { surface_id: "trash-dialog", target_slot_id: "workbench.overlay", format: "declarative-html" },
    ...["board-refresh", "board-momentum", "goal-document"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })),
  ] },
  render({ model, surface }) {
    if (!model.data || !model.drawing || !model.context) return "";
    const { context, data } = model;
    const ports = goalsPagePorts(model);
    const page = createGoalsPage(ports);
    const selected = data.selected;
    const decorate = (item: GoalsPageView["goals"][number]) => item.goal.goal_id === selected?.goal_id ? { ...item, event_document: selected.document } : item;
    const view: GoalsPageView = { ...data.collection, project: context.project, demo: context.demo, route_prefix: model.route_prefix,
      goals: data.collection.goals.map(decorate), archived_goals: data.collection.archived_goals.map(decorate), trashed_goals: data.collection.trashed_goals.map(decorate),
      inbox_judgment: context.client_data?.inbox_judgment };
    if (surface === "create-dialog") return page.documents.renderCreateDialog(view);
    if (surface === "trash-dialog") return page.documents.renderGoalTrashDialog();
    const archive = data.selection === "archive", trash = data.selection === "trash";
    if (surface === "board-refresh") return createGoalsWorkbenchStage(page, ports).renderMolisWorkRefreshFragment(view, model.request?.goal_id, archive, trash);
    if (surface === "board-momentum") return page.documents.renderMolisWorkMomentumFragment(view, model.request?.goal_id ?? "", archive ? "archive" : "current") ?? "";
    if (surface === "goal-document") return page.documents.renderGoalDocumentFragment(view, model.request?.goal_id ?? "", data.selection) ?? "";
    const result = createGoalsWorkbenchStage(page, ports).render(view, model.request?.goal_id, archive, trash, context.cli_availability);
    model.page?.publish({ title: result.title, body_attributes: { "data-board-view": data.selection },
      workspace_classes: result.showTui ? ["is-desktop-tui"] : [], terminal_client: result.showTui,
      open_stage: Boolean(model.request?.goal_id || archive || trash), bootstrap: { id: "molis-work-data", value: page.documents.clientData(view) },
      overlays: { before_global_search: "create-dialog", after_global_search: "trash-dialog" } });
    return `${result.stage}\n            ${result.frame}`;
  },
};

/** Goals owns its canvas, collection and refresh document; the shell only places the resulting content. */
export function createGoalsWorkbenchStage<TView extends GoalsPageView>(
  page: ReturnType<typeof createGoalsPage<TView>>,
  ports: Pick<GoalsPagePorts<TView>, "L" | "goalsL" | "prefixLocalLinks">,
) {
  const { L, goalsL, prefixLocalLinks } = ports;
  const { goalsTreeRenderer, renderMomentumPlaceholder, renderGoalKanban } = page.goals;
  const { dataJson, renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, renderCreateDialog, renderTuiPane } = page.documents;
  const renderGoalProposals = (view: TView) => page.goals.renderGoalTreeProposalList(view.snapshot.goal_tree_proposals, view);

function renderMolisWorkRefreshFragment(
  view: TView,
  requestedGoalId?: string,
  archiveView = false,
  trashView = false,
): string {
  const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, goalsL);
  const { selected } = collection;
  const document = selected
    ? trashView
      ? renderTrashGoalDocument(selected, true)
      : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, false);
  const bodyView = trashView ? "trash" : archiveView ? "archive" : "current";
  const html = `<!doctype html><html><body data-board-view="${bodyView}">
    ${goalsTreeRenderer.renderGoalRefreshDirectory(view, collection, renderGoalProposals(view))}
    <section data-document-pane><section data-work-surface="goals">${document}</section></section>
    ${renderCreateDialog(view)}
    <script id="molis-work-data" type="application/json">${dataJson(view)}</script>
  </body></html>`;
  return prefixLocalLinks(html, view.route_prefix);
}


  function render(view: TView, requestedGoalId: string | undefined, archiveView: boolean, trashView: boolean,
    cliAvailability: Record<string, boolean>) {
    const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, goalsL);
    const { selected, title, collectionTitle } = collection;
    const primitives = { L, escapeHtml, icon };
  const showTui = !archiveView && !trashView;
  const renderedDocumentContent = selected
    ? trashView ? renderTrashGoalDocument(selected, true) : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, true);
  const goalDocument = `<section class="document-pane" id="goal-document-pane" data-document-pane aria-label="${escapeHtml(collectionTitle)}">
    <section class="desktop-work-surface" data-work-surface="goals" data-work-surface-label="Goals">${renderedDocumentContent}</section>
  </section>`;
  const stageList = goalsTreeRenderer.renderGoalStageList(view, collection, renderGoalProposals(view));
  const goalStage = showTui ? `<div class="goal-canvas-shell" data-goal-canvas-shell data-record-owner="goals" data-board-view="list">
    ${stageList}
    <section class="goal-work-planning-pane" data-goal-work-planning aria-label="${L("工作规划")}"></section>
    <section class="goal-work-rules-pane settings-stage" data-goal-work-rules aria-label="${L("工作规则")}"></section>
    ${renderMomentumPlaceholder()}
    ${renderGoalKanban(view, selected?.goal.goal_id || "", view.goals)}
    <div class="goal-stage-chrome" data-goal-stage-chrome>${goalsTreeRenderer.renderTreeChrome(view)}
    <div class="mw-toggle-group goal-board-switch" data-slot="toggle-group" data-board-switch role="group" aria-label="${L("列表")} / ${L("画布")} / ${L("看板")}">
      <button class="mw-toggle is-current" type="button" data-board-view-tab="list" aria-pressed="true" aria-current="page" aria-label="${L("列表")}" title="${L("列表")}">${icon("rows")}<span class="goal-board-switch-label">${L("列表")}</span></button>
      <button class="mw-toggle" type="button" data-board-view-tab="canvas" aria-pressed="false" aria-label="${L("画布")}" title="${L("画布")}">${icon("network")}<span class="goal-board-switch-label">${L("画布")}</span></button>
      <button class="mw-toggle" type="button" data-board-view-tab="kanban" aria-pressed="false" aria-label="${L("看板")}" title="${L("看板")}">${icon("columns")}<span class="goal-board-switch-label">${L("看板")}</span></button>
    </div>
    <button class="mw-btn mw-btn--ghost goal-work-planning-toggle" type="button" data-open-work-planning aria-pressed="false" data-craft-tip="${L("工作规划")}">${icon("workflow")}<span>${L("工作规划")}</span></button>
    <button class="mw-btn mw-btn--ghost goal-work-planning-toggle" type="button" data-open-work-rules aria-pressed="false" data-craft-tip="${L("工作规则")}">${icon("shield")}<span>${L("工作规则")}</span></button></div>
    <section class="goal-node-workspace" data-goal-node-workspace aria-label="${L("Goal 工作区")}" hidden>
      ${renderImmersiveGoalHeader(selected?.goal.title || "", primitives)}
      <div class="goal-node-workbench" data-goal-node-workbench>
        <section class="goal-work-main" data-goal-work-main>
          ${renderImmersiveWorkTabs(primitives)}
          ${renderTuiPane(selected, view, cliAvailability)}
        </section>
        ${renderGoalDetailsAside(goalDocument, primitives)}
      </div>
    </section>
  </div>` : `${stageList}${goalDocument}`;
  const frameStage = showTui ? renderGoalFrameStage({ L, icon }) : "";
    return { title, showTui, stage: goalStage, frame: frameStage };
  }
  return { render, renderMolisWorkRefreshFragment };
}
