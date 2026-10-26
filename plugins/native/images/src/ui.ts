import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
import { IMAGES_UI_CONTRIBUTION_ID } from "./manifest.js";

export interface ImagesUiModel {
  readonly primitives: {
    escape(value: unknown): string;
    text(value: string, values?: Record<string, string | number>): string;
  };
}

export const imagesUiDescriptor: UiContributionDeclaration = {
  contribution_id: IMAGES_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "images",
  label: "图片",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const imagesUiContribution: UiContribution<ImagesUiModel> = {
  descriptor: imagesUiDescriptor,
  render(request: UiRenderRequest<ImagesUiModel>): string {
    if (request.surface === "directory") return "";
    if (request.surface === "workbench") return renderImagesWorkbench(request.model);
    throw new Error(`Images UI surface ${request.surface} 不存在`);
  },
};

export function renderImagesWorkbench({ primitives: p }: ImagesUiModel): string {
  return renderPluginStageShell({
    surface: "images", label: p.text("images.page.title"), dataset: "images",
    body: `
      <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-images="directory">
        <header class="plugin-stage-chrome">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-images-new>${icon("plus")}<span>${p.text("images.compose.new")}</span></button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${icon("refresh")}<span>${p.text("images.history.refresh")}</span></button>
        </header>
        <div class="mw-empty" data-images-history-empty><span class="mw-empty__mark">${icon("image")}</span><strong>${p.text("images.history.empty")}</strong><p>${p.text("images.history.empty-help")}</p><p data-placement-target></p></div>
        <div data-images-rows></div>
        <p class="images-note" role="status" data-images-list-note hidden></p>
      </div>
      <div class="plugin-stage-workspace" data-images-workspace hidden>
        <header class="plugin-stage-detail-bar">
          <button class="plugin-stage-back" type="button" data-images-back aria-label="${p.text("images.history.back")}" title="${p.text("images.history.back")}">${icon("chevron-right")}</button>
          <h1 data-images-title>${p.text("images.compose.new")}</h1>
          <span data-placement-slot data-placement-saved="off"></span>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${p.text("images.history.refresh")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-connections>${p.text("images.service.manage")}</button>
        </header>
        <div class="images-workspace-body">
          <form class="images-compose" data-images-compose>
            <div class="images-intro"><h2>${p.text("images.compose.title")}</h2><p>${p.text("images.compose.help")}</p></div>
            <div class="images-connection-empty" data-images-connection-empty hidden><p>${p.text("images.service.connect-help")}</p><button class="mw-btn mw-btn--primary" type="button" data-images-connections>${p.text("images.service.connect")}</button></div>
            <p class="images-note is-error" data-images-service-unavailable role="status" hidden></p>
            <div data-images-connected hidden>
              <label class="images-field-label">${p.text("images.service.model")}</label>
              <details class="images-service-menu" data-images-service-menu>
                <summary class="mw-btn mw-btn--secondary"><span data-images-service-label></span>${icon("chevron-down")}</summary>
                <div class="images-service-options" role="group" aria-label="${p.text("images.service.model")}" data-images-service-options></div>
              </details>
            </div>
            <label class="images-field"><span>${p.text("images.compose.prompt")}</span><textarea class="mw-textarea images-prompt" data-images-prompt rows="7" maxlength="32000" required placeholder="${p.text("images.compose.example")}"></textarea></label>
            <div class="images-parameters">
              <label class="images-field" data-images-size-field><span>${p.text("images.compose.size")}</span><input class="mw-input" data-images-size autocomplete="off" maxlength="100" placeholder="${p.text("images.compose.size-placeholder")}"><small>${p.text("images.compose.size-help")}</small></label>
              <label class="images-field" data-images-ratio-field hidden><span>${p.text("images.compose.ratio")}</span><input class="mw-input" data-images-ratio autocomplete="off" maxlength="100" placeholder="${p.text("images.compose.ratio-placeholder")}"></label>
            </div>
            <div class="images-submit-row"><p>${p.text("images.compose.cost")}</p><button class="mw-btn mw-btn--primary" type="submit" data-images-generate disabled>${p.text("images.compose.generate")}</button></div>
            <p class="images-note" data-images-project-note hidden>${p.text("images.compose.project")}</p>
          </form>
          <section class="images-result" aria-label="${p.text("images.result.title")}" data-images-result hidden></section>
          <p class="images-note" role="status" aria-live="polite" data-images-note hidden></p>
        </div>
      </div>
      <dialog class="mw-dialog images-connections-dialog" data-images-dialog aria-label="${p.text("images.service.title")}">
        <form data-images-connection-form>
          <header class="images-dialog-header"><h2>${p.text("images.service.title")}</h2><button class="mw-btn mw-btn--ghost" type="button" data-images-dialog-close>${p.text("images.service.close")}</button></header>
          <div class="images-dialog-body">
            <p class="images-help">${p.text("images.service.help")}</p>
            <div class="images-saved-connections" role="group" aria-label="${p.text("images.service.saved-list")}" data-images-saved-connections></div>
            <fieldset class="images-connection-fields" data-images-connection-fields>
              <legend data-images-connection-heading>${p.text("images.service.add")}</legend>
              <div class="images-presets" role="group" aria-label="${p.text("images.service.preset")}">
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="openai">OpenAI</button>
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="gemini">Gemini</button>
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="custom">${p.text("images.service.custom")}</button>
              </div>
              <label class="images-field"><span>${p.text("images.service.name")}</span><input class="mw-input" name="connection_name" data-images-connection-name required maxlength="100" autocomplete="off"></label>
              <div class="images-field"><span>${p.text("images.service.format")}</span><div class="images-protocols" role="group" aria-label="${p.text("images.service.format")}"><button class="mw-btn mw-btn--secondary" type="button" data-images-format="openai-images" aria-pressed="true">OpenAI Images</button><button class="mw-btn mw-btn--secondary" type="button" data-images-format="gemini" aria-pressed="false">Gemini generateContent</button></div></div>
              <label class="images-field"><span>${p.text("images.service.url")}</span><input class="mw-input" name="base_url" data-images-connection-url type="url" required autocomplete="off" placeholder="https://api.openai.com/v1"></label>
              <label class="images-field"><span>${p.text("images.service.model-name")}</span><input class="mw-input" name="model" data-images-connection-model required maxlength="200" autocomplete="off"></label>
              <label class="images-field"><span>${p.text("images.account.label")}</span><select class="mw-select" data-images-connection-auth><option value="">${p.text("images.account.anonymous")}</option></select><small data-images-key-help>${p.text("images.account.key-management")}</small></label><a href="/settings/connectors?connector=image-api">${p.text("images.account.open-connectors")}</a>
            </fieldset>
          </div>
          <footer class="images-dialog-footer"><p class="images-note" role="status" data-images-connection-note hidden></p><div class="images-actions"><button class="mw-btn mw-btn--ghost" type="button" data-images-add-connection>${p.text("images.service.add-another")}</button><button class="mw-btn mw-btn--primary" type="submit" data-images-save-connection>${p.text("images.service.save")}</button></div></footer>
        </form>
      </dialog>`,
  });
}
