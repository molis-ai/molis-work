import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

export const FORM_UI_CONTRIBUTION_ID = "io.molis.work.native.form.ui.v1";

export type FormUiSurface = "directory" | "workbench";

export interface FormUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface FormUiModel {
  readonly primitives: FormUiPrimitives;
}

export const formUiDescriptor: UiContributionDeclaration = {
  contribution_id: FORM_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "form",
  label: "Forms",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const formUiContribution: UiContribution<FormUiModel> = {
  descriptor: formUiDescriptor,
  render(request: UiRenderRequest<FormUiModel>): string {
    switch (request.surface as FormUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderFormWorkbench(request.model);
      default:
        throw new Error(`Form UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderFormWorkbench(model: FormUiModel): string {
  const { primitives: p } = model;
  return renderPluginStageShell({
    surface: "form",
    label: "Forms",
    dataset: "form",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-form="directory">
      <header class="plugin-stage-chrome form-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-form-new>${icon("plus")}<span>${p.text("form.action.new")}</span></button>
      </header>
      <div class="mw-empty" data-form-empty>
        <span class="mw-empty__mark">${icon("clipboard")}</span>
        <strong>${p.text("form.empty.title")}</strong>
        <p>${p.text("form.empty.hint")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-form-new>${icon("plus")}<span>${p.text("form.action.new")}</span></button>
      </div>
      <p class="form-placement-line" data-placement-target></p>
      <div data-form-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-form-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-form-back aria-label="${p.text("form.editor.back")}" title="${p.text("form.editor.back")}">${icon("chevron-right")}</button>
        <h1 data-form-editor-title>${p.text("form.page.title")}</h1>
        <span data-form-editor-status></span>
        <span data-placement-slot data-placement-saved="off"></span>
        <div class="form-tabs" role="tablist">
          <button class="mw-btn mw-btn--ghost is-current" type="button" role="tab" aria-selected="true" data-form-tab="editor">${p.text("form.tab.edit")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="preview" title="${p.text("form.try.hint")}">${p.text("form.try.label")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" role="tab" aria-selected="false" data-form-tab="results">${p.text("form.tab.result")}</button>
        </div>
        <span class="form-collect-state" data-form-collect-state></span>
        <button class="mw-btn mw-btn--primary" type="button" data-form-publish title="${p.text("form.collect.hint")}">${p.text("form.collect.start")}</button>
        <button class="mw-btn mw-btn--primary" type="button" data-form-fill hidden title="${p.text("form.fill.open-hint")}">${p.text("form.fill.open")}</button>
        <details class="plugin-stage-more form-share-menu">
          <summary class="mw-btn mw-btn--secondary">${icon("download")}<span>${p.text("form.export.menu")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-form-export-fill>${p.text("form.export.fill-file")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-export-csv>${p.text("form.export.csv")}</button>
          </div>
        </details>
        <button class="mw-btn mw-btn--ghost" type="button" data-form-artifact="" data-form-artifact-bar title="${p.text("form.fixed.hint")}">${p.text("form.fixed.save")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("form.more.aria")}">${icon("more")}<span>${p.text("form.more.label")}</span></summary>
          <div class="plugin-stage-more-actions">
            <button class="mw-btn mw-btn--ghost" type="button" data-form-close hidden>${p.text("form.collect.stop")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-reload>${p.text("form.action.reload")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-form-delete>${p.text("form.action.delete")}</button>
          </div>
        </details>
      </div>
      <p class="form-note" data-form-note role="status" aria-live="polite" hidden></p>
      <p class="form-note" data-form-publication-note hidden></p>
      <div class="form-workspace" data-form-pane="editor">
        <div class="form-identity">
          <label class="form-field">${p.text("form.field.title")}<input class="mw-input" data-form-title autocomplete="off"></label>
          <label class="form-field">${p.text("form.field.description")}<input class="mw-input" data-form-description autocomplete="off" placeholder="${p.text("form.field.optional")}"></label>
        </div>
        <div data-form-questions></div>
        <div class="form-add-row" data-form-add-row>
          <button class="mw-btn mw-btn--secondary" type="button" data-form-add-question>${icon("plus")}<span>${p.text("form.question.add")}</span></button>
          <select class="mw-select" data-form-question-type hidden aria-hidden="true" tabindex="-1">
            <option value="text">${p.text("form.type.text")}</option>
            <option value="singleChoice">${p.text("form.type.single")}</option>
            <option value="multiChoice">${p.text("form.type.multi")}</option>
            <option value="dropdown">${p.text("form.type.dropdown")}</option>
            <option value="rating">${p.text("form.type.rating")}</option>
            <option value="date">${p.text("form.type.date")}</option>
          </select>
          <div class="mw-toggle-group form-add-types" data-slot="toggle-group" role="group" aria-label="${p.text("form.question.add-type")}">
            <button class="mw-toggle" type="button" data-form-add-question="text">${p.text("form.type.text")}</button>
            <button class="mw-toggle" type="button" data-form-add-question="singleChoice">${p.text("form.type.single")}</button>
            <button class="mw-toggle" type="button" data-form-add-question="multiChoice">${p.text("form.type.multi")}</button>
            <button class="mw-toggle" type="button" data-form-add-question="dropdown">${p.text("form.type.dropdown")}</button>
            <button class="mw-toggle" type="button" data-form-add-question="rating">${p.text("form.type.rating")}</button>
            <button class="mw-toggle" type="button" data-form-add-question="date">${p.text("form.type.date")}</button>
          </div>
        </div>
        <div class="form-prompt">
          <label class="form-field">${p.text("form.ai.prompt-label")}<input class="mw-input" data-form-ai-prompt autocomplete="off" placeholder="${p.text("form.ai.prompt-placeholder")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-form-generate>${p.text("form.ai.add-this")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-form-generate-ai disabled>${icon("sparkles")}<span>${p.text("form.ai.draft")}</span></button>
        </div>
        <div class="form-draft-ask" data-form-draft-ask hidden></div>
        <p class="form-note" data-form-ai-reason></p>
      </div>
      <form class="form-workspace" data-form-pane="preview" hidden>
        <div data-form-preview></div>
        <div class="form-actions">
          <button class="mw-btn mw-btn--primary" type="submit" data-form-submit>${p.text("form.fill.submit")}</button>
        </div>
      </form>
      <div class="form-workspace" data-form-pane="results" hidden>
        <div class="form-results-head">
          <p data-form-result-summary></p>
          <div class="form-results-actions">
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-import>${p.text("form.import.action")}</button>
            <input type="file" data-form-import-files accept=".json,application/json" multiple hidden>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-export-csv>${p.text("form.export.csv-button")}</button>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-form-to-dataset title="${p.text("form.dataset.hint")}">${p.text("form.dataset.save")}</button>
          </div>
        </div>
        <div class="form-result-stats" data-form-result-stats></div>
        <details class="form-result-details" open>
          <summary>${p.text("form.result.each")}</summary>
          <div data-form-result-list></div>
        </details>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-form-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("form.dialog.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("form.action.delete")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
