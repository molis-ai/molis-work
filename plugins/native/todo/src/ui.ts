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

const VIEWS: readonly [string, string][] = [["today", "todo.date.today"], ["waiting", "todo.view.waiting"], ["unscheduled", "todo.view.unscheduled"], ["upcoming", "todo.view.upcoming"], ["all", "todo.view.all"], ["closed", "todo.status.done"]];
const STATUSES: readonly [string, string][] = [["open", "todo.status.open"], ["doing", "todo.status.doing"], ["waiting", "todo.status.waiting"], ["done", "todo.status.done"], ["cancelled", "todo.status.cancelled"]];
const PLACEMENTS: readonly [string, string][] = [["personal", "todo.place.personal"], ["project", "todo.place.this-project"], ["unassigned", "todo.place.unassigned"]];

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
        <nav class="mw-toggle-group todo-views" data-slot="toggle-group" data-overflow-fade aria-label="${p.text("todo.chrome.views-label")}">
          ${VIEWS.map((view, index) => toggle("data-todo-view", view, index === 0, ` data-todo-view-label="${p.escape(p.text(view[1]))}"`)).join("")}
          <button class="mw-toggle todo-review-toggle" type="button" data-todo-view="review" data-todo-view-label="${p.escape(p.text("todo.view.review"))}" aria-pressed="false" hidden>${p.text("todo.view.review")}</button>
        </nav>
        <div class="todo-chrome-tools">
          <label class="mw-input-group todo-search">${icon("search")}<input class="mw-input" type="search" data-todo-search placeholder="${p.text("todo.chrome.search")}" aria-label="${p.text("todo.chrome.search")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-todo-scope aria-pressed="false" title="${p.text("todo.chrome.all-projects-hint")}">${p.text("todo.chrome.all-projects")}</button>
        </div>
      </header>
      <form class="todo-quick" data-todo-quick autocomplete="off">
        <input class="mw-input todo-quick-input" data-todo-quick-input maxlength="400" aria-label="${p.text("todo.quick.label")}" placeholder="${p.text("todo.quick.placeholder")}">
        <div class="todo-quick-meta">
          <div class="todo-quick-parts" data-todo-quick-parts aria-live="polite"></div>
          <div class="mw-toggle-group todo-quick-placement" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("todo.field.place")}" data-todo-quick-placement>${PLACEMENTS.map(([value, label]) => `<button class="mw-toggle${value === "unassigned" ? " is-current" : ""}" type="button" data-todo-quick-placement-choice="${value}" role="radio" aria-checked="${value === "unassigned"}">${p.text(label)}</button>`).join("")}</div>
          <button class="mw-btn mw-btn--primary" type="submit" data-todo-quick-submit disabled>${icon("plus")}<span>${p.text("todo.quick.add")}</span></button>
        </div>
      </form>
      <section class="todo-reminders" data-todo-reminders aria-label="${p.text("todo.reminder.due-title")}" hidden>
        <h2 data-todo-reminders-title></h2>
        <div data-todo-reminder-rows></div>
      </section>
      <p class="todo-summary" data-todo-summary aria-live="polite"></p>
      <p class="todo-note" data-todo-note role="status" aria-live="polite" hidden><span data-todo-note-text></span><button class="mw-btn mw-btn--link" type="button" data-todo-note-view hidden>${p.text("todo.note.view")}</button><button class="mw-btn mw-btn--link" type="button" data-todo-undo hidden>${p.text("todo.action.undo")}</button></p>
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
      <div class="todo-batch" data-todo-batch hidden role="toolbar" aria-label="${p.text("todo.batch.label")}">
        <strong data-todo-batch-count></strong>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="done">${icon("check")}<span>${p.text("todo.action.complete")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="shift">${p.text("todo.batch.shift")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="today">${p.text("todo.batch.today")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="unplan">${p.text("todo.batch.unplan")}</button>
        <details class="todo-batch-more">
          <summary class="mw-btn mw-btn--ghost">${p.text("todo.batch.move")}</summary>
          <!-- 菜单项是 menuitem；打开 details 不会触发共享 roving 的 MutationObserver（它只观察 hidden/aria-*/role 变化，
               不看 open），所以初始的单一 Tab 停点直接写进 markup，焦点进入后由共享 roving 接管方向键与停点。 -->
          <div class="mw-menu" role="menu">
            ${PLACEMENTS.map(([value, label], index) => `<button class="mw-menu__item" type="button" role="menuitem" tabindex="${index === 0 ? 0 : -1}" data-todo-batch-placement="${value}">${p.text(label)}</button>`).join("")}
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="archive" hidden>${p.text("todo.action.archive")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="clear">${p.text("todo.batch.clear")}</button>
      </div>
    </div>
    <div class="plugin-stage-workspace todo-detail" data-todo-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-todo-back aria-label="${p.text("todo.detail.back")}" title="${p.text("todo.detail.back")}">${icon("chevron-right")}</button>
        <h1 data-todo-editor-heading>${p.text("todo.page.title")}</h1>
        <span data-placement-slot data-placement-saved="off" data-placement-scope="home"></span>
        <span class="mw-status mw-status--quiet" data-todo-save-status></span>
        <button class="mw-btn mw-btn--ghost todo-delegate" type="button" data-todo-delegate title="${p.text("todo.detail.delegate")}">${icon("sparkles")}<span>${p.text("todo.detail.delegate")}</span></button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("todo.detail.more-actions")}">${icon("more")}<span>${p.text("todo.action.more")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-archive>${p.text("todo.action.archive")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-reload>${p.text("todo.action.reload")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-delete>${p.text("todo.action.delete")}</button>
          </div>
        </details>
      </div>
      <p class="todo-note" data-todo-detail-note role="status" aria-live="polite" hidden></p>
      <div class="todo-editor" data-todo-editor>
        <label class="todo-field todo-field--title"><span>${p.text("todo.field.what")}</span><input class="mw-input" data-todo-field="title" maxlength="200"></label>
        <fieldset class="todo-field">
          <legend>${p.text("todo.field.status")}</legend>
          <div class="mw-toggle-group todo-status-choices" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("todo.field.status")}">
            ${STATUSES.map(status => toggle("data-todo-status", status, false)).join("")}
          </div>
        </fieldset>
        <div class="todo-waiting" data-todo-waiting hidden>
          <label class="todo-field"><span>${p.text("todo.field.waiting-who")}</span><input class="mw-input" data-todo-field="waiting.who" maxlength="80" placeholder="${p.text("todo.field.waiting-who-example")}"></label>
          <label class="todo-field"><span>${p.text("todo.field.waiting-what")}</span><input class="mw-input" data-todo-field="waiting.what" maxlength="200" placeholder="${p.text("todo.field.waiting-what-example")}"></label>
          <label class="todo-field"><span>${p.text("todo.field.follow-up")}</span><input class="mw-input" type="date" data-todo-field="waiting.follow_up_on"></label>
        </div>
        <div class="todo-dates">
          <label class="todo-field"><span>${p.text("todo.field.due-date")}</span><small>${p.text("todo.field.due-date-help")}</small><input class="mw-input" type="date" data-todo-field="due_date"></label>
          <label class="todo-field"><span>${p.text("todo.field.due-time")}</span><small>${p.text("todo.field.due-time-help")}</small><input class="mw-input" type="time" data-todo-field="due_time"></label>
          <label class="todo-field"><span>${p.text("todo.field.planned-date-long")}</span><small>${p.text("todo.field.planned-date-help")}</small><input class="mw-input" type="date" data-todo-field="planned_date"></label>
          <label class="todo-field"><span>${p.text("todo.field.remind-at")}</span><small>${p.text("todo.field.remind-at-help")}</small><input class="mw-input" type="datetime-local" data-todo-field="remind_at"></label>
        </div>
        <p class="todo-hint" data-todo-remind-hint hidden>${p.text("todo.field.remind-hint")}</p>
        <fieldset class="todo-field">
          <legend>${p.text("todo.field.place")}</legend>
          <div class="mw-toggle-group todo-placement-choices" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("todo.field.place")}" data-todo-placement-choices></div>
        </fieldset>
        <label class="mw-check-row todo-important"><input class="mw-check" type="checkbox" data-todo-field="important"><span>${p.text("todo.field.important")}</span></label>
        <label class="todo-field"><span>${p.text("todo.field.notes")}</span><textarea class="mw-textarea" rows="5" data-todo-field="notes" placeholder="${p.text("todo.field.notes-placeholder")}"></textarea></label>
        <section class="todo-section">
          <h2>${p.text("todo.section.sources")}</h2>
          <div data-todo-sources></div>
        </section>
        <section class="todo-section" data-todo-works-section hidden>
          <h2>${p.text("todo.link.work")}</h2>
          <div data-todo-works></div>
        </section>
        <section class="todo-section">
          <h2>${p.text("todo.link.title")}</h2>
          <div data-todo-links></div>
          <div class="todo-link-add">
            <select class="mw-select" data-todo-link-target aria-label="${p.text("todo.link.choose")}"></select>
            <select class="mw-select" data-todo-link-relation aria-label="${p.text("todo.link.relation")}">
              <option value="blocked_by">${p.text("todo.relation.blocked-by")}</option>
              <option value="blocks">${p.text("todo.relation.blocks")}</option>
              <option value="related">${p.text("todo.relation.related")}</option>
            </select>
            <button class="mw-btn mw-btn--ghost" type="button" data-todo-link-add>${p.text("todo.link.title")}</button>
          </div>
        </section>
        <section class="todo-section">
          <h2>${p.text("todo.section.history")}</h2>
          <ol class="todo-history" data-todo-history></ol>
        </section>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-todo-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("todo.action.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("todo.action.delete")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
