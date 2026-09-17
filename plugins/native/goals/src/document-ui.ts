import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsDocumentItem, GoalsDocumentContext, GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { renderGoalEventDocument } from "./event-document-ui.js";

function createDocumentRenderer(primitives: GoalsDocumentUiPrimitives) {
  const { translate: L, escapeHtml, icon, formatDate, renderStatus, sectionHeading } = primitives;

  function renderGoalDocument(item: GoalsDocumentItem, context: GoalsDocumentContext, selected: boolean): string {
    return renderGoalEventDocument(item, context, selected, primitives);
  }

  function renderTrashGoalDocument(item: GoalsDocumentItem, selected: boolean): string {
    const goal = item.goal;
    const trashEvent = item.events.find((event) => event.type === "goal.trashed");
    const owner = goal.trashed_by ?? trashEvent?.actor_id ?? L("未记录");
    return `<article class="goal-document trash-goal-document" data-goal-view="${escapeHtml(goal.goal_id)}"${selected ? "" : " hidden"}>
    <section class="goal-hero trash-goal-hero" aria-labelledby="trash-goal-title-${escapeHtml(goal.goal_id)}">
      <header class="goal-header">
        <div class="goal-title-kicker">${renderStatus("trashed")}<dl class="trash-goal-facts"><div>${icon("archive")}<dt>${L("移入于")}</dt><dd>${formatDate(goal.trashed_at)}</dd></div><div>${icon("user")}<dt>${L("操作人")}</dt><dd>${escapeHtml(owner)}</dd></div><div>${icon("history")}<dt>${L("最近更新")}</dt><dd>${formatDate(goal.updated_at)}</dd></div></dl></div>
        <div class="goal-title-row"><div class="goal-title-copy"><h1 id="trash-goal-title-${escapeHtml(goal.goal_id)}">${escapeHtml(goal.title)}</h1><p class="goal-title-outcome">${L("这条 Goal 已从日常列表移除，但内容和历史仍然保留。")}</p></div><div class="goal-title-actions"><button class="mw-btn mw-btn--secondary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复")}</span></button></div></div>
      </header>
    </section>
    <div class="goal-workspace-panels trash-goal-workspace">
    <section class="trash-goal-panel trash-goal-panel--state">
      ${sectionHeading("archive", "回收站状态", "这不是永久删除；恢复后仍是同一个 Goal")}
      <div class="trash-summary"><p><strong>${L("Goal 的内容和完整历史都已保留。")}</strong>${L("移入时仍生效的关联关系会临时停止；恢复时，只有两端都不在回收站的关系才会安全恢复。")}</p>${trashEvent ? `<p><strong>移入原因：</strong>${escapeHtml(trashEvent.reason)}</p>` : ""}</div>
    </section>
    <section class="trash-goal-panel">
      ${sectionHeading("book", "原始目标")}
      <div class="business-copy"><p class="outcome"><strong>${L("要得到的结果：")}</strong>${escapeHtml(goal.outcome || L("待澄清"))}</p><p><strong>${L("为什么做：")}</strong>${escapeHtml(goal.why || L("待澄清"))}</p><p><strong>${L("事情如何运转：")}</strong>${escapeHtml(goal.business_logic || L("待澄清"))}</p></div>
    </section>
    <section class="trash-goal-panel trash-goal-panel--restore">
      ${sectionHeading("refresh", "恢复到 Goal Tree", "恢复不会创建新 Goal，也不会自动启动 Runtime")}
      <div class="trash-restore-row"><p>${L("确认恢复后，这条 Goal 会回到原来的日常列表；如果有关联仍不能安全恢复，系统会保留它们为待处理事实。")}</p><button class="mw-btn mw-btn--primary" type="button" data-open-goal-restore data-goal-id="${escapeHtml(goal.goal_id)}" data-goal-title="${escapeHtml(goal.title)}">${icon("refresh")}<span>${L("恢复这个 Goal")}</span></button></div>
    </section>
    </div>
  </article>`;
  }

  function renderInitialGoalTab(goal: Pick<GoalsDocumentItem["goal"], "goal_id" | "title">): string {
    return `<div class="desktop-work-tab is-selected" data-work-tab-shell="${escapeHtml(goal.goal_id)}"><button type="button" role="tab" data-work-tab="${escapeHtml(goal.goal_id)}" aria-selected="true" aria-controls="goal-document-pane"><i aria-hidden="true"></i><span>${escapeHtml(goal.title)}</span></button><button type="button" data-close-work-tab="${escapeHtml(goal.goal_id)}" aria-label="${escapeHtml(L("关闭 {title}", { title: goal.title }))}">${icon("x")}</button></div>`;
  }
  function renderEmptyGoalCollection(trash: boolean, full: boolean): string {
    const title = trash ? L("回收站是空的") : L("还没有归档 Goal");
    const detail = full ? `<p>${trash ? L("移入回收站的 Goal 可以在这里恢复；日常 Goal Tree 不会被它们干扰。") : L("已完成的 Goal 可以在正文顶部手动归档，历史事实不会被删除。")}</p><a href="/">${L("返回 Goal Tree")}</a>` : "";
    return `<div class="archive-empty">${icon("archive")}<h1>${title}</h1>${detail}</div>`;
  }
  return { renderGoalDocument, renderTrashGoalDocument, renderInitialGoalTab, renderEmptyGoalCollection };
}
export type GoalsDocumentRenderer = ReturnType<typeof createDocumentRenderer>;
export const GOALS_DOCUMENT_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.document.v1";
export type GoalsDocumentUiModel = { primitives: GoalsDocumentUiPrimitives } & (
  | { kind: "document"; args: Parameters<GoalsDocumentRenderer["renderGoalDocument"]> }
  | { kind: "trash"; args: Parameters<GoalsDocumentRenderer["renderTrashGoalDocument"]> }
  | { kind: "initial-tab"; args: Parameters<GoalsDocumentRenderer["renderInitialGoalTab"]> }
  | { kind: "empty-collection"; args: Parameters<GoalsDocumentRenderer["renderEmptyGoalCollection"]> }
);
export const goalsDocumentUiContribution: UiContribution<GoalsDocumentUiModel> = {
  descriptor: {
    contribution_id: GOALS_DOCUMENT_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal document",
    surfaces: ["document", "trash", "initial-tab", "empty-collection"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals document surface does not match its model");
    const renderer = createDocumentRenderer(model.primitives);
    switch (model.kind) {
      case "document": return renderer.renderGoalDocument(...model.args);
      case "trash": return renderer.renderTrashGoalDocument(...model.args);
      case "initial-tab": return renderer.renderInitialGoalTab(...model.args);
      case "empty-collection": return renderer.renderEmptyGoalCollection(...model.args);
    }
  },
};
