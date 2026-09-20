import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { FunctionRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { icon } from "@molis-ai/molis-work-design-system";

export const FUNCTIONS_UI_CONTRIBUTION_ID = "io.molis.work.native.functions.ui.v1";

export type FunctionsUiSurface = "directory" | "workbench";

export interface FunctionsUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface FunctionsUiModel {
  readonly functions: readonly FunctionRecord[];
  readonly primitives: FunctionsUiPrimitives;
}

export const functionsUiDescriptor: UiContributionDescriptor = {
  contribution_id: FUNCTIONS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.functions",
  kind: "primary-page",
  navigation_id: "functions",
  label: "Functions",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const functionsUiContribution: UiContribution<FunctionsUiModel> = {
  descriptor: functionsUiDescriptor,
  render(request: UiRenderRequest<FunctionsUiModel>): string {
    switch (request.surface as FunctionsUiSurface) {
      case "directory":
        return renderFunctionsDirectory();
      case "workbench":
        return renderFunctionsWorkbench(request.model);
      default:
        throw new Error(`Functions UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderFunctionsDirectory(): string {
  return "";
}

export function renderFunctionsWorkbench(model: FunctionsUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="functions" data-work-surface-label="Functions" hidden data-functions="workbench" data-functions-stage-shell data-expanded="false">
    <div class="plugin-stage-list" data-functions="directory">
      <header class="plugin-stage-chrome functions-stage-chrome">
        <button class="mw-btn mw-btn--secondary" type="button" data-functions-new>${p.text("新建函数")}</button>
      </header>
      <div class="mw-empty" data-functions-empty>
        <strong>${p.text("还没有判断函数")}</strong>
        <p>${p.text("选 Noul、Choice 或 Score，用真实输入试跑，再发布给 Agent 调用。")}</p>
      </div>
      <div data-functions-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-functions-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-functions-back aria-label="${p.text("返回函数列表")}" title="${p.text("返回函数列表")}">${icon("arrow")}</button>
        <h1 data-functions-editor-title>${p.text("函数")}</h1>
        <span data-functions-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-delete hidden>${p.text("删除草稿")}</button>
      </div>
      <form class="functions-editor" data-functions-editor>
        <section class="functions-define">
          <label class="functions-field">${p.text("名称")}<input class="mw-input" data-functions-name autocomplete="off"></label>
          <label class="functions-field">${p.text("函数 key")}<input class="mw-input" data-functions-key spellcheck="false" autocomplete="off"><small>${p.text("发布后不能改。给调用方看的稳定名字。")}</small></label>
          <label class="functions-field">${p.text("判断说明")}<textarea class="mw-input" data-functions-instructions rows="6"></textarea></label>
          <div class="functions-criteria" data-functions-criteria-panel>
            <div class="functions-criteria-head" data-functions-criteria-head>
              <strong data-functions-criteria-label>${p.text("选项")}</strong>
              <button class="mw-btn mw-btn--ghost" type="button" data-functions-add-criterion>${p.text("添加")}</button>
            </div>
            <div data-functions-criteria></div>
          </div>
        </section>
        <section class="functions-try">
          <div class="functions-samples">
            <div class="functions-criteria-head">
              <strong>${p.text("样例")}</strong>
              <button class="mw-btn mw-btn--ghost" type="button" data-functions-save-sample>${p.text("保存当前输入")}</button>
            </div>
            <div data-functions-samples></div>
          </div>
          <label class="functions-field">${p.text("试跑输入")}<textarea class="mw-input" data-functions-preview-input rows="6"></textarea></label>
          <div class="functions-actions">
            <button class="mw-btn mw-btn--secondary" type="button" data-functions-preview>${p.text("试跑")}</button>
            <button class="mw-btn mw-btn--primary" type="button" data-functions-publish>${p.text("发布 v1")}</button>
          </div>
          <p class="functions-note" data-functions-note hidden></p>
          <div class="functions-preview" data-functions-last-preview hidden></div>
          <div class="functions-usages" data-functions-usages hidden></div>
        </section>
      </form>
    </div>
    <dialog class="mw-dialog mw-dialog--form" data-functions-create-dialog aria-labelledby="functions-create-title">
      <form class="mw-form mw-dialog__shell" data-functions-create-form>
        <header class="mw-form__header"><div><h2 id="functions-create-title">${p.text("新建函数")}</h2><p>${p.text("一函数一题。试跑成功后再发布，Agent 才能调用。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-functions-create-close aria-label="${p.text("关闭")}">${icon("x")}</button></header>
        <div class="mw-form__body functions-create-choices">
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="noul">${p.text("Noul")}<small>${p.text("这是否成立")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="choice">${p.text("Choice")}<small>${p.text("属于哪一类")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="score">${p.text("Score")}<small>${p.text("在有序档位上打分")}</small></button>
        </div>
      </form>
    </dialog>
  </section>`;
}
