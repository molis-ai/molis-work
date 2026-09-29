import type { UiContribution, UiContributionDescriptor, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const TODO_UI_CONTRIBUTION_ID = "io.molis.work.native.todo.ui.v1";

export type TodoUiSurface = "directory" | "workbench";

export interface TodoUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface TodoUiModel {
  readonly primitives: TodoUiPrimitives;
}

export const todoUiDescriptor: UiContributionDescriptor = {
  contribution_id: TODO_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.todo",
  kind: "primary-page",
  navigation_id: "todo",
  label: "待办",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const todoUiContribution: UiContribution<TodoUiModel> = {
  descriptor: todoUiDescriptor,
  render(request: UiRenderRequest<TodoUiModel>): string {
    switch (request.surface as TodoUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderTodoWorkbench(request.model);
      default:
        throw new Error(`Todo UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

const VIEWS: readonly [string, string][] = [["today", "今天"], ["waiting", "等待中"], ["unscheduled", "未安排"], ["upcoming", "即将到期"], ["all", "全部"], ["closed", "已完成"]];
const STATUSES: readonly [string, string][] = [["open", "待处理"], ["doing", "进行中"], ["waiting", "等待他人"], ["done", "已完成"], ["cancelled", "已取消"]];
const PLACEMENTS: readonly [string, string][] = [["personal", "个人"], ["project", "这个项目"], ["unassigned", "暂未归类"]];

export function renderTodoWorkbench(model: TodoUiModel): string {
  const { primitives: p } = model;
  const toggle = (attribute: string, [value, label]: readonly [string, string], current: boolean, extra = "") =>
    `<button class="mw-toggle${current ? " is-current" : ""}" type="button" ${attribute}="${value}" aria-pressed="${current}"${extra}>${p.text(label)}</button>`;
  return renderPluginStageShell({
    surface: "todo",
    label: "待办",
    dataset: "todo",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree todo-list" data-todo="directory">
      <header class="todo-chrome">
        <nav class="mw-toggle-group todo-views" data-slot="toggle-group" aria-label="${p.text("待办视图")}">
          ${VIEWS.map((view, index) => toggle("data-todo-view", view, index === 0, ` data-todo-view-label="${p.escape(p.text(view[1]))}"`)).join("")}
          <button class="mw-toggle todo-review-toggle" type="button" data-todo-view="review" data-todo-view-label="${p.escape(p.text("待你确认"))}" aria-pressed="false" hidden>${p.text("待你确认")}</button>
        </nav>
        <div class="todo-chrome-tools">
          <label class="mw-input-group todo-search">${icon("search")}<input class="mw-input" type="search" data-todo-search placeholder="${p.text("搜索待办")}" aria-label="${p.text("搜索待办")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-todo-scope aria-pressed="false" title="${p.text("也显示其他项目的待办")}">${p.text("所有项目")}</button>
        </div>
      </header>
      <form class="todo-quick" data-todo-quick autocomplete="off">
        <input class="mw-input todo-quick-input" data-todo-quick-input maxlength="400" aria-label="${p.text("记下一件事")}" placeholder="${p.text("记下一件事，例如：周四前给王总回电话")}">
        <div class="todo-quick-meta">
          <div class="todo-quick-parts" data-todo-quick-parts aria-live="polite"></div>
          <div class="mw-toggle-group todo-quick-placement" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("放在")}" data-todo-quick-placement></div>
          <button class="mw-btn mw-btn--primary" type="submit" data-todo-quick-submit disabled>${icon("plus")}<span>${p.text("记下")}</span></button>
        </div>
      </form>
      <section class="todo-reminders" data-todo-reminders aria-label="${p.text("到了时间的提醒")}" hidden>
        <h2 data-todo-reminders-title></h2>
        <div data-todo-reminder-rows></div>
      </section>
      <p class="todo-summary" data-todo-summary aria-live="polite"></p>
      <p class="todo-note" data-todo-note role="status" aria-live="polite" hidden><span data-todo-note-text></span><button class="mw-btn mw-btn--link" type="button" data-todo-undo hidden>${p.text("撤销")}</button></p>
      <div class="todo-loading" data-todo-loading>
        <span class="mw-skeleton"></span><span class="mw-skeleton"></span><span class="mw-skeleton"></span>
      </div>
      <div class="mw-empty todo-empty" data-todo-empty hidden>
        <span class="mw-empty__mark">${icon("list")}</span>
        <strong data-todo-empty-title></strong>
        <p data-todo-empty-text></p>
      </div>
      <div class="todo-rows" data-todo-rows role="list"></div>
      <div class="todo-review" data-todo-review hidden></div>
      <div class="todo-batch" data-todo-batch hidden role="toolbar" aria-label="${p.text("批量处理")}">
        <strong data-todo-batch-count></strong>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="done">${icon("check")}<span>${p.text("完成")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="shift">${p.text("推后一天")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="today">${p.text("安排到今天")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="unplan">${p.text("取消安排")}</button>
        <details class="todo-batch-more">
          <summary class="mw-btn mw-btn--ghost">${p.text("移到")}</summary>
          <div class="mw-menu" role="menu">
            ${PLACEMENTS.map(([value, label]) => `<button class="mw-menu__item" type="button" data-todo-batch-placement="${value}">${p.text(label)}</button>`).join("")}
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="archive" hidden>${p.text("归档")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="clear">${p.text("取消选择")}</button>
      </div>
    </div>
    <div class="plugin-stage-workspace todo-detail" data-todo-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-todo-back aria-label="${p.text("返回待办列表")}" title="${p.text("返回待办列表")}">${icon("chevron-right")}</button>
        <h1 data-todo-editor-heading>${p.text("待办")}</h1>
        <span data-placement-slot data-placement-saved="off" data-placement-scope="home"></span>
        <span class="mw-status mw-status--quiet" data-todo-save-status></span>
        <button class="mw-btn mw-btn--ghost todo-delegate" type="button" data-todo-delegate title="${p.text("交给助理推进")}">${icon("sparkles")}<span>${p.text("交给助理推进")}</span></button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("更多操作")}">${icon("more")}<span>${p.text("更多")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-archive>${p.text("归档")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-reload>${p.text("重新读取")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-delete>${p.text("删除")}</button>
          </div>
        </details>
      </div>
      <p class="todo-note" data-todo-detail-note role="status" aria-live="polite" hidden></p>
      <div class="todo-editor" data-todo-editor>
        <label class="todo-field todo-field--title"><span>${p.text("要做什么")}</span><input class="mw-input" data-todo-field="title" maxlength="200"></label>
        <fieldset class="todo-field">
          <legend>${p.text("状态")}</legend>
          <div class="mw-toggle-group todo-status-choices" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("状态")}">
            ${STATUSES.map(status => toggle("data-todo-status", status, false)).join("")}
          </div>
        </fieldset>
        <div class="todo-waiting" data-todo-waiting hidden>
          <label class="todo-field"><span>${p.text("在等谁")}</span><input class="mw-input" data-todo-field="waiting.who" maxlength="80" placeholder="${p.text("例如：小李")}"></label>
          <label class="todo-field"><span>${p.text("等什么")}</span><input class="mw-input" data-todo-field="waiting.what" maxlength="200" placeholder="${p.text("例如：确认预算")}"></label>
          <label class="todo-field"><span>${p.text("打算哪天跟进")}</span><input class="mw-input" type="date" data-todo-field="waiting.follow_up_on"></label>
        </div>
        <div class="todo-dates">
          <label class="todo-field"><span>${p.text("截止日期")}</span><small>${p.text("最晚什么时候必须完成")}</small><input class="mw-input" type="date" data-todo-field="due_date"></label>
          <label class="todo-field"><span>${p.text("截止时间")}</span><small>${p.text("可不填，不填就是全天")}</small><input class="mw-input" type="time" data-todo-field="due_time"></label>
          <label class="todo-field"><span>${p.text("计划处理日期")}</span><small>${p.text("你打算哪天做")}</small><input class="mw-input" type="date" data-todo-field="planned_date"></label>
          <label class="todo-field"><span>${p.text("提醒时间")}</span><small>${p.text("什么时候提醒你")}</small><input class="mw-input" type="datetime-local" data-todo-field="remind_at"></label>
        </div>
        <p class="todo-hint" data-todo-remind-hint hidden>${p.text("到时间会在底栏提醒你，并受你设的提醒规则约束；Molis Work 关着时不会按时提醒，打开后会补上。")}</p>
        <fieldset class="todo-field">
          <legend>${p.text("放在")}</legend>
          <div class="mw-toggle-group todo-placement-choices" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("放在")}" data-todo-placement-choices></div>
        </fieldset>
        <label class="mw-check-row todo-important"><input class="mw-check" type="checkbox" data-todo-field="important"><span>${p.text("重要")}</span></label>
        <label class="todo-field"><span>${p.text("说明")}</span><textarea class="mw-textarea" rows="5" data-todo-field="notes" placeholder="${p.text("补充细节、背景、下一步")}"></textarea></label>
        <section class="todo-section">
          <h2>${p.text("来源与形成原因")}</h2>
          <div data-todo-sources></div>
        </section>
        <section class="todo-section" data-todo-works-section hidden>
          <h2>${p.text("助理工作")}</h2>
          <div data-todo-works></div>
        </section>
        <section class="todo-section">
          <h2>${p.text("关联")}</h2>
          <div data-todo-links></div>
          <div class="todo-link-add">
            <select class="mw-select" data-todo-link-target aria-label="${p.text("选一件待办")}"></select>
            <select class="mw-select" data-todo-link-relation aria-label="${p.text("关系")}">
              <option value="blocked_by">${p.text("要等它先完成")}</option>
              <option value="blocks">${p.text("它在等这件")}</option>
              <option value="related">${p.text("相关")}</option>
            </select>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-link-add>${p.text("关联")}</button>
          </div>
        </section>
        <section class="todo-section">
          <h2>${p.text("修改记录")}</h2>
          <ol class="todo-history" data-todo-history></ol>
        </section>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-todo-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("删除")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
