import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

export const DATASET_UI_CONTRIBUTION_ID = "io.molis.work.native.dataset.ui.v1";

export type DatasetUiSurface = "directory" | "workbench";

export interface DatasetUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface DatasetUiModel {
  readonly primitives: DatasetUiPrimitives;
}

export const datasetUiDescriptor: UiContributionDescriptor = {
  contribution_id: DATASET_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.dataset",
  kind: "primary-page",
  navigation_id: "dataset",
  label: "Dataset",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const datasetUiContribution: UiContribution<DatasetUiModel> = {
  descriptor: datasetUiDescriptor,
  render(request: UiRenderRequest<DatasetUiModel>): string {
    switch (request.surface as DatasetUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderDatasetWorkbench(request.model);
      default:
        throw new Error(`Dataset UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderDatasetWorkbench(model: DatasetUiModel): string {
  const { primitives: p } = model;
  return renderPluginStageShell({
    surface: "dataset",
    label: "Dataset",
    dataset: "dataset",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-dataset="directory">
      <header class="plugin-stage-chrome dataset-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-dataset-new>${icon("plus")}<span>${p.text("dataset.action.new")}</span></button>
      </header>
      <div class="mw-empty" data-dataset-empty>
        <span class="mw-empty__mark">${icon("database")}</span>
        <strong>${p.text("dataset.empty.title")}</strong>
        <p>${p.text("dataset.empty.hint")}</p>
        <p data-placement-target></p>
        <button class="mw-btn mw-btn--primary" type="button" data-dataset-new>${icon("plus")}<span>${p.text("dataset.action.new")}</span></button>
      </div>
      <p class="dataset-placement-line" data-placement-target></p>
      <div data-dataset-rows></div>
    </div>
    <div class="plugin-stage-workspace" data-dataset-stage-workspace hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-dataset-back aria-label="${p.text("dataset.editor.back")}" title="${p.text("dataset.editor.back")}">${icon("chevron-right")}</button>
        <h1 data-dataset-editor-title>${p.text("dataset.page.title")}</h1>
        <span data-dataset-editor-status></span>
        <span data-placement-slot data-placement-saved="off"></span>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-artifact="" data-dataset-artifact-bar title="${p.text("dataset.fixed.hint")}">${p.text("dataset.fixed.save")}</button>
        <details class="plugin-stage-more">
          <summary class="mw-btn mw-btn--ghost" aria-label="${p.text("dataset.more.aria")}">${icon("more")}<span>${p.text("dataset.more.label")}</span></summary>
          <div class="plugin-stage-more-actions">
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-csv>${p.text("dataset.action.export-csv")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-export-json>${p.text("dataset.action.export-json")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-reload>${p.text("dataset.action.reload")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-dataset-delete>${p.text("dataset.action.delete")}</button>
          </div>
        </details>
      </div>
      <div class="dataset-workspace">
        <p class="dataset-note" data-dataset-note role="status" aria-live="polite" hidden></p>
        <div class="dataset-identity">
          <label class="dataset-field">${p.text("dataset.field.title")}<input class="mw-input" data-dataset-title autocomplete="off"></label>
          <label class="dataset-field">${p.text("dataset.field.description")}<input class="mw-input" data-dataset-description autocomplete="off" placeholder="${p.text("dataset.field.optional")}"></label>
        </div>
        <div class="dataset-toolbar" data-dataset-toolbar hidden>
          <label class="mw-input-group dataset-filter">${icon("search")}<input class="mw-input" data-dataset-filter autocomplete="off" placeholder="${p.text("dataset.filter.placeholder")}" aria-label="${p.text("dataset.filter.placeholder")}"></label>
        </div>
        <p class="dataset-note" data-dataset-publication-note hidden></p>
        <div class="dataset-table-wrap">
          <div class="dataset-starter" data-dataset-table-empty hidden>
            <div class="dataset-ghost" aria-hidden="true">
              <div class="dataset-ghost-head"><span></span><span></span><span></span></div>
              <div class="dataset-ghost-row"><span></span><span></span><span></span></div>
              <div class="dataset-ghost-row"><span></span><span></span><span></span></div>
              <div class="dataset-ghost-row"><span></span><span></span><span></span></div>
            </div>
            <div class="dataset-starter-actions">
              <button class="mw-btn mw-btn--secondary" type="button" data-dataset-add-column>${icon("plus")}<span>${p.text("dataset.column.add")}</span></button>
              <button class="mw-btn mw-btn--ghost" type="button" data-dataset-import-file>${icon("upload")}<span>${p.text("dataset.import.choose-file")}</span></button>
              <button class="mw-btn mw-btn--ghost" type="button" data-dataset-paste-open>${p.text("dataset.import.paste")}</button>
            </div>
          </div>
          <p class="dataset-table-empty" data-dataset-filter-empty hidden>${p.text("dataset.filter.empty")}</p>
          <table class="mw-table" data-dataset-table hidden></table>
        </div>
        <details class="dataset-assist"><summary>${icon("sparkles")}${p.text("dataset.ai.summary")}</summary>
        <div class="dataset-prompt">
          <label class="dataset-field">${p.text("dataset.ai.prompt-label")}<input class="mw-input" data-dataset-ai-prompt autocomplete="off" placeholder="${p.text("dataset.ai.prompt-placeholder")}"></label>
          <button class="mw-btn mw-btn--ghost" type="button" data-dataset-generate><span>${p.text("dataset.ai.by-name")}</span></button>
          <button class="mw-btn mw-btn--ghost" type="button" data-dataset-generate-ai disabled>${icon("sparkles")}<span>${p.text("dataset.ai.suggest")}</span></button>
        </div>
        <p class="dataset-note" data-dataset-ai-reason></p>
        </details>
        <details class="dataset-panel">
          <summary>${icon("chevron-down")}<span>${p.text("dataset.import.summary")}</span></summary>
          <textarea class="mw-textarea" data-dataset-csv rows="4" placeholder="${p.text("dataset.import.placeholder")}"></textarea>
          <div class="dataset-import-actions">
            <button class="mw-btn mw-btn--secondary" type="button" data-dataset-import>${p.text("dataset.import.pasted")}</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-dataset-import-file>${p.text("dataset.import.choose-file")}</button>
            <input type="file" data-dataset-import-input accept=".csv,text/csv,text/plain" hidden>
          </div>
        </details>
        <div class="dataset-versions">
          <div class="dataset-versions-head">
            <strong>${p.text("dataset.version.heading")}</strong>
            <input class="mw-input" data-dataset-version-note autocomplete="off" placeholder="${p.text("dataset.version.note-placeholder")}">
            <button class="mw-btn mw-btn--ghost" type="button" data-dataset-snapshot>${p.text("dataset.version.save")}</button>
          </div>
          <div data-dataset-versions></div>
        </div>
      </div>
    </div>
    <dialog class="mw-dialog creative-confirm" data-dataset-confirm>
      <form class="creative-confirm-form" method="dialog">
        <p data-confirm-text></p>
        <div class="creative-confirm-actions">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("dataset.dialog.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("dataset.dialog.confirm")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
