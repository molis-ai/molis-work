import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { PPT_BACKGROUND_SWATCHES, PPT_PRIMARY_SWATCHES, PPT_TEXT_SWATCHES } from "./colors.js";

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

function pptSwatches(name: string, colors: readonly string[], label: string): string {
  const chips = colors.map((color) => (
    `<button class="ppt-swatch" type="button" role="radio" data-ppt-swatch="${color}" style="background:${color}" aria-label="${color}"></button>`
  )).join("");
  return `<div class="ppt-color-field"><span>${label}</span><div class="ppt-swatches" data-ppt-color-${name} role="radiogroup" aria-label="${label}">${chips}</div></div>`;
}

export function renderPptWorkbench(model: PptUiModel): string {
  const { primitives: p } = model;
  return renderPluginStageShell({
    surface: "ppt",
    label: "PPT",
    dataset: "ppt",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-ppt="directory">
      <header class="plugin-stage-chrome ppt-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-ppt-new>${icon("plus")}<span>${p.text("新建演示稿")}</span></button>
      </header>
      <div class="mw-empty" data-ppt-empty>
        <span class="mw-empty__mark">${icon("image")}</span>
        <strong>${p.text("还没有演示稿")}</strong>
        <p>${p.text("先建一份，再加幻灯片。预览区按页展示，可以导出 JSON。")}</p>
        <p>${p.text("内容属于当前项目，保存在这台电脑。")}</p>
        <button class="mw-btn mw-btn--primary" type="button" data-ppt-new>${icon("plus")}<span>${p.text("新建演示稿")}</span></button>
      </div>
      <div data-ppt-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-ppt-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-ppt-back aria-label="${p.text("返回演示稿列表")}" title="${p.text("返回演示稿列表")}">${icon("chevron-right")}</button>
        <h1 data-ppt-editor-title>${p.text("演示稿")}</h1>
        <span data-ppt-editor-status></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-artifact="" data-ppt-artifact-bar>${p.text("保存成果版本")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("更多操作")}">${icon("more")}<span>${p.text("更多")}</span></summary>
          <div class="plugin-stage-more-actions">
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-export>${p.text("导出 JSON")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-reload>${p.text("重新读取")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-delete>${p.text("删除")}</button>
          </div>
        </details>
      </div>
      <p class="ppt-note" data-ppt-note role="status" aria-live="polite" hidden></p>
      <p class="ppt-note" data-ppt-publication-note hidden></p>
      <div class="ppt-workspace">
        <div class="ppt-meta">
          <label class="ppt-field">${p.text("标题")}<input class="mw-input" data-ppt-title autocomplete="off"></label>
          <label class="ppt-field">${p.text("说明")}<input class="mw-input" data-ppt-description autocomplete="off" placeholder="${p.text("可选")}"></label>
          <div class="ppt-colors">
            ${pptSwatches("primary", PPT_PRIMARY_SWATCHES, p.text("主题色"))}
            ${pptSwatches("background", PPT_BACKGROUND_SWATCHES, p.text("背景"))}
            ${pptSwatches("text", PPT_TEXT_SWATCHES, p.text("文字"))}
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
  ` });
}
