import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

export const TODO_UI_CONTRIBUTION_ID = "io.molis.work.native.todo.ui.v1";

export type TodoUiSurface = "directory" | "workbench";

export interface TodoUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface TodoUiModel {
  readonly primitives: TodoUiPrimitives;
}

export const todoUiDescriptor: UiContributionDeclaration = {
  contribution_id: TODO_UI_CONTRIBUTION_ID,
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
const RELATIONS: readonly [string, string][] = [["blocked_by", "todo.relation.blocked-by"], ["blocks", "todo.relation.blocks"], ["related", "todo.relation.related"]];
/** The ring each status draws: the platform's state vocabulary, not a colour of our own. */
const STATUS_RINGS: Record<string, string> = { open: "idle", doing: "doing", waiting: "waiting", done: "done", cancelled: "cancelled" };

const STATUS_HINTS: Record<string, string> = {
  open: "todo.status.open-hint", doing: "todo.status.doing-hint", waiting: "todo.status.waiting-hint", done: "todo.status.done-hint", cancelled: "todo.status.cancelled-hint",
};

/** One status in the status menu: its ring, its name, and a line saying what it means. */
const statusItem = ([value, label]: readonly [string, string]) =>
  `<button class="mw-menu__item mw-menu__item--described" type="button" role="menuitemradio" aria-checked="false" tabindex="${value === "open" ? 0 : -1}" data-todo-status="${value}"><span class="todo-menu-ring" data-mw-state="${STATUS_RINGS[value]}" aria-hidden="true"></span><span data-slot="menu-item-label"><span>${uiText(label)}</span></span><span class="todo-menu-tick" aria-hidden="true">${icon("check")}</span><small class="mw-menu__desc">${uiText(STATUS_HINTS[value]!)}</small></button>`;

/** One row of the side block: its name on the left, its value on the right, the whole row opens its popover. */
const prop = (name: string, glyph: Parameters<typeof icon>[0], label: string) =>
  `<button class="todo-prop" type="button" data-todo-pop-open="${name}" aria-haspopup="dialog" aria-expanded="false">${icon(glyph)}<span class="todo-prop-name">${uiText(label)}</span><span class="todo-prop-value" data-todo-prop-value="${name}"></span>${icon("chevron-down")}</button>`;

export function renderTodoWorkbench(model: TodoUiModel): string {
  const { primitives: p } = model;
  const toggle = (attribute: string, [value, label]: readonly [string, string], current: boolean, extra = "") =>
    `<button class="mw-toggle${current ? " is-current" : ""}" type="button" ${attribute}="${value}" aria-pressed="${current}"${extra}>${uiText(label)}</button>`;
  return renderPluginStageShell({
    surface: "todo",
    label: "待办",
    dataset: "todo",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree todo-list" data-todo="directory">
      <header class="todo-chrome">
        <nav class="mw-toggle-group todo-views" data-slot="toggle-group" data-overflow-fade aria-label="${uiText("todo.chrome.views-label")}">
          ${VIEWS.map((view, index) => toggle("data-todo-view", view, index === 0, ` data-todo-view-label="${uiText(view[1])}"`)).join("")}
          <button class="mw-toggle todo-review-toggle" type="button" data-todo-view="review" data-todo-view-label="${p.escape(uiText.text("todo.view.review"))}" aria-pressed="false" hidden>${uiText("todo.view.review")}</button>
        </nav>
        <div class="todo-chrome-tools" data-help-slot>
          <label class="mw-input-group todo-search">${icon("search")}<input class="mw-input" type="search" data-todo-search placeholder="${uiText("todo.chrome.search")}" aria-label="${uiText("todo.chrome.search")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-todo-scope aria-pressed="false" title="${uiText("todo.chrome.all-projects-hint")}">${uiText("todo.chrome.all-projects")}</button>
        </div>
      </header>
      <form class="todo-quick" data-todo-quick autocomplete="off">
        <input class="mw-input todo-quick-input" data-todo-quick-input maxlength="400" aria-label="${uiText("todo.quick.label")}" placeholder="${uiText("todo.quick.placeholder")}">
        <div class="todo-quick-meta">
          <div class="todo-quick-parts" data-todo-quick-parts aria-live="polite"></div>
          <div class="mw-toggle-group todo-quick-placement" data-slot="toggle-group" role="radiogroup" aria-label="${uiText("todo.field.place")}" data-todo-quick-placement>${PLACEMENTS.map(([value, label]) => `<button class="mw-toggle${value === "unassigned" ? " is-current" : ""}" type="button" data-todo-quick-placement-choice="${value}" role="radio" aria-checked="${value === "unassigned"}">${uiText(label)}</button>`).join("")}</div>
          <button class="mw-btn mw-btn--primary" type="submit" data-todo-quick-submit disabled>${icon("plus")}<span>${uiText("todo.quick.add")}</span></button>
        </div>
      </form>
      <section class="todo-reminders" data-todo-reminders aria-label="${uiText("todo.reminder.due-title")}" hidden>
        <h2 data-todo-reminders-title></h2>
        <div data-todo-reminder-rows></div>
      </section>
      <p class="todo-summary" data-todo-summary aria-live="polite"></p>
      <p class="todo-note" data-todo-note role="status" aria-live="polite" hidden><span data-todo-note-text></span><button class="mw-btn mw-btn--link" type="button" data-todo-note-view hidden>${uiText("todo.note.view")}</button><button class="mw-btn mw-btn--link" type="button" data-todo-undo hidden>${uiText("todo.action.undo")}</button></p>
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
      <div class="todo-batch" data-todo-batch hidden role="toolbar" aria-label="${uiText("todo.batch.label")}">
        <strong data-todo-batch-count></strong>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="done">${icon("check")}<span>${uiText("todo.action.complete")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="shift">${uiText("todo.batch.shift")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="today">${uiText("todo.batch.today")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="unplan">${uiText("todo.batch.unplan")}</button>
        <details class="todo-batch-more">
          <summary class="mw-btn mw-btn--ghost">${uiText("todo.batch.move")}</summary>
          <!-- 菜单项是 menuitem；打开 details 不会触发共享 roving 的 MutationObserver（它只观察 hidden/aria-*/role 变化，
               不看 open），所以初始的单一 Tab 停点直接写进 markup，焦点进入后由共享 roving 接管方向键与停点。 -->
          <div class="mw-menu" role="menu">
            ${PLACEMENTS.map(([value, label], index) => `<button class="mw-menu__item" type="button" role="menuitem" tabindex="${index === 0 ? 0 : -1}" data-todo-batch-placement="${value}">${uiText(label)}</button>`).join("")}
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="archive" hidden>${uiText("todo.action.archive")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-todo-batch-action="clear">${uiText("todo.batch.clear")}</button>
      </div>
    </div>
    <div class="plugin-stage-workspace todo-detail" data-todo-stage-workspace hidden>
      <div class="todo-bar">
        <button class="mw-btn mw-btn--ghost mw-btn--sm todo-back" type="button" data-todo-back title="${uiText("todo.detail.back")}">${icon("chevron-left")}<span>${uiText("todo.page.title")}</span></button>
        <h1 class="mw-sr-only" data-todo-editor-heading>${uiText("todo.page.title")}</h1>
        <span class="todo-save" data-todo-save-status role="status"></span>
      </div>
      <div class="todo-scroll" data-todo-scroll>
        <div class="todo-editor" data-todo-editor>
          <div class="mw-alert mw-alert--warning todo-alert" data-todo-detail-note role="status" aria-live="polite" hidden>
            <p data-todo-detail-note-text></p>
            <div class="mw-alert__actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-todo-reload-here hidden>${uiText("todo.action.reload")}</button></div>
          </div>
          <header class="todo-head">
            <div class="todo-titlebox">
              <textarea class="todo-name" data-todo-field="title" rows="1" maxlength="200" spellcheck="false" aria-label="${uiText("todo.field.what")}" placeholder="${uiText("todo.field.what")}" aria-describedby="todo-title-error"></textarea>
              <p class="todo-title-error" id="todo-title-error" data-todo-title-error role="alert" hidden>${icon("circle-alert")}<span>${uiText("todo.error.title-empty")}</span></p>
            </div>
            <div class="todo-line">
              <button class="mw-status todo-state" type="button" data-todo-pop-open="status" aria-haspopup="menu" aria-expanded="false"><span data-todo-state-name></span>${icon("chevron-down")}</button>
              <span class="mw-status mw-status--idle todo-flag" data-todo-important-flag hidden>${icon("flag")}<span>${uiText("todo.field.important")}</span></span>
              <span class="todo-facts" data-todo-facts></span>
            </div>
            <div class="todo-acts">
              <button class="mw-btn mw-btn--secondary todo-delegate" type="button" data-todo-delegate>${icon("sparkles")}<span>${uiText("todo.detail.delegate")}</span></button>
              <button class="mw-btn mw-btn--primary" type="button" data-todo-complete data-todo-status="done">${icon("check")}<span>${uiText("todo.action.complete")}</span></button>
              <button class="mw-btn mw-btn--ghost" type="button" data-todo-reopen data-todo-status="open" hidden>${icon("undo")}<span>${uiText("todo.action.reopen")}</span></button>
              <button class="mw-btn mw-btn--secondary" type="button" data-todo-archive data-todo-archive-here hidden>${icon("archive")}<span>${uiText("todo.action.archive")}</span></button>
              <details class="plugin-stage-more todo-more">
                <summary class="mw-btn mw-btn--ghost mw-btn--icon-only" aria-label="${uiText("todo.detail.more-actions")}" title="${uiText("todo.detail.more-actions")}">${icon("more")}</summary>
                <div class="mw-menu todo-more-menu" role="menu" aria-label="${uiText("todo.detail.more-actions")}">
                  <div class="mw-menu__group">
                    <button class="mw-menu__item mw-menu__item--described" type="button" role="menuitem" tabindex="0" data-todo-archive data-todo-archive-menu>${icon("archive")}<span data-slot="menu-item-label"><span data-todo-archive-label>${uiText("todo.action.archive")}</span></span><small class="mw-menu__desc" data-todo-archive-hint></small></button>
                    <button class="mw-menu__item mw-menu__item--described" type="button" role="menuitem" tabindex="-1" data-todo-reload>${icon("refresh")}<span data-slot="menu-item-label"><span>${uiText("todo.action.reload")}</span></span><small class="mw-menu__desc">${uiText("todo.action.reload-hint")}</small></button>
                  </div>
                  <div class="mw-menu__group">
                    <button class="mw-menu__item mw-menu__item--danger" type="button" role="menuitem" tabindex="-1" data-todo-delete>${icon("trash")}<span data-slot="menu-item-label">${uiText("todo.action.delete")}</span></button>
                  </div>
                </div>
              </details>
            </div>
          </header>
          <div class="todo-main">
            <section class="todo-now" data-kind="hold" data-todo-waiting aria-label="${uiText("todo.status.waiting")}" hidden>
              <div class="todo-now-head"><span class="mw-status mw-status--hold" data-mw-state="waiting"><span>${uiText("todo.wait.label")}</span></span><span class="todo-fact todo-fact--quiet">${uiText("todo.wait.hint")}</span></div>
              <div class="todo-wait">
                <input class="mw-input" data-todo-field="waiting.who" maxlength="80" aria-label="${uiText("todo.field.waiting-who")}" placeholder="${uiText("todo.wait.who-placeholder")}">
                <input class="mw-input" data-todo-field="waiting.what" maxlength="200" aria-label="${uiText("todo.field.waiting-what")}" placeholder="${uiText("todo.wait.what-placeholder")}">
                <button class="mw-btn mw-btn--ghost" type="button" data-todo-pop-open="follow" aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span data-todo-follow-label></span></button>
              </div>
            </section>
            <section class="todo-works" data-todo-works-section aria-label="${uiText("todo.link.work")}" hidden><div data-todo-works></div></section>
            <textarea class="todo-notes" data-todo-field="notes" rows="2" aria-label="${uiText("todo.field.notes")}" placeholder="${uiText("todo.field.notes-placeholder")}"></textarea>
            <section class="todo-section">
              <h2>${uiText("todo.source.title")}<em data-todo-sources-count></em></h2>
              <div class="todo-sources" data-todo-sources></div>
            </section>
            <section class="todo-section">
              <h2>${uiText("todo.link.title")}<em data-todo-links-count></em><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-todo-pop-open="link" aria-haspopup="dialog" aria-expanded="false">${icon("plus")}<span>${uiText("todo.link.add")}</span></button></h2>
              <div data-todo-links></div>
            </section>
            <details class="todo-hist" data-todo-history-fold>
              <summary>${icon("chevron-right")}${uiText("todo.section.history")}<span data-todo-history-summary></span></summary>
              <ol class="todo-history" data-todo-history></ol>
            </details>
          </div>
          <aside class="todo-rail" aria-label="${uiText("todo.rail.label")}">
            <div class="todo-rail-group">
              <div class="todo-rail-label">${uiText("todo.rail.dates")}</div>
              ${prop("due", "calendar", "todo.prop.due")}
              ${prop("planned", "target", "todo.prop.planned")}
              ${prop("remind", "bell", "todo.prop.remind")}
            </div>
            <div class="todo-rail-group">
              <div class="todo-rail-label">${uiText("todo.field.placement")}</div>
              ${prop("place", "folder", "todo.field.place")}
              <span class="todo-seen" data-placement-slot data-placement-saved="off" data-placement-scope="home"></span>
              <label class="todo-prop todo-prop--switch">${icon("flag")}<span class="todo-prop-name">${uiText("todo.field.important")}</span><span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" data-todo-field="important" aria-label="${uiText("todo.field.important")}"><span class="mw-switch__track" aria-hidden="true"></span></span></label>
            </div>
          </aside>
          ${["due_date", "due_time", "planned_date", "remind_at", "waiting.follow_up_on"].map(name => `<input type="hidden" data-todo-field="${name}">`).join("")}
        </div>
      </div>
      <div class="todo-pop-scrim" data-todo-pop-scrim hidden></div>
      <div class="mw-menu todo-pop" data-todo-pop="status" role="menu" aria-label="${uiText("todo.field.status")}" hidden>
        <div class="mw-menu__group">${STATUSES.slice(0, 3).map(statusItem).join("")}</div>
        <div class="mw-menu__group">${STATUSES.slice(3).map(statusItem).join("")}</div>
      </div>
      <div class="mw-menu todo-pop" data-todo-pop="place" data-todo-placement-choices role="radiogroup" aria-label="${uiText("todo.field.place")}" hidden></div>
      <div class="mw-popover todo-pop todo-date" data-todo-pop="date" role="dialog" hidden>
        <div data-todo-date-quick></div>
        <hr>
        <section class="mw-calendar" data-slot="calendar" data-todo-calendar>
          <header class="mw-calendar__header"><span data-calendar-title></span><div class="mw-group">
            <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-calendar-step="-1" aria-label="${uiText("todo.date.prev-month")}">${icon("chevron-left")}</button>
            <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-calendar-step="1" aria-label="${uiText("todo.date.next-month")}">${icon("chevron-right")}</button>
          </div></header>
          <table class="mw-calendar__grid"><thead><tr>${[...uiText.text("todo.week.letters")].map(day => `<th>${p.escape(day)}</th>`).join("")}</tr></thead><tbody></tbody></table>
        </section>
        <div class="todo-time" data-todo-time hidden>
          <hr>
          <label for="todo-time-input">${uiText("todo.date.time")}</label>
          <div class="todo-time-row"><input class="mw-input" id="todo-time-input" data-todo-time-input placeholder="--:--" inputmode="numeric" maxlength="5">${["09:00", "12:00", "18:00"].map(time => `<button class="mw-toggle" type="button" data-todo-time-choice="${time}" aria-pressed="false">${time}</button>`).join("")}</div>
          <small data-todo-time-help>${uiText("todo.field.due-time-help")}</small>
        </div>
        <p class="todo-pop-hint" data-todo-remind-hint hidden>${uiText("todo.field.remind-hint")}</p>
        <div class="todo-pop-foot"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-todo-date-clear>${uiText("todo.date.clear")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-todo-pop-close>${uiText("todo.date.ok")}</button></div>
      </div>
      <div class="mw-popover todo-pop todo-link-pop" data-todo-pop="link" role="dialog" aria-label="${uiText("todo.link.add")}" hidden>
        <div class="mw-toggle-group" data-slot="toggle-group" role="radiogroup" aria-label="${uiText("todo.link.relation")}">${RELATIONS.map(([value, label], index) => `<button class="mw-toggle${index ? "" : " is-current"}" type="button" role="radio" aria-checked="${!index}" data-todo-link-relation="${value}">${uiText(label)}</button>`).join("")}</div>
        <label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-todo-link-search placeholder="${uiText("todo.link.search")}" aria-label="${uiText("todo.link.search")}"></label>
        <div class="todo-link-list" data-todo-link-list role="listbox" aria-label="${uiText("todo.link.add")}"></div>
      </div>
      <div class="todo-toast" data-todo-toast hidden><div class="mw-toast" data-slot="toast" role="status"><span data-todo-toast-text></span><button class="mw-toast__action" type="button" data-todo-undo hidden>${uiText("todo.action.undo")}</button></div></div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-todo-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${uiText("todo.action.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${uiText("todo.action.delete")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
