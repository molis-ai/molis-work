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
      <nav class="jelly-tabs" aria-label="${t("Jelly 工作区")}">
        ${button("日历", 'data-jelly-view="calendar" aria-current="page"', "calendar")}
        ${button("笔记", 'data-jelly-view="notes"', "note")}
        ${button("灵感", 'data-jelly-view="inspirations"', "idea")}
        ${button("回顾", 'data-jelly-view="progress"', "check")}
      </nav>
      <div class="jelly-header-actions">
        ${button("撤销", 'data-jelly-undo title="' + t("撤销最近一次修改") + '"', "undo")}
        ${button("重做", 'data-jelly-redo', "redo")}
        ${button("更多", 'data-jelly-more aria-expanded="false" aria-haspopup="menu"', "more")}
        <div class="mw-menu jelly-global-menu" data-jelly-menu hidden role="menu">
          <button type="button" class="mw-menu__item" data-jelly-categories>${icon("tag")}${t("管理分类")}</button>
          <button type="button" class="mw-menu__item" data-jelly-model>${icon("sparkles")}${t("摘要与拆解模型")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export>${icon("download")}${t("导出工作区")}</button>
          <button type="button" class="mw-menu__item" data-jelly-import>${icon("upload")}${t("导入工作区")}</button>
        </div>
      </div>
    </header>
    <div class="plugin-stage-list feed-stage-list feed-stage-tree jelly-main" data-jelly="directory">
      <div class="jelly-toolbar">
        <div class="jelly-period" data-jelly-period>
          ${button("上一段", 'data-jelly-step="-1" class="jelly-icon-button"', "back")}
          <h1 data-jelly-period-title></h1>
          ${button("下一段", 'data-jelly-step="1"', "chevron-right")}
          ${button("今天", "data-jelly-today")}
        </div>
        <div class="jelly-toolbar-end">
          <div class="mw-toggle-group jelly-calendar-modes" data-slot="toggle-group" data-jelly-calendar-modes aria-label="${t("日历视图")}">
            ${button("月", 'data-jelly-mode="month" aria-pressed="true"')}${button("周", 'data-jelly-mode="week" aria-pressed="false"')}${button("列表", 'data-jelly-mode="list" aria-pressed="false"')}
          </div>
          ${button("新建事项", "data-jelly-new", "plus", true)}
        </div>
      </div>
      <div class="jelly-filters">
        <label class="mw-input-group jelly-search">${icon("search")}<input class="mw-input" type="search" data-jelly-search placeholder="${t("搜索标题和内容")}" aria-label="${t("搜索标题和内容")}"></label>
        <div class="jelly-category-filters" data-jelly-category-filters></div>
        <button type="button" class="mw-btn mw-btn--ghost" data-jelly-archived aria-pressed="false" hidden>${t("归档")}</button>
        <button type="button" class="mw-btn mw-btn--ghost" data-jelly-hide-completed aria-pressed="false">${t("隐藏已完成")}</button>
      </div>
      <div data-jelly-content class="jelly-content" aria-live="polite"><p class="jelly-muted">${t("正在打开 Jelly…")}</p></div>
    </div>
    <div class="plugin-stage-workspace jelly-detail" data-jelly-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button type="button" class="plugin-stage-back" data-jelly-back aria-label="${t("返回列表")}" title="${t("返回列表")}">${icon("arrow")}</button>
        <h1 data-jelly-editor-heading>${t("笔记")}</h1><span class="jelly-save-status" data-jelly-save-status></span>
        ${button("拆成任务", "data-jelly-decompose", "sparkles")}
        ${button("归档", "data-jelly-archive", "archive")}
        ${button("更多", 'data-jelly-editor-more aria-expanded="false"', "more")}
        <div class="mw-menu jelly-editor-menu" data-jelly-editor-menu hidden>
          <button type="button" class="mw-menu__item" data-jelly-pin>${t("置顶 / 取消置顶")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export-note>${t("导出 Markdown")}</button>
          <button type="button" class="mw-menu__item" data-jelly-export-note-html>${t("导出 HTML")}</button>
          <button type="button" class="mw-menu__item" data-jelly-import-note>${t("导入笔记内容")}</button>
          <button type="button" class="mw-menu__item mw-menu__item--danger" data-jelly-delete-note>${t("永久删除笔记")}</button>
          <button type="button" class="mw-menu__item mw-menu__item--danger" data-jelly-delete-inspiration hidden>${t("永久删除灵感")}</button>
        </div>
      </div>
      <div class="jelly-document" data-jelly-document></div>
    </div>
    <p class="jelly-notice" role="status" data-jelly-notice hidden></p>
    <dialog class="mw-dialog jelly-item-dialog" data-jelly-item-dialog aria-label="${t("编辑事项")}">
      <form class="jelly-dialog-form" data-jelly-item-form>
        <header><h2 data-jelly-item-heading>${t("新建事项")}</h2>${button("关闭", 'data-jelly-close-dialog="item"', "x")}</header>
        <label class="jelly-field">${t("标题")}<input class="mw-input" data-jelly-field="title" required maxlength="500" autocomplete="off" placeholder="${t("要做什么？")}"></label>
        <div class="jelly-choice-row" data-jelly-kind></div>
        <div class="jelly-form-grid">
          <label class="jelly-field">${t("开始日期")}${dateField("start_date", true)}</label>
          <label class="jelly-field">${t("结束日期")}${dateField("end_date", true)}</label>
          <label class="jelly-field">${t("开始时间")}<input class="mw-input" type="time" data-jelly-field="start_time"></label>
          <label class="jelly-field">${t("结束时间")}<input class="mw-input" type="time" data-jelly-field="end_time"></label>
        </div>
        <p class="jelly-field-hint">${t("不填时间就是全天事项；结束日期可跨天。")}</p>
        <fieldset class="jelly-field"><legend>${t("分类")}</legend><div class="jelly-choice-row" data-jelly-item-categories></div></fieldset>
        <fieldset class="jelly-field"><legend>${t("优先级")}</legend><div class="jelly-choice-row" data-jelly-priority></div></fieldset>
        <label class="jelly-check"><input type="checkbox" class="mw-checkbox" data-jelly-field="pinned">${t("置顶")}</label>
        <fieldset class="jelly-field" data-jelly-recurrence><legend>${t("重复")}</legend><div class="jelly-choice-row" data-jelly-weekdays></div><label class="jelly-field jelly-until">${t("重复截止日期")}${dateField("until")}</label></fieldset>
        <fieldset class="jelly-field" data-jelly-series-scope hidden><legend>${t("修改范围")}</legend><div class="jelly-choice-row" data-jelly-scope-options></div></fieldset>
        <label class="jelly-field">${t("备注")}<textarea class="mw-textarea" rows="3" data-jelly-field="notes"></textarea></label>
        <label class="jelly-field">${t("完成说明")}<textarea class="mw-textarea" rows="2" data-jelly-field="completion_description" placeholder="${t("记录完成了什么，或留下结果链接。")}"></textarea></label>
        <div class="jelly-item-relations" data-jelly-item-relations></div>
        <p class="jelly-form-error" role="alert" data-jelly-item-error hidden></p>
        <footer><div>${button("删除事项", "data-jelly-delete-item", "trash")}</div><div>${button("完成事项", "data-jelly-complete-item", "check")}<button type="submit" class="mw-btn mw-btn--primary">${t("保存")}</button></div></footer>
      </form>
    </dialog>
    <dialog class="mw-dialog jelly-generic-dialog" data-jelly-dialog><form class="jelly-dialog-form" data-jelly-dialog-form><header><h2 data-jelly-dialog-title></h2>${button("关闭", 'data-jelly-close-dialog="generic"', "x")}</header><div data-jelly-dialog-body></div><p role="alert" class="jelly-form-error" data-jelly-dialog-error hidden></p><footer><span></span><div>${button("取消", 'data-jelly-close-dialog="generic"')}<button type="submit" class="mw-btn mw-btn--primary" data-jelly-dialog-ok>${t("确定")}</button></div></footer></form></dialog>
    <input type="file" data-jelly-import-file accept=".json,application/json" hidden>
    <input type="file" data-jelly-material-file accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,image/*,text/*,audio/*,video/*" hidden>
    <input type="file" data-jelly-note-file accept=".md,.markdown,.txt,.html,.htm,text/*" hidden>
  ` });
}
