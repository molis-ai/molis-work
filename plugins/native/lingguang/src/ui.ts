import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const LINGGUANG_UI_CONTRIBUTION_ID = "io.molis.work.lingguang.ui.v1";

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
  return renderPluginStageShell({
    surface: "lingguang",
    label: p.text("灵光"),
    dataset: "lingguang",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-lingguang="directory">
      <header class="plugin-stage-chrome lingguang-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-lingguang-capture>${icon("plus")}<span>${p.text("记下")}</span></button>
        <div class="lingguang-selection-bar" data-lingguang-selection hidden>
          <span data-lingguang-selected-count></span>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-clear-selection>${p.text("清空")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-discard>${p.text("丢掉")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm>${p.text("头脑风暴")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-dispatch>${p.text("分发")}</button>
        </div>
      </header>
      <div class="mw-empty" data-lingguang-empty>
        <span class="mw-empty__mark">${icon("idea")}</span>
        <strong>${p.text("还没有灵光")}</strong>
        <p>${p.text("想法还没想清楚时先扔进来，再决定留下或丢掉。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
      </div>
      <div data-lingguang-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-lingguang-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-lingguang-back aria-label="${p.text("返回灵光列表")}" title="${p.text("返回灵光列表")}">${icon("arrow")}</button>
        <h1 data-lingguang-editor-title>${p.text("灵光")}</h1>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-discard-current>${p.text("丢掉")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-dispatch-current>${p.text("分发")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm-current>${p.text("头脑风暴")}</button>
      </div>
      <div class="lingguang-editor" data-lingguang-pane="editor">
        <input class="mw-input lingguang-title" data-lingguang-title autocomplete="off" aria-label="${p.text("标题")}" placeholder="${p.text("先扔进来，还没归类也没关系。")}">
        <textarea class="mw-textarea lingguang-body" data-lingguang-body rows="12" aria-label="${p.text("正文")}" placeholder="${p.text("再说一点")}"></textarea>
      </div>
      <div class="lingguang-chat" data-lingguang-pane="chat" hidden>
        <div class="lingguang-context" data-lingguang-context></div>
        <div data-lingguang-messages></div>
        <form class="lingguang-chat-form" data-lingguang-chat>
          <textarea class="mw-textarea" data-lingguang-chat-input rows="2" aria-label="${p.text("接着往下说")}" placeholder="${p.text("接着往下说")}"></textarea>
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
  ` });
}
