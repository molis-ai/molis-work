import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";
import { PAGES_TEMPLATES } from "./templates.js";

export const PAGES_UI_CONTRIBUTION_ID = "io.molis.work.native.pages.ui.v1";

export type PagesUiSurface = "directory" | "workbench";

export interface PagesUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface PagesUiModel {
  readonly primitives: PagesUiPrimitives;
}

export const pagesUiDescriptor: UiContributionDescriptor = {
  contribution_id: PAGES_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.pages",
  kind: "primary-page",
  navigation_id: "pages",
  label: "Pages",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const pagesUiContribution: UiContribution<PagesUiModel> = {
  descriptor: pagesUiDescriptor,
  render(request: UiRenderRequest<PagesUiModel>): string {
    switch (request.surface as PagesUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderPagesWorkbench(request.model);
      default:
        throw new Error(`Pages UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderPagesWorkbench(model: PagesUiModel): string {
  const { primitives: p } = model;
  const templates = PAGES_TEMPLATES.map((item) => (
    `<button class="mw-btn mw-btn--ghost pages-template-item" type="button" data-pages-template="${p.escape(item.id)}">
      <strong>${p.text(item.title)}</strong>
      <span>${p.text(item.summary)}</span>
    </button>`
  )).join("");
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="pages" data-work-surface-label="Pages" hidden data-pages="workbench" data-pages-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-pages="directory">
      <header class="plugin-stage-chrome pages-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-pages-new>${icon("plus")}<span>${p.text("新建文档")}</span></button>
        <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-new-folder aria-label="${p.text("新建文件夹")}" title="${p.text("新建文件夹")}">${icon("folder")}</button>
        <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-templates aria-label="${p.text("从模板新建")}" title="${p.text("从模板新建")}">${icon("note")}</button>
      </header>
      <label class="tree-search pages-search">
        ${icon("search")}
        <input data-pages-search type="search" autocomplete="off" placeholder="${p.text("搜索文档")}" aria-label="${p.text("搜索文档")}">
      </label>
      <div class="mw-empty" data-pages-empty>
        <strong>${p.text("还没有文档")}</strong>
        <p>${p.text("先建一篇，在纸面上写。刷新之后还在。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-templates>${p.text("从模板新建")}</button>
      </div>
      <p class="pages-search-empty" data-pages-search-empty hidden>${p.text("没有匹配的文档")}</p>
      <div data-pages-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-pages-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-pages-back aria-label="${p.text("返回文档列表")}" title="${p.text("返回文档列表")}">${icon("arrow")}</button>
        <h1 data-pages-editor-title>${p.text("文档")}</h1>
        <span data-pages-editor-status></span>
        <select class="mw-select pages-folder-select" data-pages-folder aria-label="${p.text("文件夹")}"></select>
        <select class="mw-select pages-folder-select" data-pages-goal aria-label="${p.text("挂到 Goal")}"></select>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-star-editor aria-label="${p.text("收藏")}">${p.text("收藏")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-extract>${p.text("抽取")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-promote>${p.text("Promote")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-export>${p.text("导出 HTML")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-delete>${p.text("删除")}</button>
      </div>
      <div class="pages-workspace" data-pages-pane="editor">
        <input class="pages-title" data-pages-title data-plain-field autocomplete="off" placeholder="${p.text("无标题")}">
        <div class="pages-editor-host" data-pages-editor></div>
      </div>
      <p class="pages-note" data-pages-note hidden></p>
    </div>
    <dialog class="mw-dialog creative-confirm" data-pages-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("删除")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-pages-name>
      <form class="creative-confirm-form" method="dialog">
        <p data-name-label></p>
        <input class="mw-input" data-name-input autocomplete="off">
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok">${p.text("确定")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog pages-template-dialog" data-pages-template-dialog>
      <form class="creative-confirm-form" method="dialog">
        <p>${p.text("从模板新建")}</p>
        <div class="pages-template-list" data-pages-template-list>${templates}</div>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
        </div>
      </form>
    </dialog>
  </section>`;
}
