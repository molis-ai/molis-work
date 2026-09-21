import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon } from "@molis-ai/molis-work-design-system";

export const PPT_UI_CONTRIBUTION_ID = "io.molis.work.native.ppt.ui.v1";

export type PptUiSurface = "directory" | "workbench";

export interface PptUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface PptUiModel {
  readonly primitives: PptUiPrimitives;
}

export const pptUiDescriptor: UiContributionDescriptor = {
  contribution_id: PPT_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.ppt",
  kind: "primary-page",
  navigation_id: "ppt",
  label: "PPT",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const pptUiContribution: UiContribution<PptUiModel> = {
  descriptor: pptUiDescriptor,
  render(request: UiRenderRequest<PptUiModel>): string {
    switch (request.surface as PptUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderPptWorkbench(request.model);
      default:
        throw new Error(`PPT UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderPptWorkbench(model: PptUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="ppt" data-work-surface-label="PPT" hidden data-ppt="workbench" data-ppt-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-ppt="directory">
      <header class="plugin-stage-chrome ppt-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-ppt-new>${icon("plus")}<span>${p.text("新建演示稿")}</span></button>
      </header>
      <div class="mw-empty" data-ppt-empty>
        <span class="mw-empty__mark">${icon("image")}</span>
        <strong>${p.text("还没有演示稿")}</strong>
        <p>${p.text("先建一份，再加幻灯片。预览区按页展示，可以导出 JSON。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
      </div>
      <div data-ppt-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-ppt-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-ppt-back aria-label="${p.text("返回演示稿列表")}" title="${p.text("返回演示稿列表")}">${icon("arrow")}</button>
        <h1 data-ppt-editor-title>${p.text("演示稿")}</h1>
        <span data-ppt-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-export>${p.text("导出 JSON")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-delete>${p.text("删除")}</button>
      </div>
      <div class="ppt-workspace">
        <div class="ppt-meta">
          <label class="ppt-field">${p.text("标题")}<input class="mw-input" data-ppt-title autocomplete="off"></label>
          <label class="ppt-field">${p.text("说明")}<input class="mw-input" data-ppt-description autocomplete="off" placeholder="${p.text("可选")}"></label>
          <div class="ppt-colors">
            <label>${p.text("主题色")}<input type="color" data-ppt-color-primary></label>
            <label>${p.text("背景")}<input type="color" data-ppt-color-background></label>
            <label>${p.text("文字")}<input type="color" data-ppt-color-text></label>
          </div>
        </div>
        <div class="ppt-split">
          <div class="ppt-slides">
            <div class="ppt-slides-head">
              <strong>${p.text("幻灯片")}</strong>
              <button class="mw-btn mw-btn--secondary" type="button" data-ppt-add-slide>${p.text("加一页")}</button>
            </div>
            <div data-ppt-slide-list></div>
            <div class="ppt-slide-editor">
              <label class="ppt-field">${p.text("页标题")}<input class="mw-input" data-ppt-slide-title autocomplete="off"></label>
              <label class="ppt-field">${p.text("要点")}<textarea class="mw-textarea" data-ppt-slide-bullets rows="6" placeholder="${p.text("每行一条")}"></textarea></label>
              <label class="ppt-field">${p.text("备注")}<textarea class="mw-textarea" data-ppt-slide-notes rows="2" placeholder="${p.text("讲者备注")}"></textarea></label>
            </div>
          </div>
          <div class="ppt-preview" data-ppt-preview></div>
        </div>
        <p class="ppt-note" data-ppt-note hidden></p>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-ppt-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("取消")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("删除")}</button>
        </div>
      </form>
    </dialog>
  </section>`;
}
