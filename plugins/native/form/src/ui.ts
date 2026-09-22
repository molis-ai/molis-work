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
        <p>${p.text("先建一份，再加题目。预览里可以自己填一遍，看结果。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
      </div>
      <div data-form-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-form-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-form-back aria-label="${p.text("返回问卷列表")}" title="${p.text("返回问卷列表")}">${icon("arrow")}</button>
        <h1 data-form-editor-title>${p.text("问卷")}</h1>
        <span data-form-editor-status></span>
        <div class="form-tabs" role="tablist">
          <button class="mw-btn mw-btn--ghost is-current" type="button" role="tab" aria-selected="true" data-form-tab="editor">${p.text("编辑")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="preview">${p.text("预览")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="results">${p.text("结果")}</button>
        </div>
        <button class="mw-btn mw-btn--ghost" type="button" data-form-artifact="" data-form-artifact-bar>${p.text("存成 Artifact")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-form-delete>${p.text("删除")}</button>
      </div>
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
          <label class="form-field">${p.text("按提示加一题")}<input class="mw-input" data-form-ai-prompt autocomplete="off" placeholder="${p.text("例如：你最常用的工具是什么")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-form-generate>${p.text("加题")}</button>
        </div>
        <div class="form-actions">
          <button class="mw-btn mw-btn--primary" type="button" data-form-publish>${p.text("发布")}</button>
        </div>
      </div>
      <form class="form-workspace" data-form-pane="preview" hidden>
        <div data-form-preview></div>
        <div class="form-actions">
          <button class="mw-btn mw-btn--primary" type="submit" data-form-submit>${p.text("提交")}</button>
        </div>
      </form>
      <div class="form-workspace" data-form-pane="results" hidden>
        <p data-form-result-summary></p>
        <div data-form-result-list></div>
        <details class="form-export-panel">
          <summary>${p.text("JSON")}</summary>
          <pre class="form-export" data-form-export></pre>
        </details>
      </div>
      <p class="form-note" data-form-note hidden></p>
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
