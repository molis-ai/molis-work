import type { UiContribution, UiContributionDescriptor, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { JELLY_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/jelly";
import { icon, renderDatePicker, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const JELLY_UI_CONTRIBUTION_ID = "io.molis.work.jelly.ui.v1";
export type JellyUiSurface = "directory" | "workbench";
export interface JellyUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}
export interface JellyUiModel { readonly primitives: JellyUiPrimitives }
export const jellyUiDescriptor: UiContributionDescriptor = {
  contribution_id: JELLY_UI_CONTRIBUTION_ID, plugin_id: JELLY_PLUGIN_ID,
  kind: "primary-page", navigation_id: "jelly", label: "Jelly",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ], slots: [],
};
export const jellyUiContribution: UiContribution<JellyUiModel> = {
  descriptor: jellyUiDescriptor,
  render(request: UiRenderRequest<JellyUiModel>): string {
    if (request.surface === "directory") return "";
    if (request.surface === "workbench") return renderJellyWorkbench(request.model);
    throw new Error(`Jelly UI surface ${request.surface} 不存在`);
  },
};

export function renderJellyWorkbench(model: JellyUiModel): string {
  const { primitives: p } = model;
  const t = (s: string) => p.escape(p.text(s));
  const now = new Date();
  const dateField = (name: string, required = false) => renderDatePicker({
    name, placeholder: "YYYY-MM-DD", className: "jelly-date-picker",
    calendar: { year: now.getFullYear(), month: now.getMonth(), compact: true },
  }).replace("data-date-picker-input", `data-jelly-field="${name}" data-date-picker-input${required ? " required" : ""}`);
  const button = (label: string, attr: string, glyph?: Parameters<typeof icon>[0], primary = false) => `<button type="button" class="mw-btn mw-btn--${primary ? "primary" : "ghost"}" aria-label="${t(label)}" ${attr}>${glyph ? icon(glyph) : ""}<span>${t(label)}</span></button>`;
  return renderPluginStageShell({ surface: "jelly", label: "Jelly", dataset: "jelly", body: `
    <header class="jelly-header">
      <nav class="jelly-tabs" aria-label="${t("jelly.page.workspace")}">
        ${button("jelly.view.calendar", 'data-jelly-view="calendar" aria-current="page"', "calendar")}
        ${button("jelly.view.notes", 'data-jelly-view="notes"', "note")}
        ${button("jelly.view.review", 'data-jelly-view="progress"', "check")}
      </nav>
      <div class="jelly-header-actions">
        ${button("jelly.action.undo", 'data-jelly-undo title="' + t("jelly.action.undo-last") + '"', "undo")}
        ${button("jelly.action.redo", 'data-jelly-redo', "redo")}
        ${button("jelly.action.more", 'data-jelly-more aria-expanded="false" aria-haspopup="menu"', "more")}
        <div class="mw-menu jelly-global-menu" data-jelly-menu hidden role="menu">
          <button type="button" class="mw-menu__item" data-jelly-categories>${icon("tag")}${t("jelly.category.manage")}</button>
          <button type="button" class="mw-menu__item" data-jelly-model>${icon("sparkles")}${t("jelly.model.title")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export>${icon("download")}${t("jelly.workspace.export")}</button>
          <button type="button" class="mw-menu__item" data-jelly-import>${icon("upload")}${t("jelly.import.title")}</button>
        </div>
      </div>
    </header>
    <div class="plugin-stage-list feed-stage-list feed-stage-tree jelly-main" data-jelly="directory">
      <div class="jelly-toolbar">
        <div class="jelly-period" data-jelly-period>
          ${button("jelly.nav.previous", 'data-jelly-step="-1" class="jelly-icon-button"', "back")}
          <h1 data-jelly-period-title></h1>
          ${button("jelly.nav.next", 'data-jelly-step="1"', "chevron-right")}
          ${button("jelly.nav.today", "data-jelly-today")}
        </div>
        <div class="jelly-toolbar-end">
          <div class="mw-toggle-group jelly-calendar-modes" data-slot="toggle-group" data-jelly-calendar-modes aria-label="${t("jelly.calendar.view-label")}">
            ${button("jelly.mode.month", 'data-jelly-mode="month" aria-pressed="true"')}${button("jelly.mode.week", 'data-jelly-mode="week" aria-pressed="false"')}${button("jelly.mode.list", 'data-jelly-mode="list" aria-pressed="false"')}
          </div>
          ${button("jelly.item.new", "data-jelly-new", "plus", true)}
        </div>
      </div>
      <div class="jelly-filters">
        <label class="mw-input-group jelly-search">${icon("search")}<input class="mw-input" type="search" data-jelly-search placeholder="${t("jelly.search.placeholder")}" aria-label="${t("jelly.search.placeholder")}"></label>
        <div class="jelly-category-filters" data-jelly-category-filters></div>
        <button type="button" class="mw-btn mw-btn--ghost" data-jelly-archived aria-pressed="false" hidden>${t("jelly.action.archive")}</button>
        <button type="button" class="mw-btn mw-btn--ghost" data-jelly-hide-completed aria-pressed="false">${t("jelly.filter.hide-completed")}</button>
      </div>
      <div data-jelly-content class="jelly-content" aria-live="polite"><p class="jelly-muted">${t("jelly.load.opening")}</p></div>
    </div>
    <div class="plugin-stage-workspace jelly-detail" data-jelly-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button type="button" class="plugin-stage-back" data-jelly-back aria-label="${t("jelly.detail.back")}" title="${t("jelly.detail.back")}">${icon("chevron-right")}</button>
        <h1 data-jelly-editor-heading>${t("jelly.view.notes")}</h1><span class="jelly-save-status" data-jelly-save-status></span><span data-placement-slot data-placement-scope="home" data-placement-saved="off"></span>
        ${button("jelly.plan.decompose", "data-jelly-decompose", "sparkles")}
        ${button("jelly.action.archive", "data-jelly-archive", "archive")}
        ${button("jelly.action.more", 'data-jelly-editor-more aria-expanded="false"', "more")}
        <div class="mw-menu jelly-editor-menu" data-jelly-editor-menu hidden>
          <button type="button" class="mw-menu__item" data-jelly-pin>${t("jelly.note.pin-toggle")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export-note>${t("jelly.note.export-markdown")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export-note-html>${t("jelly.note.export-html")}</button>
          <button type="button" class="mw-menu__item" data-jelly-import-note>${t("jelly.note.import-title")}</button>
          <button type="button" class="mw-menu__item mw-menu__item--danger" data-jelly-delete-note>${t("jelly.note.delete-title")}</button>
        </div>
      </div>
      <div class="jelly-document" data-jelly-document></div>
    </div>
    <p class="jelly-notice" role="status" data-jelly-notice hidden></p>
    <dialog class="mw-dialog jelly-item-dialog" data-jelly-item-dialog aria-label="${t("jelly.item.edit")}">
      <form class="jelly-dialog-form" data-jelly-item-form>
        <header><h2 data-jelly-item-heading>${t("jelly.item.new")}</h2>${button("jelly.action.close", 'data-jelly-close-dialog="item"', "x")}</header>
        <label class="jelly-field">${t("jelly.field.title")}<input class="mw-input" data-jelly-field="title" required maxlength="500" autocomplete="off" placeholder="${t("jelly.field.title-placeholder")}"></label>
        <div class="jelly-choice-row" data-jelly-kind></div>
        <div class="jelly-form-grid">
          <label class="jelly-field">${t("jelly.field.start-date")}${dateField("start_date", true)}</label>
          <label class="jelly-field">${t("jelly.field.end-date")}${dateField("end_date", true)}</label>
          <label class="jelly-field">${t("jelly.field.start-time")}<input class="mw-input" type="time" data-jelly-field="start_time"></label>
          <label class="jelly-field">${t("jelly.field.end-time")}<input class="mw-input" type="time" data-jelly-field="end_time"></label>
        </div>
        <p class="jelly-field-hint">${t("jelly.field.time-hint")}</p>
        <fieldset class="jelly-field"><legend>${t("jelly.field.category")}</legend><div class="jelly-choice-row" data-jelly-item-categories></div></fieldset>
        <fieldset class="jelly-field"><legend>${t("jelly.field.priority")}</legend><div class="jelly-choice-row" data-jelly-priority></div></fieldset>
        <label class="jelly-check"><input type="checkbox" class="mw-check" data-jelly-field="pinned">${t("jelly.field.pinned")}</label>
        <fieldset class="jelly-field" data-jelly-recurrence><legend>${t("jelly.field.repeat")}</legend><div class="jelly-choice-row" data-jelly-weekdays></div><label class="jelly-field jelly-until">${t("jelly.field.repeat-until")}${dateField("until")}</label></fieldset>
        <fieldset class="jelly-field" data-jelly-series-scope hidden><legend>${t("jelly.field.scope")}</legend><div class="jelly-choice-row" data-jelly-scope-options></div></fieldset>
        <label class="jelly-field">${t("jelly.field.notes")}<textarea class="mw-textarea" rows="3" data-jelly-field="notes"></textarea></label>
        <label class="jelly-field">${t("jelly.field.completion-note")}<textarea class="mw-textarea" rows="2" data-jelly-field="completion_description" placeholder="${t("jelly.field.completion-placeholder")}"></textarea></label>
        <div class="jelly-item-relations" data-jelly-item-relations></div>
        <p class="jelly-form-error" role="alert" data-jelly-item-error hidden></p>
        <footer><div>${button("jelly.item.delete", "data-jelly-delete-item", "trash")}</div><div>${button("jelly.item.complete", "data-jelly-complete-item", "check")}<button type="submit" class="mw-btn mw-btn--primary">${t("jelly.action.save")}</button></div></footer>
      </form>
    </dialog>
    <dialog class="mw-dialog jelly-generic-dialog" data-jelly-dialog><form class="jelly-dialog-form" data-jelly-dialog-form><header><h2 data-jelly-dialog-title></h2>${button("jelly.action.close", 'data-jelly-close-dialog="generic"', "x")}</header><div data-jelly-dialog-body></div><p role="alert" class="jelly-form-error" data-jelly-dialog-error hidden></p><footer><span></span><div>${button("jelly.action.cancel", 'data-jelly-close-dialog="generic"')}<button type="submit" class="mw-btn mw-btn--primary" data-jelly-dialog-ok>${t("jelly.action.confirm")}</button></div></footer></form></dialog>
    <input type="file" data-jelly-import-file accept=".json,application/json" hidden>
    <input type="file" data-jelly-note-file accept=".md,.markdown,.txt,.html,.htm,text/*" hidden>
  ` });
}
