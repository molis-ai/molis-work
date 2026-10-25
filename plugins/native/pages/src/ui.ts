import { renderPagesComments } from "./comment-side-view.js";
import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PAGES_TEMPLATES } from "./templates.js";

export const PAGES_UI_CONTRIBUTION_ID = "io.molis.work.native.pages.ui.v1";

export type PagesUiSurface = "directory" | "workbench" | "comments";

export interface PagesUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface PagesUiModel {
  readonly primitives: PagesUiPrimitives;
}

export const pagesUiDescriptor: UiContributionDeclaration = {
  contribution_id: PAGES_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "pages",
  label: "Pages",
  surfaces: [
    { surface_id: "comments", target_slot_id: "workbench.side", format: "declarative-html" },
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const pagesUiContribution: UiContribution<PagesUiModel> = {
  descriptor: pagesUiDescriptor,
  render(request: UiRenderRequest<PagesUiModel>): string {
    switch (request.surface as PagesUiSurface) {
      case "comments": return renderPagesComments(request.model);
      case "directory":
        return "";
      case "workbench":
        return renderPagesWorkbench(request.model);
      default:
        throw new Error(`Pages UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

/**
 * The words on a template card, by the template's id: the card says them in the person's language, the template's own Chinese is what its
 * document is made from. A template without words of its own shows its own title and summary as written.
 */
function templateWords(p: PagesUiPrimitives, item: { id: string; title: string; summary: string }): { title: string; summary: string } {
  switch (item.id) {
    case "meeting-notes": return { title: p.text("pages.template.meeting-notes.title"), summary: p.text("pages.template.meeting-notes.summary") };
    case "weekly-report": return { title: p.text("pages.template.weekly-report.title"), summary: p.text("pages.template.weekly-report.summary") };
    case "project-plan": return { title: p.text("pages.template.project-plan.title"), summary: p.text("pages.template.project-plan.summary") };
    case "prd": return { title: p.text("pages.template.prd.title"), summary: p.text("pages.template.prd.summary") };
    case "sprint-retro": return { title: p.text("pages.template.sprint-retro.title"), summary: p.text("pages.template.sprint-retro.summary") };
    case "user-interview": return { title: p.text("pages.template.user-interview.title"), summary: p.text("pages.template.user-interview.summary") };
    case "okr": return { title: p.text("pages.template.okr.title"), summary: p.text("pages.template.okr.summary") };
    case "postmortem": return { title: p.text("pages.template.postmortem.title"), summary: p.text("pages.template.postmortem.summary") };
    case "tech-design": return { title: p.text("pages.template.tech-design.title"), summary: p.text("pages.template.tech-design.summary") };
    case "competitor": return { title: p.text("pages.template.competitor.title"), summary: p.text("pages.template.competitor.summary") };
    default: return { title: p.escape(item.title), summary: p.escape(item.summary) };
  }
}

export function renderPagesWorkbench(model: PagesUiModel): string {
  const { primitives: p } = model;
  const templates = PAGES_TEMPLATES.map((item) => {
    const words = templateWords(p, item);
    return `<button class="mw-btn mw-btn--ghost pages-template-item" type="button" data-pages-template="${p.escape(item.id)}">
      <span class="pages-template-mark">${icon(item.icon)}</span>
      <span><strong>${words.title}</strong><em>${words.summary}</em></span>
    </button>`;
  }).join("");
  return renderPluginStageShell({
    surface: "pages",
    label: "Pages",
    dataset: "pages",
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-pages="directory">
      <header class="plugin-stage-chrome pages-stage-chrome">
        <div class="pages-create">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-pages-new>${icon("plus")}<span>${p.text("pages.action.new-doc")}</span></button>
          <button class="mw-btn mw-btn--ghost pages-create-more" type="button" data-pages-create-more aria-expanded="false" aria-haspopup="true" aria-label="${p.text("pages.action.more-new")}" title="${p.text("pages.action.more-new")}">${icon("chevron-down")}</button>
          <div class="mw-menu pages-create-menu" data-pages-create-menu hidden>
            <button class="mw-menu__item" type="button" data-pages-templates>${icon("library")}${p.text("pages.action.from-template")}</button>
            <button class="mw-menu__item" type="button" data-pages-new-folder>${icon("folder")}${p.text("pages.folder.new")}</button>
          </div>
        </div>
        <button class="mw-btn mw-btn--ghost pages-import-trigger" type="button" data-pages-import>${icon("upload")}<span>${p.text("pages.import.open")}</span></button>
      </header>
      <label class="pages-search mw-input-group">
        ${icon("search")}
        <input class="mw-input" data-pages-search type="search" autocomplete="off" placeholder="${p.text("pages.list.search")}" aria-label="${p.text("pages.list.search")}">
      </label>
      <div class="mw-empty" data-pages-empty>
        <span class="mw-empty__mark">${icon("note")}</span>
        <strong>${p.text("pages.list.empty")}</strong>
        <p>${p.text("pages.list.empty-hint")}</p>
        <p data-placement-target></p>
        <div class="mw-empty__actions">
          <button class="mw-btn mw-btn--secondary" type="button" data-pages-templates>${icon("library")}<span>${p.text("pages.action.from-template")}</span></button>
          <button class="mw-btn mw-btn--secondary" type="button" data-pages-import>${icon("upload")}<span>${p.text("pages.import.existing")}</span></button>
        </div>
      </div>
      <p class="pages-placement-line" data-placement-target></p>
      <p class="pages-search-empty" data-pages-search-empty hidden>${p.text("pages.list.no-match")}</p>
      <div data-pages-rows role="listbox" aria-multiselectable="true" aria-label="${p.text("pages.doc.name")}"></div>
    </div>
    <div class="plugin-stage-workspace" data-pages-stage-workspace data-floating-stage hidden>
      <div class="plugin-stage-detail-bar">
        <button class="plugin-stage-back" type="button" data-pages-back aria-label="${p.text("pages.doc.back")}" title="${p.text("pages.doc.back")}">${icon("chevron-right")}</button>
        <h1 data-pages-editor-title>${p.text("pages.doc.name")}</h1>
        <span data-pages-editor-status></span>
        <span data-placement-slot data-placement-saved="off"></span>
        <div class="pages-editor-tools">
          <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-comments-open aria-label="${p.text("pages.comments.label")}" title="${p.text("pages.comments.label")}">${icon("message")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-pages-promote data-pages-artifact-bar title="${p.text("pages.version.save-hint")}">${p.text("pages.version.save")}</button>
          <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-star-editor aria-label="${p.text("pages.star.add")}" title="${p.text("pages.star.add")}">${icon("star")}</button>
          <button class="mw-btn mw-btn--ghost pages-chrome-icon" type="button" data-pages-more aria-expanded="false" aria-haspopup="true" aria-label="${p.text("pages.action.more")}" title="${p.text("pages.action.more")}">${icon("more")}</button>
          <div class="mw-menu pages-more-menu" data-pages-more-menu hidden>
            <label class="pages-more-field">${p.text("pages.goal.attach")}
              <select class="mw-select pages-folder-select" data-pages-goal aria-label="${p.text("pages.goal.attach")}"></select>
            </label>
            <hr>
            <button class="mw-menu__item" type="button" data-pages-extract>${icon("sparkles")}${p.text("pages.action.extract")}</button>
            <button class="mw-menu__item" type="button" data-pages-promote>${icon("upload")}${p.text("pages.version.save")}</button>
            <hr>
            <button class="mw-menu__item" type="button" data-pages-export="md">${icon("download")}${p.text("pages.export.markdown")}</button>
            <button class="mw-menu__item" type="button" data-pages-export="html">${icon("download")}${p.text("pages.export.html")}</button>
            <button class="mw-menu__item" type="button" data-pages-print>${icon("download")}${p.text("pages.export.print")}</button>
            <hr>
            <button class="mw-menu__item mw-menu__item--danger" type="button" data-pages-delete>${icon("trash")}${p.text("pages.action.delete")}</button>
          </div>
        </div>
      </div>
      <div class="pages-workspace" data-pages-pane="editor">
        <input class="pages-title" data-pages-title data-plain-field autocomplete="off" placeholder="${p.text("pages.doc.untitled")}">
        <div class="pages-editor-host" data-pages-editor></div>
      </div>
      <p class="pages-note" data-pages-note hidden></p>
    </div>
    <dialog class="mw-dialog mw-dialog--form creative-confirm" data-pages-confirm>
      <form class="mw-form" method="dialog">
        <div class="mw-form__body"><p data-confirm-text></p><div class="mw-field__error" role="alert" hidden></div></div>
        <div class="mw-form__footer">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("pages.action.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-confirm-ok>${p.text("pages.action.delete")}</button>
        </div>
      </form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form creative-confirm" data-pages-name aria-labelledby="pages-name-label">
      <form class="mw-form" method="dialog">
        <div class="mw-form__body">
          <p id="pages-name-label" data-name-label></p>
          <input class="mw-input" data-name-input autocomplete="off" aria-labelledby="pages-name-label">
          <div class="mw-field__error" data-name-error role="alert" hidden></div>
        </div>
        <div class="mw-form__footer">
          <button class="mw-btn mw-btn--ghost" type="button" data-name-cancel>${p.text("pages.action.cancel")}</button>
          <button class="mw-btn mw-btn--primary" value="ok" data-name-ok>${p.text("pages.action.ok")}</button>
        </div>
      </form>
    </dialog>
    <div class="mw-menu pages-move-menu" data-pages-move-menu hidden role="menu"></div>
    <dialog class="mw-dialog mw-dialog--form pages-import-dialog" data-pages-import-dialog aria-labelledby="pages-import-title">
      <div class="mw-form pages-import-content">
        <header class="mw-form__header"><div><h2 id="pages-import-title">${p.text("pages.import.title")}</h2><p>${p.text("pages.import.lead")}</p></div></header>
        <div class="mw-form__body pages-import-fields">
          <label class="pages-import-field">${p.text("pages.import.from")}
            <select class="mw-select" data-pages-import-source>
              <option value="notion">Notion</option>
              <option value="feishu">${p.text("pages.import.feishu")}</option>
              <option value="other">${p.text("pages.import.other")}</option>
            </select>
          </label>
          <p class="pages-import-help" data-pages-import-help></p>
          <label class="pages-import-drop" data-pages-import-drop>
            ${icon("upload")}<strong>${p.text("pages.import.choose")}</strong>
            <span>ZIP · DOCX · Markdown · HTML · TXT · CSV</span>
            <small>${p.text("pages.import.limits")}</small>
            <input type="file" data-pages-import-files multiple accept=".zip,.docx,.md,.markdown,.html,.htm,.txt,.csv" aria-label="${p.text("pages.import.files-label")}">
          </label>
          <p class="pages-import-limit">${p.text("pages.import.not-imported")}</p>
          <p class="pages-import-status" data-pages-import-status role="status" aria-live="polite"></p>
          <div data-pages-import-preview hidden>
            <div class="pages-import-options">
              <label class="mw-check-row"><input type="checkbox" data-pages-import-all checked> ${p.text("pages.import.all")}</label>
              <label class="pages-import-field">${p.text("pages.import.to")}<select class="mw-select" data-pages-import-folder aria-label="${p.text("pages.import.to")}"></select></label>
            </div>
            <ul class="pages-import-warnings" data-pages-import-warnings></ul>
            <div class="pages-import-documents" data-pages-import-documents></div>
          </div>
        </div>
        <footer class="mw-form__footer">
          <button class="mw-btn mw-btn--ghost" type="button" data-pages-import-close>${p.text("pages.action.cancel")}</button>
          <button class="mw-btn mw-btn--primary" type="button" data-pages-import-submit disabled>${p.text("pages.import.submit")}</button>
          <button class="mw-btn mw-btn--primary" type="button" data-pages-import-open hidden>${p.text("pages.import.open-doc")}</button>
        </footer>
      </div>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form pages-template-dialog" data-pages-template-dialog>
      <form class="mw-form" method="dialog">
        <header class="mw-form__header"><h2>${p.text("pages.action.from-template")}</h2></header>
        <div class="mw-form__body pages-template-list" data-pages-template-list>${templates}</div>
        <div class="mw-form__footer">
          <button class="mw-btn mw-btn--ghost" value="cancel">${p.text("pages.action.cancel")}</button>
        </div>
      </form>
    </dialog>
  ` });
}
