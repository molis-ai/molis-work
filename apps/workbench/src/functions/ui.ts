import {
  FUNCTION_AUTHORING_SUBJECTS,
  functionAuthoringDestinations,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { icon } from "@molis-ai/molis-work-design-system";

export interface FunctionsUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface FunctionsUiModel {
  readonly functions?: readonly unknown[];
  readonly primitives: FunctionsUiPrimitives;
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
  return `<section class="functions-system-editor plugin-stage-shell" data-functions="workbench" data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-functions="directory">
      <header class="plugin-stage-chrome functions-stage-chrome">
        <h1>${p.text("判断规则")}</h1>
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-functions-new>${icon("plus")}<span>${p.text("新建判断")}</span></button>
      </header>
      <p class="functions-note" data-functions-list-note role="status" hidden></p>
      <div class="mw-empty" data-functions-empty>
        <span class="mw-empty__mark">${icon("zap")}</span>
        <strong>${p.text("还没有判断")}</strong>
        <p>${p.text("把重复的判断写成规则，试跑后用在页面或交给 Agent。点「新建判断」开始。") }</p>
      </div>
      <div data-functions-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-functions-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-functions-back aria-label="${p.text("返回列表")}" title="${p.text("返回列表")}">${icon("chevron-right")}</button>
        <h1 data-functions-editor-title>${p.text("判断")}</h1>
        <span data-functions-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-delete hidden>${p.text("删除草稿")}</button>
      </div>
      <form class="functions-editor" data-functions-editor>
        <nav class="functions-steps" aria-label="${p.text("函数设置步骤")}">
          <button type="button" data-functions-step="look" aria-current="step"><span>1</span>${p.text("选择用途")}</button>
          <button type="button" data-functions-step="fn"><span>2</span>${p.text("判断规则")}</button>
          <button type="button" data-functions-step="use"><span>3</span>${p.text("试跑与启用")}</button>
        </nav>
        <div class="functions-columns" data-functions-columns>
          <section class="functions-col" data-functions-col="look" aria-label="${p.text("选择用途")}">
            <header class="functions-section-heading"><h2 tabindex="-1">${p.text("让 AI 帮你做哪种判断？")}</h2><p data-functions-kind-description></p></header>
            <label class="functions-field functions-name">${p.text("名称")}<input class="mw-input" data-functions-name autocomplete="off" placeholder="${p.text("例如：筛选值得跟进的消息")}"></label>
            <fieldset class="functions-fieldset" data-functions-destinations>
              <legend>${p.text("在哪里使用结果")}</legend>
              <p class="functions-hint">${p.text("选择用途后，再写判断规则。也可以先做一个独立函数。")}</p>
              <div class="functions-dest-list">
                <button class="functions-dest" type="button" data-functions-destination="" data-kind="none"><strong>${p.text("独立使用")}</strong><small>${p.text("先写规则、试跑，暂不接入页面。")}</small></button>
                ${destinations}
              </div>
              <p class="functions-hint" data-functions-choice-only hidden>${p.text("评分用于独立试跑或 Agent 调用；页面按钮需要选择或是非判断。")}</p>
              <p class="functions-context-note" data-functions-destination-hint></p>
            </fieldset>
            <details class="functions-details" data-functions-subject-details><summary>${p.text("限定判断对象（可选）")}</summary>
              <fieldset class="functions-fieldset" data-functions-sources><legend>${p.text("判断对象")}</legend>
                <p class="functions-hint">${p.text("不选时显示该用途的全部动作；选择对象只筛选建议动作，不会自动读取数据。")}</p>
                <div class="functions-chips" data-functions-subject-list>${sources}</div>
              </fieldset>
            </details>
          </section>
          <section class="functions-col" data-functions-col="fn" aria-label="${p.text("判断规则")}" hidden>
            <header class="functions-section-heading"><h2 tabindex="-1">${p.text("告诉 AI 怎么判断")}</h2><p>${p.text("写清判断依据，再定义可能的结果。草稿会自动保存。")}</p></header>
            <label class="functions-field">${p.text("判断说明")}<textarea class="mw-input" data-functions-instructions rows="4" placeholder="${p.text("例如：优先跟进与当前项目相关、需要我采取行动的消息；广告和重复内容可以忽略。")}"></textarea></label>
            <section class="functions-criteria" data-functions-criteria-panel>
              <div class="functions-criteria-head" data-functions-criteria-head><strong data-functions-criteria-label>${p.text("返回哪些结果")}</strong><button class="mw-btn mw-btn--ghost" type="button" data-functions-add-criterion hidden>${p.text("添加")}</button></div>
              <p class="functions-hint" data-functions-criteria-hint></p>
              <div data-functions-criteria></div>
              <details class="functions-details" data-functions-palette-details><summary>${p.text("从插件能力中添加结果")}</summary>
                <p class="functions-hint">${p.text("这里只选择判断可能返回的动作，不会执行。Agent 调用还需启用对应工具并满足权限。")} ${p.text("仅列出插件已声明的工具和页面动作。") }</p>
                <label class="functions-field">${p.text("搜索能力")}<input class="mw-input" type="search" data-functions-palette-search placeholder="${p.text("搜索插件、动作或用途")}"></label>
                <div class="functions-palette" data-functions-palette></div>
              </details>
            </section>
            <section class="functions-map" data-functions-map-panel>
              <div class="functions-criteria-head"><strong>${p.text("结果对应的页面动作")}</strong></div>
              <p class="functions-hint">${p.text("每个结果都需要对应一个动作，才能在所选页面启用。")}</p>
              <div data-functions-map></div>
            </section>
            <details class="functions-details"><summary>${p.text("高级：调用标识")}</summary><label class="functions-field">${p.text("函数 key")}<input class="mw-input" data-functions-key spellcheck="false" autocomplete="off"><small>${p.text("供 Agent 和接口调用，已自动生成；发布后不能改。")}</small></label></details>
          </section>
          <section class="functions-col" data-functions-col="use" aria-label="${p.text("试跑与启用")}" hidden>
            <header class="functions-section-heading"><h2 tabindex="-1">${p.text("先试一段，再投入使用")}</h2><p>${p.text("试跑只返回判断结果，不执行选出的动作。TypeSafe 可能收取调用费用。")}</p></header>
            <section class="functions-try">
              <label class="functions-field">${p.text("试跑内容")}<textarea class="mw-input" data-functions-preview-input rows="5" placeholder="${p.text("粘贴一条真实场景中的消息或材料，看看判断是否符合预期。")}"></textarea></label>
              <div class="functions-actions"><button class="mw-btn mw-btn--secondary" type="button" data-functions-preview>${p.text("试跑")}</button><button class="mw-btn mw-btn--ghost" type="button" data-functions-save-sample>${p.text("存为样例")}</button></div>
              <details class="functions-details"><summary>${p.text("已保存的样例")}</summary><div data-functions-samples></div></details>
              <div class="functions-preview" data-functions-last-preview hidden aria-live="polite"></div>
            </section>
            <section class="functions-release"><h3>${p.text("发布与启用")}</h3><p class="functions-hint" data-functions-release-hint></p><button class="mw-btn mw-btn--primary" type="button" data-functions-publish>${p.text("发布 v1")}</button><div class="functions-usages" data-functions-usages></div></section>
          </section>
        </div>
        <footer class="functions-editor-footer">
          <div class="functions-feedback"><span class="functions-save-status" data-functions-save-status role="status"></span><p class="functions-note" data-functions-note role="status" hidden></p></div>
          <div class="functions-actions"><button class="mw-btn mw-btn--ghost" type="button" data-functions-prev>${p.text("上一步")}</button><button class="mw-btn mw-btn--primary" type="button" data-functions-next>${p.text("下一步：判断规则")}</button></div>
        </footer>
      </form>
    </div>
    <dialog class="mw-dialog mw-dialog--form" data-functions-create-dialog aria-labelledby="functions-create-title">
      <form class="mw-form mw-dialog__shell" data-functions-create-form>
        <header class="mw-form__header"><div><h2 id="functions-create-title">${p.text("新建判断")}</h2></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-functions-create-close aria-label="${p.text("关闭")}">${icon("x")}</button></header>
        <div class="mw-form__body functions-create-choices">
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="choice">${p.text("选择一个结果")}<small>${p.text("例如：跟进、保存还是忽略。Choice")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="noul">${p.text("判断是或否")}<small>${p.text("例如：这份材料是否足够。Noul")}</small></button>
          <button class="mw-btn mw-btn--secondary" type="submit" name="primitive" value="score">${p.text("按等级评分")}<small>${p.text("例如：把紧急程度分为低、中、高。Score")}</small></button>
        </div>
        <p class="functions-note is-error" data-functions-create-note role="status"></p>
      </form>
    </dialog>
  </section>`;
}
