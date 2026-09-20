import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";

export const LINGGUANG_UI_CONTRIBUTION_ID = "io.molis.work.native.lingguang.ui.v1";

export type LingguangUiSurface = "directory" | "workbench";

export interface LingguangUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface LingguangUiModel {
  readonly primitives: LingguangUiPrimitives;
}

export const lingguangUiDescriptor: UiContributionDescriptor = {
  contribution_id: LINGGUANG_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.lingguang",
  kind: "primary-page",
  navigation_id: "lingguang",
  label: "灵光",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const lingguangUiContribution: UiContribution<LingguangUiModel> = {
  descriptor: lingguangUiDescriptor,
  render(request: UiRenderRequest<LingguangUiModel>): string {
    switch (request.surface as LingguangUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderLingguangWorkbench(request.model);
      default:
        throw new Error(`Lingguang UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderLingguangWorkbench(model: LingguangUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="lingguang" data-work-surface-label="${p.text("灵光")}" hidden data-lingguang="workbench" data-lingguang-stage-shell data-expanded="false">
    <div class="plugin-stage-list" data-lingguang="directory">
      <header class="plugin-stage-chrome lingguang-stage-chrome">
        <span data-lingguang-count>0 ${p.text("条")}</span>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-clear-selection>${p.text("清空")}</button>
      </header>
      <div class="mw-empty" data-lingguang-empty>
        <strong>${p.text("还没有灵光")}</strong>
        <p>${p.text("想法还没想清楚时先扔进来，再决定留下或丢掉。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
      </div>
      <div data-lingguang-rows></div>
      <form class="lingguang-composer" data-lingguang-composer>
        <label class="lingguang-field">${p.text("标题")}<input class="mw-input" data-lingguang-capture-title autocomplete="off" placeholder="${p.text("先扔进来，还没归类也没关系。")}"></label>
        <label class="lingguang-field">${p.text("正文")}<textarea class="mw-textarea" data-lingguang-capture-body rows="3"></textarea></label>
        <button class="mw-btn mw-btn--primary" type="submit" data-lingguang-capture>${p.text("记下")}</button>
      </form>
      <div class="lingguang-selection-bar" data-lingguang-selection hidden>
        <span data-lingguang-selected-count></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-discard>${p.text("丢掉")}</button>
        <button class="mw-btn mw-btn--secondary" type="button" data-lingguang-brainstorm>${p.text("头脑风暴")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-dispatch>${p.text("分发")}</button>
      </div>
    </div>
    <div class="plugin-stage-workspace" data-lingguang-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-lingguang-back aria-label="${p.text("返回灵光列表")}" title="${p.text("返回灵光列表")}">${icon("arrow")}</button>
        <h1>${p.text("头脑风暴")}</h1>
      </div>
      <div class="lingguang-chat">
        <div class="lingguang-context" data-lingguang-context></div>
        <div data-lingguang-messages></div>
        <form class="lingguang-chat-form" data-lingguang-chat>
          <label class="lingguang-field">${p.text("接着往下说")}<textarea class="mw-textarea" data-lingguang-chat-input rows="2"></textarea></label>
          <button class="mw-btn mw-btn--primary" type="submit">${p.text("发送")}</button>
        </form>
      </div>
    </div>
    <p class="lingguang-note" data-lingguang-note hidden></p>
    <dialog class="mw-dialog creative-confirm" data-lingguang-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("丢掉")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-lingguang-dispatch>
      <form class="creative-confirm-form" method="dialog">
        <p>${p.text("这次不会写入 Inbox 或 Goal。确认后只复制正文。")}</p>
        <ul class="lingguang-dispatch-candidates">
          <li>${p.text("Inbox")}</li>
          <li>${p.text("Goal")}</li>
          <li>${p.text("Functions")}</li>
        </ul>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok">${p.text("复制正文")}</button>
        </div>
      </form>
    </dialog>
  </section>`;
}
