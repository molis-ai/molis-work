import { CHARACTERS_SETTINGS_ENTRY_STYLES, CHARACTERS_STYLES } from "./styles.js";
import { icon, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderCharacterImport, renderCharacterSource } from "./import-ui.js";

// 角色 is the Host's own page since CHR-1 (decision #26): Settings › 角色 is a host section, and inside a project the page below
// is a stage surface the settings cover shows (it marks itself `data-settings-page`). Its browser program is src/browser/characters.
export interface CharactersUiModel { route_prefix: string; primitives: { escape(value: unknown): string } }

export interface CharactersSettingsUiModel {
  readonly projects: readonly { readonly project_id: string; readonly name: string; readonly href: string }[];
  readonly primitives: { escape(value: unknown): string };
}

/**
 * Settings › 角色 outside any project. Publishing lands in a project, so the page is managed from inside one;
 * here it says so and offers the projects.
 */
export function renderCharactersSettingsEntry(model: CharactersSettingsUiModel): string {
  const { projects, primitives: p } = model;
  const rows = projects.map(project => `<a class="characters-project-link" href="${p.escape(project.href)}">${icon("folder")}<span translate="no">${p.escape(project.name)}</span>${icon("chevron-right")}</a>`).join("");
  return `<section class="settings-document characters-settings-entry" aria-labelledby="settings-title" data-settings-panel="characters">
      <style>${CHARACTERS_SETTINGS_ENTRY_STYLES}</style>
      <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.characters.title")}</h1></div>
        <p>${uiText("workbench.characters.entry-about")}</p></header>
      <section class="settings-section"><h2>${uiText("workbench.characters.open-project")}</h2>${rows || `<p class="characters-hint">${uiText("workbench.characters.need-project")}</p>`}</section>
    </section>`;
}

const STEPS: readonly [string, string][] = [
  ["workbench.characters.step-write", "workbench.characters.step-write-hint"],
  ["workbench.characters.publish-project", "workbench.characters.step-publish-hint"],
  ["workbench.characters.step-select", "workbench.characters.step-select-hint"],
];

