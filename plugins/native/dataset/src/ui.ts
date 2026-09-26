import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const DATASET_UI_CONTRIBUTION_ID = "io.molis.work.native.dataset.ui.v1";

export type DatasetUiSurface = "directory" | "workbench";

export interface DatasetUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface DatasetUiModel {
  readonly primitives: DatasetUiPrimitives;
}

export const datasetUiDescriptor: UiContributionDescriptor = {
  contribution_id: DATASET_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.dataset",
  kind: "primary-page",
  navigation_id: "dataset",
  label: "Dataset",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const datasetUiContribution: UiContribution<DatasetUiModel> = {
  descriptor: datasetUiDescriptor,
  render(request: UiRenderRequest<DatasetUiModel>): string {
    switch (request.surface as DatasetUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderDatasetWorkbench(request.model);
      default:
        throw new Error(`Dataset UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderDatasetWorkbench(model: DatasetUiModel): string {
  const { primitives: p } = model;
  return renderPluginStageShell({
    surface: "dataset",
    label: "Dataset",
    dataset: "dataset",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-dataset="directory">
      <header class="plugin-stage-chrome dataset-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-dataset-new>${icon("plus")}<span>${p.text("新建数据表")}</span></button>
      </header>
      <div class="mw-empty" data-dataset-empty>
        <span class="mw-empty__mark">${icon("database")}</span>
        <strong>${p.text("还没有数据表")}</strong>
        <p>${p.text("先建一张表，再加列和行。可以粘贴 CSV，也能存一版再回滚。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
        <button class="mw-btn mw-btn--primary" type="button" data-dataset-new>${icon("plus")}<span>${p.text("新建数据表")}</span></button>
      </div>
      <div data-dataset-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-dataset-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-dataset-back aria-label="${p.text("返回数据表列表")}" title="${p.text("返回数据表列表")}">${icon("chevron-right")}</button>
        <h1 data-dataset-editor-title>${p.text("数据表")}</h1>
        <span data-dataset-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-artifact="" data-dataset-artifact-bar>${p.text("保存成果版本")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("更多操作")}">${icon("more")}<span>${p.text("更多")}</span></summary>
          <div class="plugin-stage-more-actions">
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-csv>${p.text("导出 CSV")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-json>${p.text("导出 JSON")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-reload>${p.text("重新读取")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-delete>${p.text("删除")}</button>
          </div>
        </details>
      </div>
      <div class="dataset-workspace">
        <p class="dataset-note" data-dataset-note role="status" aria-live="polite" hidden></p>
        <div class="dataset-identity">
          <label class="dataset-field">${p.text("标题")}<input class="mw-input" data-dataset-title autocomplete="off"></label>
          <label class="dataset-field">${p.text("说明")}<input class="mw-input" data-dataset-description autocomplete="off" placeholder="${p.text("可选")}"></label>
        </div>
        <div class="dataset-toolbar">
          <input class="mw-input" data-dataset-filter autocomplete="off" placeholder="${p.text("筛选格子")}">
          <select class="mw-select" data-dataset-column-type>
            <option value="text">${p.text("文字")}</option>
            <option value="number">${p.text("数字")}</option>
            <option value="date">${p.text("日期")}</option>
          </select>
          <input class="mw-input" data-dataset-column-name autocomplete="off" placeholder="${p.text("列名")}">
          <button class="mw-btn mw-btn--secondary" type="button" data-dataset-add-column>${p.text("加一列")}</button>
          <button class="mw-btn mw-btn--secondary" type="button" data-dataset-add-row>${p.text("加一行")}</button>
        </div>
        <details class="dataset-assist"><summary>${icon("sparkles")}${p.text("AI 辅助加列")}</summary>
        <div class="dataset-prompt">
          <label class="dataset-field">${p.text("列名或 AI 提示")}<input class="mw-input" data-dataset-ai-prompt autocomplete="off" placeholder="${p.text("例如：完成日期")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-dataset-generate><span>${p.text("按列名加列")}</span></button>
          <button class="mw-btn mw-btn--ghost" type="button" data-dataset-generate-ai disabled>${icon("sparkles")}<span>${p.text("AI 拟列名加列")}</span></button>
        </div>
        <p class="dataset-note" data-dataset-ai-reason></p>
        </details>
        <p class="dataset-note" data-dataset-publication-note hidden></p>
        <div class="dataset-table-wrap">
          <p class="dataset-table-empty" data-dataset-table-empty hidden>${p.text("还没有列。先加一列，或打开下面粘贴 CSV。")}</p>
          <p class="dataset-table-empty" data-dataset-filter-empty hidden>${p.text("没有匹配的格子")}</p>
          <table class="mw-table" data-dataset-table hidden></table>
        </div>
        <details class="dataset-panel">
          <summary>${icon("chevron-down")}<span>${p.text("粘贴 CSV 会覆盖当前表")}</span></summary>
          <textarea class="mw-textarea" data-dataset-csv rows="4" placeholder="${p.text("姓名,分数")}"></textarea>
          <button class="mw-btn mw-btn--secondary" type="button" data-dataset-import>${p.text("导入")}</button>
        </details>
        <div class="dataset-versions">
          <div class="dataset-versions-head">
            <strong>${p.text("版本")}</strong>
            <input class="mw-input" data-dataset-version-note autocomplete="off" placeholder="${p.text("备注")}">
            <button class="mw-btn mw-btn--ghost" type="button" data-dataset-snapshot>${p.text("存一版")}</button>
          </div>
          <div data-dataset-versions></div>
        </div>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-dataset-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("确定")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
