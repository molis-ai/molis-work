import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const LINGGUANG_UI_CONTRIBUTION_ID = "io.molis.work.lingguang.ui.v1";

export type LingguangUiSurface = "directory" | "workbench" | "side";

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
    // The same stage as a side panel tab: jot an idea down beside whatever else is open (specs/archive/side-panel).
    { surface_id: "side", target_slot_id: "workbench.side", format: "declarative-html" },
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
      case "side":
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
    extraAttrs: "data-make-todo-scope",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-lingguang="directory">
      <header class="plugin-stage-chrome lingguang-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-lingguang-capture>${icon("plus")}<span>${p.text("记下")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-import-file title="${p.text("把文件里的文字记成一条灵光：文本、PDF、图片和音视频都可以")}">${icon("upload")}<span>${p.text("导入文件")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-read-link title="${p.text("把网页、视频字幕或播客里的文字记成一条灵光")}">${icon("link")}<span>${p.text("读取链接")}</span></button>
        <input type="file" data-lingguang-file accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,image/*,text/*,audio/*,video/*" hidden>
        <div class="lingguang-selection-bar" data-lingguang-selection hidden>
          <span data-lingguang-selected-count></span>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-clear-selection>${p.text("清空")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-discard>${p.text("丢掉")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm>${p.text("头脑风暴")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-dispatch>${p.text("复制内容")}</button>
        </div>
      </header>
      <div class="mw-empty" data-lingguang-empty>
        <span class="mw-empty__mark">${icon("idea")}</span>
        <strong>${p.text("还没有灵光")}</strong>
        <p>${p.text("想法还没想清楚时先扔进来，再决定留下或丢掉。")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-lingguang-capture>${icon("plus")}<span>${p.text("记下第一条灵光")}</span></button>
      </div>
      <p class="lingguang-placement-line" data-placement-target></p>
      <div data-lingguang-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-lingguang-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-lingguang-back aria-label="${p.text("返回灵光列表")}" title="${p.text("返回灵光列表")}">${icon("chevron-right")}</button>
        <h1 data-lingguang-editor-title>${p.text("灵光")}</h1>
        <span data-lingguang-save-status role="status" aria-live="polite"></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-save-retry hidden>${p.text("重试保存")}</button>
        <span data-placement-slot data-placement-saved="off"></span>
        <span class="lingguang-bar-group" data-lingguang-keep-group>
        <button class="mw-btn mw-btn--secondary" type="button" data-lingguang-to-doc title="${p.text("做成一篇可以继续写的文档，记着它来自这条灵光；灵光本身不变")}">${p.text("转成文档")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-to-jelly title="${p.text("做成一篇 Jelly 笔记，记着它来自这条灵光；灵光本身不变")}">${p.text("转成 Jelly 笔记")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-to-goal title="${p.text("在这个位置建一个 Goal，这条灵光作为它的来源")}">${p.text("建成 Goal")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-todo data-make-todo="lingguang" data-make-todo-subject="lingguang_spark" data-make-todo-surface="lingguang" data-make-todo-reason="${p.text("你从灵光转为待办")}">${p.text("转为待办")}</button>
        </span>
        <span class="lingguang-bar-group">
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm-current>${p.text("头脑风暴")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-ask-toggle aria-expanded="false" aria-controls="lingguang-ask">${p.text("交给助理")}</button>
        </span>
        <span class="lingguang-bar-group lingguang-bar-group--quiet">
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-lingguang-dispatch-current aria-label="${p.text("复制内容")}" title="${p.text("复制内容")}">${icon("copy")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-lingguang-discard-current aria-label="${p.text("丢掉")}" title="${p.text("丢掉")}">${icon("trash")}</button>
        </span>
      </div>
      <form class="lingguang-ask" id="lingguang-ask" data-lingguang-ask hidden>
        <input class="mw-input" data-lingguang-ask-input autocomplete="off" aria-label="${p.text("要助理做什么？")}" placeholder="${p.text("要助理做什么？")}">
        <button class="mw-btn mw-btn--primary mw-btn--sm" type="submit">${p.text("交给助理")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-lingguang-ask-bring>${p.text("只带过去，我自己发")}</button>
        <p class="lingguang-note">${p.text("助理只拿到这条灵光和最近几句头脑风暴，不会合并整段对话；它做的修改仍会请你确认。")}</p>
      </form>
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
    <p class="lingguang-note" data-lingguang-note data-make-todo-status role="status" hidden></p>
    <dialog class="mw-dialog creative-confirm" data-lingguang-reading aria-label="${p.text("读取内容")}">
      <form class="creative-confirm-form" method="dialog">
        <p data-lingguang-reading-text>${p.text("正在读取…")}</p>
        <progress class="lingguang-reading-progress" data-lingguang-reading-progress max="1" value="0"></progress>
        <p class="lingguang-note">${p.text("关掉这个窗口会停止读取，不会留下半条灵光。")}</p>
        <div class="creative-confirm-actions"><button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button></div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-lingguang-link aria-label="${p.text("读取链接")}">
      <form class="creative-confirm-form" method="dialog">
        <label class="lingguang-link-field">${p.text("链接")}<input class="mw-input" type="url" data-lingguang-link-input placeholder="https://" autocomplete="off"></label>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--primary" value="ok">${p.text("读取")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-link-cancel>${p.text("取消")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-lingguang-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("丢掉")}</button>
        </div>
      </form>
    </dialog>

  ` });
}