export function renderCharacters(model: CharactersUiModel): string {
  const steps = STEPS.map(([title, detail], index) => `<li><span class="characters-step-mark" aria-hidden="true">${index + 1}</span><span><strong>${uiText(title)}</strong><small>${uiText(detail)}</small></span></li>`).join("");
  return `<section class="desktop-work-surface characters-page" data-work-surface="characters" data-work-surface-label="${uiText("workbench.characters.title")}" data-settings-page="characters" hidden data-characters data-expanded="false" data-character-api="${model.primitives.escape(model.route_prefix)}/api/plugins/io.molis.work.characters">
    <style>${CHARACTERS_STYLES}</style>
    <div class="characters-list-view" data-character-list-view>
      <header class="settings-heading characters-heading"><div class="settings-heading-title"><h1>${uiText("workbench.characters.title")}</h1></div>
        <p>${uiText("workbench.characters.about")}</p></header>
      <ol class="characters-steps" aria-label="${uiText("workbench.characters.how")}">${steps}</ol>
      <section class="settings-section characters-block" aria-labelledby="characters-mine-title">
        <header class="characters-block-head"><div><h2 id="characters-mine-title">${uiText("workbench.characters.my")}</h2><p class="characters-hint">${uiText("workbench.characters.mine-hint")}</p></div>
          <div class="characters-block-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-import-open disabled>${icon("upload")}<span>${uiText("workbench.characters.import-local")}</span></button><button class="mw-btn mw-btn--primary" type="button" data-character-new disabled>${icon("plus")}<span>${uiText("workbench.characters.new")}</span></button></div></header>
        <div class="characters-rows" data-character-list role="list"></div>
        <div class="characters-empty" data-character-empty hidden><strong>${uiText("workbench.characters.empty")}</strong><p>${uiText("workbench.characters.empty-hint")}</p></div>
      </section>
      <section class="settings-section characters-block characters-builtin" aria-labelledby="characters-builtin-title" data-character-builtin data-character-builtin-api="/api/agent-definitions/roles" data-character-builtin-settings="/settings/prompts">
        <header class="characters-block-head"><div><h2 id="characters-builtin-title">${uiText("workbench.characters.builtin")}</h2>
          <p class="characters-hint">${uiText("workbench.characters.builtin-hint")}</p></div></header>
        <div class="characters-rows" data-character-builtin-list role="list"><p class="characters-hint mw-loading">${uiText("workbench.characters.loading")}</p></div>
      </section>
    </div>
    <div class="characters-editor-view" data-character-workspace hidden>
      <header class="characters-editor-bar"><button class="mw-btn mw-btn--ghost mw-btn--icon-only plugin-stage-back" type="button" data-character-back aria-label="${uiText("workbench.characters.back")}" title="${uiText("workbench.characters.back")}">${icon("chevron-right")}</button>
        <div class="characters-editor-title"><h1 data-character-heading tabindex="-1">${uiText("workbench.characters.title")}</h1><span class="characters-state" data-character-status></span></div></header>
      <form class="characters-editor" data-character-editor>
        <section class="settings-section characters-block" aria-labelledby="characters-way-title">
          <h2 id="characters-way-title">${uiText("workbench.characters.instructions")}</h2>
          <label>${uiText("workbench.characters.name")}<input class="mw-input" data-character-title maxlength="120" required autocomplete="off"></label>
          <label>${uiText("workbench.characters.instructions")}<textarea class="mw-input" data-character-instructions maxlength="20000" rows="12" placeholder="${uiText("workbench.characters.example")}"></textarea><small>${uiText("workbench.characters.instructions-hint")}</small></label>
        </section>
        ${renderCharacterSource()}
        <section class="settings-section characters-block" aria-labelledby="characters-scope-title">
          <h2 id="characters-scope-title">${uiText("workbench.characters.access")}</h2>
          <fieldset><legend>${uiText("workbench.characters.host-tools")}</legend><label class="characters-check"><input class="mw-check" type="checkbox" data-character-inherit checked>${uiText("workbench.characters.inherit-tools")}</label>
            <label data-character-tools-field hidden>${uiText("workbench.characters.limit-tools")}<input class="mw-input" data-character-tools placeholder="read-file, search" autocomplete="off" spellcheck="false"><small>${uiText("workbench.characters.limit-tools-hint")}</small></label>
            <small>${uiText("workbench.characters.internal-tools-hint")}</small>
          </fieldset>
          <fieldset><legend>${uiText("workbench.characters.actions")}</legend><label class="characters-check"><input class="mw-check" type="checkbox" data-character-actions-inherit checked>${uiText("workbench.characters.inherit-actions")}</label>
            <div data-character-actions-field hidden><p class="characters-hint">${uiText("workbench.characters.limit-actions-hint")}</p><div data-character-actions-list></div></div>
            <p class="characters-hint" data-character-actions-status role="status"></p>
            <div class="characters-inline-actions"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-character-actions-refresh>${icon("refresh")}<span>${uiText("workbench.characters.refresh-directory")}</span></button><a class="characters-link" href="/capabilities/access?client=agent%3Aprologue">${uiText("workbench.characters.manage-grants")}</a></div>
          </fieldset>
        </section>
        <section class="settings-section characters-block" aria-labelledby="characters-publish-title">
          <div class="characters-block-head"><div><h2 id="characters-publish-title">${uiText("workbench.characters.publish-project")}</h2><p class="characters-hint">${uiText("workbench.characters.publish-hint")}</p></div>
            <div class="characters-block-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-preview>${uiText("workbench.characters.review-publish")}</button></div></div>
          <div class="characters-versions" data-character-publications aria-label="${uiText("workbench.characters.project-versions")}"></div>
        </section>
        <section class="settings-section characters-block characters-danger" aria-labelledby="characters-state-title">
          <h2 id="characters-state-title">${uiText("workbench.characters.disable-delete")}</h2>
          <p class="characters-hint">${uiText("workbench.characters.disable-delete-hint")}</p>
          <div class="characters-inline-actions"><button class="mw-btn mw-btn--secondary" type="button" data-character-toggle>${uiText("workbench.characters.disable")}</button><button class="mw-btn mw-btn--ghost" type="button" data-character-delete>${uiText("workbench.characters.delete")}</button></div>
        </section>
        <footer class="characters-savebar"><p class="characters-hint" data-character-draft-note></p>
          <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-character-reload>${uiText("workbench.characters.reload-saved")}</button>
          <button class="mw-btn mw-btn--primary" type="submit" data-character-save>${uiText("workbench.characters.save-draft")}</button></footer>
      </form>
    </div>
    <p class="characters-notice" data-character-notice role="status" aria-live="polite"></p>
    ${renderCharacterImport()}
    <dialog class="mw-dialog mw-dialog--form characters-dialog" data-character-dialog aria-label="${uiText("workbench.characters.confirm-action")}"><form class="mw-form mw-dialog__shell" method="dialog"><header class="mw-form__header"><h2 data-character-dialog-title></h2></header><section class="mw-form__body"><p data-character-dialog-description></p><pre data-character-dialog-content></pre></section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">${uiText("common.control.cancel")}</button><button class="mw-btn mw-btn--primary" type="button" data-character-confirm>${uiText("common.control.confirm")}</button></footer></form></dialog>
  </section>`;
}
