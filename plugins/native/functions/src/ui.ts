import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import {
  FUNCTION_AUTHORING_SUBJECTS,
  functionAuthoringDestinations,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { icon } from "@molis-ai/molis-work-design-system";

export const FUNCTIONS_UI_CONTRIBUTION_ID = "io.molis.work.native.functions.ui.v1";

export type FunctionsUiSurface = "directory" | "workbench";

export interface FunctionsUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface FunctionsUiModel {
  readonly functions?: readonly unknown[];
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
  const sources = FUNCTION_AUTHORING_SUBJECTS.map((row) => (
    `<label class="functions-chip"><input class="mw-check" type="checkbox" data-functions-source="${p.escape(row.subject_kind)}"><span>${p.text(row.title)}</span></label>`
  )).join("");
  const destinations = functionAuthoringDestinations().map((row) => (
    `<button class="functions-dest" type="button" data-functions-destination="${p.escape(row.destination_id)}" data-kind="${p.escape(row.kind)}">
      <strong>${p.text(row.title)}</strong>
      <small>${p.text(row.when)}</small>
    </button>`
  )).join("");
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="functions" data-work-surface-label="Functions" hidden data-functions="workbench" data-functions-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-functions="directory">
      <header class="plugin-stage-chrome functions-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-functions-new>${icon("plus")}<span>${p.text("新建判断")}</span></button>
      </header>
      <div class="mw-empty" data-functions-empty>
        <span class="mw-empty__mark">${icon("zap")}</span>
        <strong>${p.text("还没有判断")}</strong>
        <p>${p.text("点「新建判断」。")}</p>
      </div>
      <div data-functions-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-functions-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-functions-back aria-label="${p.text("返回列表")}" title="${p.text("返回列表")}">${icon("arrow")}</button>
        <h1 data-functions-editor-title>${p.text("判断")}</h1>
        <span data-functions-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-delete hidden>${p.text("删除草稿")}</button>
      </div>
      <form class="functions-editor" data-functions-editor>
        <label class="functions-field functions-name">${p.text("名称")}<input class="mw-input" data-functions-name autocomplete="off"></label>
        <label class="functions-field">${p.text("函数 key")}<input class="mw-input" data-functions-key spellcheck="false" autocomplete="off"><small>${p.text("发布后不能改。")}</small></label>
        <fieldset class="functions-fieldset" data-functions-sources>
          <legend>${p.text("看什么")}</legend>
          <div class="functions-chips">${sources}</div>
        </fieldset>
        <fieldset class="functions-fieldset" data-functions-destinations>
          <legend>${p.text("用在哪")}</legend>
          <p class="functions-hint" data-functions-choice-only hidden>${p.text("首页、Inbox、Feed 要用 Choice。")}</p>
          <div class="functions-dest-list">${destinations}</div>
        </fieldset>
        <label class="functions-field">${p.text("说明")}<textarea class="mw-input" data-functions-instructions rows="5" placeholder="${p.text("怎么判断")}"></textarea></label>
        <section class="functions-criteria" data-functions-criteria-panel>
          <div class="functions-criteria-head" data-functions-criteria-head>
            <strong data-functions-criteria-label>${p.text("可选动作")}</strong>
            <button class="mw-btn mw-btn--ghost" type="button" data-functions-add-criterion hidden>${p.text("添加")}</button>
          </div>
          <div data-functions-criteria></div>
        </section>
        <section class="functions-try">
          <div class="functions-samples">
            <div class="functions-criteria-head">
              <strong>${p.text("样例")}</strong>
              <button class="mw-btn mw-btn--ghost" type="button" data-functions-save-sample>${p.text("存为样例")}</button>
            </div>
            <div data-functions-samples></div>
          </div>
          <label class="functions-field">${p.text("试一段")}<textarea class="mw-input" data-functions-preview-input rows="5"></textarea></label>
          <div class="functions-actions">
            <button class="mw-btn mw-btn--secondary" type="button" data-functions-preview>${p.text("试跑")}</button>
            <button class="mw-btn mw-btn--primary" type="button" data-functions-publish>${p.text("发布 v1")}</button>
          </div>
          <p class="functions-note" data-functions-note hidden></p>
          <div class="functions-preview" data-functions-last-preview hidden></div>
          <div class="functions-usages" data-functions-usages></div>
        </section>
      </form>
    </div>
    <dialog class="mw-dialog mw-dialog--form" data-functions-create-dialog aria-labelledby="functions-create-title">
      <form class="mw-form mw-dialog__shell" data-functions-create-form>
        <header class="mw-form__header"><div><h2 id="functions-create-title">${p.text("新建判断")}</h2></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-functions-create-close aria-label="${p.text("关闭")}">${icon("x")}</button></header>
        <div class="mw-form__body functions-create-choices">
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="choice">${p.text("Choice")}<small>${p.text("选动作")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="noul">${p.text("Noul")}<small>${p.text("成不成立")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="score">${p.text("Score")}<small>${p.text("打分")}</small></button>
        </div>
      </form>
    </dialog>
  </section>`;
}
