import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";

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
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="dataset" data-work-surface-label="Dataset" hidden data-dataset="workbench" data-dataset-stage-shell data-expanded="false">
    <div class="plugin-stage-list" data-dataset="directory">
      <header class="plugin-stage-chrome dataset-stage-chrome">
        <button class="mw-btn mw-btn--secondary" type="button" data-dataset-new>${p.text("新建数据表")}</button>
      </header>
      <div class="mw-empty" data-dataset-empty>
        <strong>${p.text("还没有数据表")}</strong>
        <p>${p.text("先建一张表，再加列和行。可以粘贴 CSV，也能存一版再回滚。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
      </div>
      <div data-dataset-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-dataset-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-dataset-back aria-label="${p.text("返回数据表列表")}" title="${p.text("返回数据表列表")}">${icon("arrow")}</button>
        <h1 data-dataset-editor-title>${p.text("数据表")}</h1>
        <span data-dataset-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-csv>${p.text("导出 CSV")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-json>${p.text("导出 JSON")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-delete>${p.text("删除")}</button>
      </div>
      <div class="dataset-workspace">
        <label class="dataset-field">${p.text("标题")}<input class="mw-input" data-dataset-title autocomplete="off"></label>
        <label class="dataset-field">${p.text("说明")}<textarea class="mw-textarea" data-dataset-description rows="1"></textarea></label>
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
        <div class="dataset-prompt">
          <label class="dataset-field">${p.text("按提示加一列")}<input class="mw-input" data-dataset-ai-prompt autocomplete="off" placeholder="${p.text("例如：完成日期")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-dataset-generate>${p.text("加列")}</button>
        </div>
        <div class="dataset-table-wrap">
          <p class="dataset-table-empty" data-dataset-table-empty hidden>${p.text("还没有列。先加一列，或打开下面粘贴 CSV。")}</p>
          <table class="mw-table" data-dataset-table hidden></table>
        </div>
        <details class="dataset-panel">
          <summary>${p.text("粘贴 CSV 会覆盖当前表")}</summary>
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
        <p class="dataset-note" data-dataset-note hidden></p>
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
  </section>`;
}
