import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const FORM_UI_CONTRIBUTION_ID = "io.molis.work.native.form.ui.v1";

export type FormUiSurface = "directory" | "workbench";

export interface FormUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface FormUiModel {
  readonly primitives: FormUiPrimitives;
}

export const formUiDescriptor: UiContributionDescriptor = {
  contribution_id: FORM_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.form",
  kind: "primary-page",
  navigation_id: "form",
  label: "Forms",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const formUiContribution: UiContribution<FormUiModel> = {
  descriptor: formUiDescriptor,
  render(request: UiRenderRequest<FormUiModel>): string {
    switch (request.surface as FormUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderFormWorkbench(request.model);
      default:
        throw new Error(`Form UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderFormWorkbench(model: FormUiModel): string {
  const { primitives: p } = model;
  return renderPluginStageShell({
    surface: "form",
    label: "Forms",
    dataset: "form",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-form="directory">
      <header class="plugin-stage-chrome form-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-form-new>${icon("plus")}<span>${p.text("新建问卷")}</span></button>
      </header>
      <div class="mw-empty" data-form-empty>
        <span class="mw-empty__mark">${icon("list")}</span>
        <strong>${p.text("还没有问卷")}</strong>
        <p>${p.text("先建一份，再加题目。开始收集后，别人可以在这台电脑上填，或用导出的填写页在自己的浏览器里填。")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-form-new>${icon("plus")}<span>${p.text("新建问卷")}</span></button>
      </div>
      <p class="form-placement-line" data-placement-target></p>
      <div data-form-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-form-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-form-back aria-label="${p.text("返回问卷列表")}" title="${p.text("返回问卷列表")}">${icon("chevron-right")}</button>
        <h1 data-form-editor-title>${p.text("问卷")}</h1>
        <span data-form-editor-status></span>
        <span data-placement-slot data-placement-saved="off"></span>
        <div class="form-tabs" role="tablist">
          <button class="mw-btn mw-btn--ghost is-current" type="button" role="tab" aria-selected="true" data-form-tab="editor">${p.text("编辑")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="preview" title="${p.text("自己先填一遍；提交的会计入结果并标为试填")}">${p.text("试填")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="results">${p.text("结果")}</button>
        </div>
        <span class="form-collect-state" data-form-collect-state></span>
        <button class="mw-btn mw-btn--primary" type="button" data-form-publish title="${p.text("开始在这台电脑上收集答卷；不会生成外网链接")}">${p.text("开始收集")}</button>
        <button class="mw-btn mw-btn--primary" type="button" data-form-fill hidden title="${p.text("整屏填写页，适合把电脑交给别人填")}">${p.text("打开填写页")}</button>
        <details class="plugin-stage-more form-share-menu">
          <summary class="mw-btn mw-btn--secondary">${icon("download")}<span>${p.text("导出")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-form-export-fill>${p.text("填写页文件（发给别人填）")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-export-csv>${p.text("答卷表格（.csv）")}</button>
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-form-artifact="" data-form-artifact-bar title="${p.text("把题目存成不会再变的一版，放进这个位置的成果（Artifacts）；不含答卷")}">${p.text("存为固定版本")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("更多操作")}">${icon("more")}<span>${p.text("更多")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-form-close hidden>${p.text("停止收集")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-reload>${p.text("重新读取")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-delete>${p.text("删除")}</button>
          </div>
        </details>
      </div>
      <p class="form-note" data-form-note role="status" aria-live="polite" hidden></p>
      <p class="form-note" data-form-publication-note hidden></p>
      <div class="form-workspace" data-form-pane="editor">
        <div class="form-identity">
          <label class="form-field">${p.text("标题")}<input class="mw-input" data-form-title autocomplete="off"></label>
          <label class="form-field">${p.text("说明")}<input class="mw-input" data-form-description autocomplete="off" placeholder="${p.text("可选")}"></label>
        </div>
        <div class="form-toolbar">
          <strong>${p.text("题目")}</strong>
          <select class="mw-select" data-form-question-type>
            <option value="text">${p.text("填空")}</option>
            <option value="singleChoice">${p.text("单选")}</option>
            <option value="multiChoice">${p.text("多选")}</option>
            <option value="dropdown">${p.text("下拉")}</option>
            <option value="rating">${p.text("评分")}</option>
            <option value="date">${p.text("日期")}</option>
          </select>
          <button class="mw-btn mw-btn--secondary" type="button" data-form-add-question>${p.text("加一题")}</button>
        </div>
        <div data-form-questions></div>
        <div class="form-prompt">
          <label class="form-field">${p.text("题目或 AI 提示")}<input class="mw-input" data-form-ai-prompt autocomplete="off" placeholder="${p.text("例如：你最常用的工具是什么")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-form-generate>${p.text("按题目加题")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-form-generate-ai disabled>${icon("sparkles")}<span>${p.text("AI 拟题加题")}</span></button>
        </div>
        <p class="form-note" data-form-ai-reason></p>
        <p class="form-note form-collect-help">${p.text("收集答卷不需要网络：在这台电脑上打开填写页让别人填；或导出填写页文件发给对方，对方填完得到答卷文件发回给你，在“结果”里导入。不会生成外网链接。")}</p>
      </div>
      <form class="form-workspace" data-form-pane="preview" hidden>
        <div data-form-preview></div>
        <div class="form-actions">
          <button class="mw-btn mw-btn--primary" type="submit" data-form-submit>${p.text("提交")}</button>
        </div>
      </form>
      <div class="form-workspace" data-form-pane="results" hidden>
        <div class="form-results-head">
          <p data-form-result-summary></p>
          <div class="form-results-actions">
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-import>${p.text("导入答卷文件…")}</button>
            <input type="file" data-form-import-files accept=".json,application/json" multiple hidden>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-export-csv>${p.text("导出 CSV")}</button>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-to-dataset title="${p.text("把现有答卷做成一张可以继续编辑的数据表；之后的新答卷不会自动加入")}">${p.text("存成数据表")}</button>
          </div>
        </div>
        <div class="form-result-stats" data-form-result-stats></div>
        <details class="form-result-details" open>
          <summary>${p.text("逐份答卷")}</summary>
          <div data-form-result-list></div>
        </details>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-form-confirm>
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
