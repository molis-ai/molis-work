import type { UiContribution, UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
export const COGNIA_UI_CONTRIBUTION_ID = "io.molis.work.cognia.ui.v1";
export interface CogniaUiModel { primitives: { escape(value: unknown): string; text(value: string): string } }
export const cogniaUiDescriptor: UiContributionDescriptor = { contribution_id: COGNIA_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.cognia", kind: "primary-page", navigation_id: "cognia", label: "Cognia", surfaces: [{ surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" }, { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] };
export const cogniaUiContribution: UiContribution<CogniaUiModel> = { descriptor: cogniaUiDescriptor, render(request) { return request.surface === "directory" ? "" : renderCogniaWorkbench(request.model); } };
export function renderCogniaWorkbench({ primitives: p }: CogniaUiModel): string {
  const t = (value: string) => p.escape(p.text(value));
  const button = (label: string, action: string, primary = false) => `<button type="button" class="mw-btn mw-btn--${primary ? "primary" : "ghost"}" data-cognia-action="${action}">${t(label)}</button>`;
  const tool = (label: string, action: string, glyph: Parameters<typeof icon>[0], create = false) => `<button type="button" class="mw-btn mw-btn--ghost${create ? " tree-create" : ""}" data-cognia-action="${action}">${icon(glyph)}<span>${t(label)}</span></button>`;
  return renderPluginStageShell({ surface: "cognia", label: "Cognia", dataset: "cognia", body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree cognia-list" data-cognia="directory">
      <header class="plugin-stage-chrome cognia-toolbar">${tool("cognia.action.import", "import", "upload", true)}${tool("cognia.action.add", "add", "plus")}${tool("cognia.action.new-domain", "domain", "folder")}</header>
      <p class="cognia-scope">${t("cognia.page.scope")}</p>
      <div class="cognia-filters"><label class="cognia-search">${icon("search")}<input class="mw-input" type="search" data-cognia-search aria-label="${t("cognia.search.placeholder")}" placeholder="${t("cognia.search.placeholder")}"></label><select class="mw-select" data-cognia-domain aria-label="${t("cognia.field.domain")}"><option value="">${t("cognia.filter.all-domains")}</option></select><select class="mw-select" data-cognia-source aria-label="${t("cognia.field.source")}"><option value="">${t("cognia.filter.all-sources")}</option></select><details class="cognia-manage"><summary class="mw-btn mw-btn--ghost">${icon("more")}${t("cognia.manage.title")}</summary><div>${button("cognia.manage.rename-domain", "rename-domain")}${button("cognia.manage.delete-domain", "delete-domain")}${button("cognia.manage.rename-source", "rename-source")}${button("cognia.manage.delete-source", "delete-source")}</div></details></div>
      <div class="cognia-selection">${tool("cognia.action.synthesize-selected", "synthesize", "sparkles")}<span data-cognia-selected>${t("cognia.selection.hint")}</span><span class="cognia-selection__gap" aria-hidden="true"></span>${tool("cognia.action.query", "query", "message")}${tool("cognia.action.drafts", "drafts", "review")}</div>
      <p class="cognia-model-note" data-cognia-model hidden>${t("cognia.model.none")}</p>
      <a class="mw-btn mw-btn--ghost cognia-model-settings" href="/settings/models" data-cognia-action="model-settings" hidden>${t("cognia.model.settings")}</a>
      <div data-cognia-rows aria-live="polite"><p class="cognia-empty mw-loading">${t("cognia.list.loading")}</p></div>
    </div>
    <section class="plugin-stage-workspace cognia-workspace" data-cognia-workspace hidden>
      <header class="plugin-stage-detail-bar"><button type="button" class="plugin-stage-back" data-cognia-action="back" aria-label="${t("cognia.reading.back")}">${icon("chevron-right")}</button><h1 data-cognia-heading>${t("cognia.reading.heading")}</h1><span data-placement-slot data-placement-scope="home" data-placement-saved="off"></span>${button("cognia.action.edit", "edit-material")}${button("cognia.action.remove", "delete-material")}${button("cognia.action.synthesize", "synthesize-current")}<a class="mw-btn mw-btn--ghost" data-cognia-download>${t("cognia.reading.download")}</a></header>
      <div class="cognia-reading" data-cognia-reading></div>
    </section>
    <div class="cognia-notice" role="status" data-cognia-notice hidden><span></span>${button("cognia.notice.retry", "reload")}</div>
    <dialog class="mw-dialog cognia-dialog" data-cognia-dialog aria-labelledby="cognia-dialog-title"><form data-cognia-form><header><h2 id="cognia-dialog-title"></h2>${button("cognia.dialog.close", "close")}</header><div class="cognia-dialog-scroll" data-cognia-dialog-content></div><p class="cognia-error" role="alert" data-cognia-error hidden></p><footer><span data-cognia-step></span><div>${button("cognia.dialog.cancel", "close")}<button class="mw-btn mw-btn--primary" type="submit" data-cognia-submit>${t("cognia.dialog.continue")}</button></div></footer></form></dialog>
  ` });
}
