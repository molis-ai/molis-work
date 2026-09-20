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
        <p>${p.text("写一条 Choice：给一段输入，从你定的选项里选出一项。试跑成功后再发布 v1。")}</p>
      </div>
      <div data-functions-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-functions-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-functions-back aria-label="${p.text("返回函数列表")}" title="${p.text("返回函数列表")}">${icon("arrow")}</button>
        <h1 data-functions-editor-title>${p.text("函数")}</h1>
        <span data-functions-editor-status></span>
      </div>
      <form class="functions-editor" data-functions-editor>
        <label class="functions-field">${p.text("名称")}<input class="mw-input" data-functions-name autocomplete="off"></label>
        <label class="functions-field">${p.text("函数 key")}<input class="mw-input" data-functions-key spellcheck="false" autocomplete="off"><small>${p.text("发布后不能改。给调用方看的稳定名字。")}</small></label>
        <label class="functions-field">${p.text("判断说明")}<textarea class="mw-input" data-functions-instructions rows="5"></textarea></label>
        <div class="functions-criteria">
          <div class="functions-criteria-head">
            <strong>${p.text("选项")}</strong>
            <button class="mw-btn mw-btn--ghost" type="button" data-functions-add-criterion>${p.text("添加选项")}</button>
          </div>
          <div data-functions-criteria></div>
        </div>
        <label class="functions-field">${p.text("试跑输入")}<textarea class="mw-input" data-functions-preview-input rows="4"></textarea></label>
        <div class="functions-actions">
          <button class="mw-btn mw-btn--secondary" type="button" data-functions-preview>${p.text("试跑")}</button>
          <button class="mw-btn mw-btn--primary" type="button" data-functions-publish>${p.text("发布 v1")}</button>
        </div>
        <p class="functions-note" data-functions-note hidden></p>
        <pre class="functions-preview" data-functions-last-preview hidden></pre>
      </form>
    </div>
  </section>`;
}
