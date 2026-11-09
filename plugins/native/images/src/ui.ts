import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderChoice, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
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

export function renderImagesWorkbench({ }: ImagesUiModel): string {
  return renderPluginStageShell({
    surface: "images", label: uiText.text("images.page.title"), dataset: "images",
    body: `
      <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-images="directory">
        <header class="plugin-stage-chrome">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-images-new>${icon("plus")}<span>${uiText("images.compose.new")}</span></button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${icon("refresh")}<span>${uiText("images.history.refresh")}</span></button>
        </header>
        <div class="mw-empty" data-images-history-empty><span class="mw-empty__mark">${icon("image")}</span><strong>${uiText("images.history.empty")}</strong><p>${uiText("images.history.empty-help")}</p><p data-placement-target></p></div>
        <div data-images-rows></div>
        <p class="images-note" role="status" data-images-list-note hidden></p>
      </div>
      <div class="plugin-stage-workspace" data-images-workspace hidden>
        <header class="plugin-stage-detail-bar">
          <button class="plugin-stage-back" type="button" data-images-back aria-label="${uiText("images.history.back")}" title="${uiText("images.history.back")}">${icon("chevron-right")}</button>
          <h1 data-images-title>${uiText("images.compose.new")}</h1>
          <span data-placement-slot data-placement-saved="off"></span>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${uiText("images.history.refresh")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-connections>${uiText("images.service.manage")}</button>
        </header>
        <div class="images-workspace-body">
          <form class="images-compose" data-images-compose>
            <div class="images-intro"><h2>${uiText("images.compose.title")}</h2><p>${uiText("images.compose.help")}</p></div>
            <div class="images-connection-empty" data-images-connection-empty hidden><p>${uiText("images.service.connect-help")}</p><button class="mw-btn mw-btn--primary" type="button" data-images-connections>${uiText("images.service.connect")}</button></div>
            <p class="images-note is-error" data-images-service-unavailable role="status" hidden></p>
            <div data-images-connected hidden>
              <label class="images-field-label">${uiText("images.service.model")}</label>
              <details class="images-service-menu" data-images-service-menu>
                <summary class="mw-btn mw-btn--secondary"><span data-images-service-label></span>${icon("chevron-down")}</summary>
                <div class="images-service-options" role="group" aria-label="${uiText("images.service.model")}" data-images-service-options></div>
              </details>
            </div>
            <label class="images-field"><span>${uiText("images.compose.prompt")}</span><textarea class="mw-textarea images-prompt" data-images-prompt rows="7" maxlength="32000" required placeholder="${uiText("images.compose.example")}"></textarea></label>
            <div class="images-parameters">
              <label class="images-field" data-images-size-field><span>${uiText("images.compose.size")}</span><input class="mw-input" data-images-size list="images-size-options" autocomplete="off" maxlength="100" placeholder="${uiText("images.compose.size-placeholder")}"><small data-images-size-help>${uiText("images.compose.size-help")}</small></label>
              <label class="images-field" data-images-ratio-field hidden><span>${uiText("images.compose.ratio")}</span><input class="mw-input" data-images-ratio list="images-ratio-options" autocomplete="off" maxlength="100" placeholder="${uiText("images.compose.ratio-placeholder")}"><small data-images-ratio-help></small></label>
              <datalist id="images-size-options" data-images-size-options></datalist><datalist id="images-ratio-options" data-images-ratio-options></datalist>
            </div>
            <div class="images-submit-row"><p>${uiText("images.compose.cost")}</p><button class="mw-btn mw-btn--primary" type="submit" data-images-generate disabled>${uiText("images.compose.generate")}</button></div>
            <div class="images-connection-need" data-images-connection-need hidden></div>
            <p class="images-note" data-images-project-note hidden>${uiText("images.compose.project")}</p>
          </form>
          <section class="images-result" aria-label="${uiText("images.result.title")}" data-images-result hidden></section>
          <p class="images-note" role="status" aria-live="polite" data-images-note hidden></p>
        </div>
      </div>
      <dialog class="mw-dialog images-connections-dialog" data-images-dialog aria-label="${uiText("images.service.title")}">
        <form data-images-connection-form>
          <header class="images-dialog-header"><h2>${uiText("images.service.title")}</h2><button class="mw-btn mw-btn--ghost" type="button" data-images-dialog-close>${uiText("images.service.close")}</button></header>
          <div class="images-dialog-body">
            <p class="images-help">${uiText("images.service.help")}</p>
            <div class="images-saved-connections" role="group" aria-label="${uiText("images.service.saved-list")}" data-images-saved-connections></div>
            <fieldset class="images-connection-fields" data-images-connection-fields>
              <legend data-images-connection-heading>${uiText("images.service.add")}</legend>
              <div class="images-field"><span id="images-preset-label">${uiText("images.service.pick")}</span>
                <div class="mw-choice-group" role="group" aria-labelledby="images-preset-label">${[["openai", "OpenAI"], ["gemini", "Gemini"], ["custom", uiText.text("images.service.custom")]]
                  .map(([preset, label]) => renderChoice({ label, attrs: { "data-images-preset": preset } })).join("")}</div>
                <small class="images-offer" data-images-offer></small></div>
              <label class="images-field"><span>${uiText("images.account.label")}</span><select class="mw-select" data-images-connection-auth><option value="">${uiText("images.account.anonymous")}</option></select><small data-images-key-help>${uiText("images.account.key-management")}</small></label><a href="/settings/connectors?connector=image-api">${uiText("images.account.open-connectors")}</a>
              <details class="mw-collapsible images-advanced" data-images-advanced><summary>${uiText("images.service.advanced")}</summary><div class="mw-collapsible__body">
                <label class="images-field"><span>${uiText("images.service.name")}</span><input class="mw-input" name="connection_name" data-images-connection-name required maxlength="100" autocomplete="off"></label>
                <div class="images-field"><span>${uiText("images.service.format")}</span><div class="images-protocols" role="group" aria-label="${uiText("images.service.format")}"><button class="mw-btn mw-btn--secondary" type="button" data-images-format="openai-images" aria-pressed="true">OpenAI Images</button><button class="mw-btn mw-btn--secondary" type="button" data-images-format="gemini" aria-pressed="false">Gemini generateContent</button></div></div>
                <label class="images-field"><span>${uiText("images.service.url")}</span><input class="mw-input" name="base_url" data-images-connection-url type="url" required autocomplete="off" placeholder="https://api.openai.com/v1"></label>
                <label class="images-field"><span>${uiText("images.service.model-name")}</span><input class="mw-input" name="model" data-images-connection-model required maxlength="200" autocomplete="off"></label>
              </div></details>
            </fieldset>
          </div>
          <footer class="images-dialog-footer"><p class="images-note" role="status" data-images-connection-note hidden></p><div class="images-actions"><button class="mw-btn mw-btn--ghost" type="button" data-images-add-connection>${uiText("images.service.add-another")}</button><button class="mw-btn mw-btn--primary" type="submit" data-images-save-connection>${uiText("images.service.save")}</button></div></footer>
        </form>
      </dialog>`,
  });
}
