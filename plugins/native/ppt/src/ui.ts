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
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-ppt-new>${icon("plus")}<span>${p.text("ppt.action.new")}</span></button>
      </header>
      <div class="mw-empty" data-ppt-empty>
        <span class="mw-empty__mark">${icon("presentation")}</span>
        <strong>${p.text("ppt.empty.title")}</strong>
        <p>${p.text("ppt.empty.hint")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-ppt-new>${icon("plus")}<span>${p.text("ppt.action.new")}</span></button>
      </div>
      <p class="ppt-placement-line" data-placement-target></p>
      <div data-ppt-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-ppt-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-ppt-back aria-label="${p.text("ppt.editor.back")}" title="${p.text("ppt.editor.back")}">${icon("chevron-right")}</button>
        <h1 data-ppt-editor-title>${p.text("ppt.page.title")}</h1>
        <span data-ppt-editor-status></span>
        <span data-placement-slot data-placement-saved="off"></span>
        <button class="mw-btn mw-btn--primary" type="button" data-ppt-present title="${p.text("ppt.present.hint")}">${icon("arrow")}<span>${p.text("ppt.present.action")}</span></button>
        <details class="plugin-stage-more ppt-export-menu">
          <summary class="mw-btn mw-btn--secondary">${icon("download")}<span>${p.text("ppt.export.menu")}</span></summary>
          <div class="plugin-stage-more-actions">
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-export="pptx">${p.text("ppt.export.pptx")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-export="pdf">${p.text("ppt.export.pdf")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-export="json">${p.text("ppt.export.json")}</button>
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-artifact="" data-ppt-artifact-bar title="${p.text("ppt.fixed.hint")}">${p.text("ppt.fixed.save")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("ppt.more.aria")}">${icon("more")}<span>${p.text("ppt.more.label")}</span></summary>
          <div class="plugin-stage-more-actions">
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-reload>${p.text("ppt.action.reload")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-ppt-delete>${p.text("ppt.action.delete")}</button>
          </div>
        </details>
      </div>
      <p class="ppt-note" data-ppt-note role="status" aria-live="polite" hidden></p>
      <p class="ppt-note" data-ppt-publication-note hidden></p>
      <div class="ppt-workspace">
        <div class="ppt-meta">
          <label class="ppt-field">${p.text("ppt.field.title")}<input class="mw-input" data-ppt-title autocomplete="off"></label>
          <label class="ppt-field">${p.text("ppt.field.description")}<input class="mw-input" data-ppt-description autocomplete="off" placeholder="${p.text("ppt.field.optional")}"></label>
          <div class="ppt-colors">
            ${pptSwatches("primary", PPT_PRIMARY_SWATCHES, p.text("ppt.color.primary"))}
            ${pptSwatches("background", PPT_BACKGROUND_SWATCHES, p.text("ppt.color.background"))}
            ${pptSwatches("text", PPT_TEXT_SWATCHES, p.text("ppt.field.text"))}
          </div>
        </div>
        <div class="ppt-split">
          <div class="ppt-slides">
            <div class="ppt-slides-head">
              <strong>${p.text("ppt.slides.heading")}</strong>
              <button class="mw-btn mw-btn--secondary" type="button" data-ppt-add-slide>${p.text("ppt.slides.add")}</button>
              <button class="mw-btn mw-btn--ghost" type="button" data-ppt-outline-open title="${p.text("ppt.outline.hint")}">${icon("sparkles")}<span>${p.text("ppt.outline.open")}</span></button>
            </div>
            <div data-ppt-slide-list></div>
            <div class="ppt-slide-editor">
              <label class="ppt-field">${p.text("ppt.slide.title")}<input class="mw-input" data-ppt-slide-title autocomplete="off"></label>
              <label class="ppt-field">${p.text("ppt.slide.bullets")}<textarea class="mw-textarea" data-ppt-slide-bullets data-fit rows="6" placeholder="${p.text("ppt.slide.bullets-placeholder")}"></textarea></label>
              <label class="ppt-field">${p.text("ppt.slide.notes")}<textarea class="mw-textarea" data-ppt-slide-notes data-fit rows="2" placeholder="${p.text("ppt.slide.notes-placeholder")}"></textarea></label>
            </div>
          </div>
          <div class="ppt-preview" data-ppt-preview></div>
        </div>
      </div>
    </div>
    <dialog class="mw-dialog mw-dialog--form ppt-outline-dialog" data-ppt-outline-dialog aria-labelledby="ppt-outline-title">
      <form class="mw-form mw-dialog__shell" data-ppt-outline-form>
        <header class="mw-form__header"><div><h2 id="ppt-outline-title">${p.text("ppt.outline.heading")}</h2><p>${p.text("ppt.outline.hint")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-ppt-outline-close aria-label="${p.text("ppt.outline.close")}">${icon("x")}</button></header>
        <div class="mw-form__body">
          <div class="mw-toggle-group ppt-outline-sources" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("ppt.outline.source-label")}" data-ppt-outline-sources>
            <button class="mw-toggle is-current" type="button" role="radio" aria-checked="true" data-ppt-outline-source="text">${p.text("ppt.outline.source-text")}</button>
            <button class="mw-toggle" type="button" role="radio" aria-checked="false" data-ppt-outline-source="page">${icon("note")}<span>${p.text("ppt.outline.source-page")}</span></button>
          </div>
          <label class="mw-field" data-ppt-outline-page-field hidden><span class="mw-field__label">${p.text("ppt.outline.page-label")}</span><select class="mw-select" data-ppt-outline-page></select></label>
          <p class="ppt-note" data-ppt-outline-page-note hidden></p>
          <label class="mw-field" data-ppt-outline-text-field><span class="mw-field__label">${p.text("ppt.field.text")}</span><textarea class="mw-textarea ppt-outline-text" name="text" rows="10" required maxlength="20000" placeholder="# ${p.text("ppt.page.title")}&#10;## ${p.text("ppt.slide.title")}&#10;- ${p.text("ppt.slide.bullets")}&#10;> ${p.text("ppt.slide.notes-placeholder")}" data-ppt-outline-text></textarea></label>
          <div class="mw-toggle-group ppt-outline-modes" data-slot="toggle-group" role="radiogroup" aria-label="${p.text("ppt.outline.mode-label")}" data-ppt-outline-modes>
            <button class="mw-toggle is-current" type="button" role="radio" aria-checked="true" data-ppt-outline-mode="local">${p.text("ppt.outline.mode-local")}</button>
            <button class="mw-toggle" type="button" role="radio" aria-checked="false" data-ppt-outline-mode="ai">${icon("sparkles")}<span>${p.text("ppt.outline.mode-ai")}</span></button>
          </div>
          <p class="ppt-note" data-ppt-outline-ai-reason hidden></p>
          <label class="mw-check-row"><input class="mw-check" type="checkbox" name="replace" data-ppt-outline-replace><span>${p.text("ppt.outline.replace")}</span></label>
          <p class="form-error" data-ppt-outline-error role="alert" hidden></p>
        </div>
        <footer class="mw-form__footer">
          <button class="mw-btn mw-btn--secondary" type="button" data-ppt-outline-close>${p.text("ppt.dialog.cancel")}</button>
          <button class="mw-btn mw-btn--primary" type="submit" data-ppt-outline-submit>${p.text("ppt.outline.submit")}</button>
        </footer>
      </form>
    </dialog>
    <dialog class="mw-dialog creative-confirm" data-ppt-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("ppt.dialog.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("ppt.action.delete")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
