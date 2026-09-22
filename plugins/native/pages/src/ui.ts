import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
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
      <span class="pages-template-mark">${icon(item.icon)}</span>
      <span><strong>${p.text(item.title)}</strong><em>${p.text(item.summary)}</em></span>
    </button>`
  )).join("");
  return renderPluginStageShell({
    surface: "pages",
    label: "Pages",
    dataset: "pages",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-pages="directory">
      <header class="plugin-stage-chrome pages-stage-chrome">
        <div class="pages-create">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-pages-new>${icon("plus")}<span>${p.text("新建文档")}</span></button>
          <button class="mw-btn mw-btn--ghost pages-create-more" type="button" data-pages-create-more aria-expanded="false" aria-haspopup="true" aria-label="${p.text("更多新建")}" title="${p.text("更多新建")}">${icon("chevron-down")}</button>
          <div class="mw-menu pages-create-menu" data-pages-create-menu hidden>
            <button class="mw-menu__item" type="button" data-pages-templates>${icon("library")}${p.text("从模板新建")}</button>
            <button class="mw-menu__item" type="button" data-pages-new-folder>${icon("folder")}${p.text("新建文件夹")}</button>
          </div>
        </div>
        <button class="mw-btn mw-btn--ghost pages-import-trigger" type="button" data-pages-import>${icon("upload")}<span>${p.text("导入")}</span></button>
      </header>
      <label class="pages-search mw-input-group">
        ${icon("search")}
        <input class="mw-input" data-pages-search type="search" autocomplete="off" placeholder="${p.text("搜索文档")}" aria-label="${p.text("搜索文档")}">
      </label>
      <div class="mw-empty" data-pages-empty>
        <span class="mw-empty__mark">${icon("note")}</span>
        <strong>${p.text("还没有文档")}</strong>
        <p>${p.text("先建一篇，在纸面上写。刷新之后还在。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-templates>${p.text("从模板新建")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-pages-import>${p.text("导入已有文档")}</button>
      </div>
      <p class="pages-search-empty" data-pages-search-empty hidden>${p.text("没有匹配的文档")}</p>
      <div data-pages-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-pages-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-pages-back aria-label="${p.text("返回文档列表")}" title="${p.text("返回文档列表")}">${icon("arrow")}</button>
        <h1 data-pages-editor-title>${p.text("文档")}</h1>
        <span data-pages-editor-status></span>
        <div class="pages-editor-tools">
          <button class="mw-btn mw-btn--ghost" type="button" data-pages-promote data-pages-artifact-bar>${p.text("存成 Artifact")}</button>
          <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-star-editor aria-label="${p.text("收藏")}" title="${p.text("收藏")}">${icon("star")}</button>
          <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-more aria-expanded="false" aria-haspopup="true" aria-label="${p.text("更多")}" title="${p.text("更多")}">${icon("more")}</button>
          <div class="mw-menu pages-more-menu" data-pages-more-menu hidden>
            <label class="pages-more-field">${p.text("挂到 Goal")}
              <select class="mw-select pages-folder-select" data-pages-goal aria-label="${p.text("挂到 Goal")}"></select>
            </label>
            <hr>
            <button class="mw-menu__item" type="button" data-pages-extract>${icon("sparkles")}${p.text("抽取")}</button>
            <button class="mw-menu__item" type="button" data-pages-promote>${icon("upload")}${p.text("存成 Artifact")}</button>
            <button class="mw-menu__item" type="button" data-pages-export>${icon("download")}${p.text("导出 HTML")}</button>
            <hr>
            <button class="mw-menu__item mw-menu__item--danger" type="button" data-pages-delete>${icon("trash")}${p.text("删除")}</button>
          </div>
        </div>
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
    <div class="mw-menu pages-move-menu" data-pages-move-menu hidden role="menu"></div>
    <dialog class="mw-dialog pages-import-dialog" data-pages-import-dialog aria-labelledby="pages-import-title">
      <div class="pages-import-content">
        <header><h2 id="pages-import-title">${p.text("导入文档")}</h2><p>${p.text("把已有文档带进 Pages，导入后可继续编辑。")}</p></header>
        <label class="pages-import-field">${p.text("文档来自")}
          <select class="mw-select" data-pages-import-source>
            <option value="notion">Notion</option>
            <option value="feishu">${p.text("飞书 / Lark")}</option>
            <option value="other">${p.text("Word、语雀及其他工具")}</option>
          </select>
        </label>
        <p class="pages-import-help" data-pages-import-help></p>
        <label class="pages-import-drop" data-pages-import-drop>
          ${icon("upload")}<strong>${p.text("选择文件，或拖到这里")}</strong>
          <span>ZIP · DOCX · Markdown · HTML · TXT · CSV</span>
          <small>${p.text("支持多选，总计不超过 10 MB；每次最多 100 篇。")}</small>
          <input type="file" data-pages-import-files multiple accept=".zip,.docx,.md,.markdown,.html,.htm,.txt,.csv" aria-label="${p.text("选择要导入的文件")}">
        </label>
        <p class="pages-import-limit">${p.text("图片和附件会转为链接或文字说明；评论、权限和历史版本不导入。")}</p>
        <p class="pages-import-status" data-pages-import-status role="status" aria-live="polite"></p>
        <div data-pages-import-preview hidden>
          <div class="pages-import-options">
            <label><input type="checkbox" data-pages-import-all checked> ${p.text("全选")}</label>
            <label class="pages-import-field">${p.text("导入到")}<select class="mw-select" data-pages-import-folder aria-label="${p.text("导入到")}"></select></label>
          </div>
          <ul class="pages-import-warnings" data-pages-import-warnings></ul>
          <div class="pages-import-documents" data-pages-import-documents></div>
        </div>
        <footer class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" type="button" data-pages-import-close>${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" type="button" data-pages-import-submit disabled>${p.text("导入所选文档")}</button>
          <button class="mw-btn mw-btn--primary" type="button" data-pages-import-open hidden>${p.text("打开文档")}</button>
        </footer>
      </div>
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
  ` });
}
