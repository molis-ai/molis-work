import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

export const LINGGUANG_UI_CONTRIBUTION_ID = "io.molis.work.lingguang.ui.v1";

export type LingguangUiSurface = "directory" | "workbench" | "side";

export interface LingguangUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface LingguangUiModel {
  readonly primitives: LingguangUiPrimitives;
}

export const lingguangUiDescriptor: UiContributionDeclaration = {
  contribution_id: LINGGUANG_UI_CONTRIBUTION_ID,
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

export function renderLingguangWorkbench(_model: LingguangUiModel): string {
  return renderPluginStageShell({
    surface: "lingguang",
    label: uiText.text("lingguang.page.title"),
    dataset: "lingguang",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-lingguang="directory">
      <header class="plugin-stage-chrome lingguang-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-lingguang-capture>${icon("plus")}<span>${uiText("lingguang.action.capture")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-import-file title="${uiText("lingguang.action.import-hint")}">${icon("upload")}<span>${uiText("lingguang.action.import")}</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-read-link title="${uiText("lingguang.action.link-hint")}">${icon("link")}<span>${uiText("lingguang.action.link")}</span></button>
        <input type="file" data-lingguang-file accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,image/*,text/*,audio/*,video/*" hidden>
        <div class="lingguang-selection-bar" data-lingguang-selection hidden>
          <span data-lingguang-selected-count></span>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-clear-selection>${uiText("lingguang.action.clear")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-discard>${uiText("lingguang.action.discard")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm>${uiText("lingguang.action.brainstorm")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-dispatch>${uiText("lingguang.action.copy")}</button>
        </div>
      </header>
      <div class="mw-empty" data-lingguang-empty>
        <span class="mw-empty__mark">${icon("idea")}</span>
        <strong>${uiText("lingguang.empty.title")}</strong>
        <p>${uiText("lingguang.empty.hint")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-lingguang-capture>${icon("plus")}<span>${uiText("lingguang.empty.capture")}</span></button>
      </div>
      <p class="lingguang-placement-line" data-placement-target></p>
      <div data-lingguang-rows role="listbox" aria-multiselectable="true" aria-label="${uiText("lingguang.page.title")}"></div>
    </div>
    <div class="plugin-stage-workspace" data-lingguang-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-lingguang-back aria-label="${uiText("lingguang.editor.back")}" title="${uiText("lingguang.editor.back")}">${icon("chevron-right")}</button>
        <h1 data-lingguang-editor-title>${uiText("lingguang.page.title")}</h1>
        <span data-lingguang-save-status role="status" aria-live="polite"></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-save-retry hidden>${uiText("lingguang.save.retry")}</button>
        <span data-placement-slot data-placement-saved="off"></span>
        <span class="lingguang-bar-group" data-lingguang-keep-group>
        <button class="mw-btn mw-btn--secondary" type="button" data-lingguang-to-doc title="${uiText("lingguang.convert.doc-hint")}">${uiText("lingguang.convert.doc")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-to-jelly title="${uiText("lingguang.convert.jelly-hint")}">${uiText("lingguang.convert.jelly")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-to-goal title="${uiText("lingguang.convert.goal-hint")}">${uiText("lingguang.convert.goal")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-todo data-context-intake="todo">${uiText("lingguang.convert.todo")}</button>
        </span>
        <span class="lingguang-bar-group">
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-brainstorm-current>${uiText("lingguang.action.brainstorm")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-ask-toggle aria-expanded="false" aria-controls="lingguang-ask">${uiText("lingguang.assistant.hand")}</button>
        </span>
        <span class="lingguang-bar-group lingguang-bar-group--quiet">
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-lingguang-dispatch-current aria-label="${uiText("lingguang.action.copy")}" title="${uiText("lingguang.action.copy")}">${icon("copy")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-lingguang-discard-current aria-label="${uiText("lingguang.action.discard")}" title="${uiText("lingguang.action.discard")}">${icon("trash")}</button>
        </span>
      </div>
      <form class="lingguang-ask" id="lingguang-ask" data-lingguang-ask hidden>
        <input class="mw-input" data-lingguang-ask-input autocomplete="off" aria-label="${uiText("lingguang.assistant.ask")}" placeholder="${uiText("lingguang.assistant.ask")}">
        <button class="mw-btn mw-btn--primary mw-btn--sm" type="submit">${uiText("lingguang.assistant.hand")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-lingguang-ask-bring>${uiText("lingguang.assistant.bring")}</button>
        <p class="lingguang-note">${uiText("lingguang.assistant.note")}</p>
      </form>
      <div class="lingguang-editor" data-lingguang-pane="editor">
        <input class="mw-input lingguang-title" data-lingguang-title autocomplete="off" aria-label="${uiText("lingguang.editor.title-label")}" placeholder="${uiText("lingguang.editor.title-placeholder")}">
        <textarea class="mw-textarea lingguang-body" data-lingguang-body rows="12" aria-label="${uiText("lingguang.editor.body-label")}" placeholder="${uiText("lingguang.editor.body-placeholder")}"></textarea>
      </div>
      <div class="lingguang-chat" data-lingguang-pane="chat" hidden>
        <div class="lingguang-context" data-lingguang-context></div>
        <div data-lingguang-messages></div>
        <form class="lingguang-chat-form" data-lingguang-chat>
          <textarea class="mw-textarea" data-lingguang-chat-input data-fit rows="2" aria-label="${uiText("lingguang.chat.input")}" placeholder="${uiText("lingguang.chat.input")}"></textarea>
          <div class="lingguang-chat-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-chat-stop hidden>${uiText("lingguang.chat.stop")}</button>
            <button class="mw-btn mw-btn--primary" type="submit">${uiText("lingguang.chat.send")}</button>
          </div>
        </form>
      </div>
    </div>
    <p class="lingguang-note" data-lingguang-note role="status" hidden></p>
    <dialog class="mw-dialog creative-confirm" data-lingguang-reading aria-label="${uiText("lingguang.reading.title")}">
      <form class="creative-confirm-form" method="dialog">
        <p data-lingguang-reading-text>${uiText("lingguang.reading.loading")}</p>
        <progress class="lingguang-reading-progress" data-lingguang-reading-progress max="1" value="0"></progress>
        <p class="lingguang-note">${uiText("lingguang.reading.note")}</p>
        <div class="creative-confirm-actions"><button class="mw-btn mw-btn--ghost" value="cancel">${uiText("lingguang.dialog.cancel")}</button></div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-lingguang-link aria-label="${uiText("lingguang.action.link")}">
      <form class="creative-confirm-form" method="dialog">
        <label class="lingguang-link-field">${uiText("lingguang.link.label")}<input class="mw-input" type="url" data-lingguang-link-input placeholder="https://" autocomplete="off"></label>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--primary" value="ok">${uiText("lingguang.link.read")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-lingguang-link-cancel>${uiText("lingguang.dialog.cancel")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-lingguang-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${uiText("lingguang.dialog.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${uiText("lingguang.action.discard")}</button>
        </div>
      </form>
    </dialog>

  ` });
}
