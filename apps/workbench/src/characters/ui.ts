import { CHARACTERS_STYLES } from "./styles.js";
import { icon, renderNote, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { renderCharacterImport, renderCharacterSource } from "./import-ui.js";
import type { AgentDisplayModel } from "../settings-view.js";
import { scriptJson } from "../plugin-directory.js";

// 角色 is the Host's own page (CHR-1, decision #26) in two places (docs/design/role-scope, plan C): inside a project the settings
// cover shows it as a stage surface (project settings › 角色: this project's default and members); Settings › 角色 draws it over the
// personal space (the person's default and originals). The same browser program (src/browser/characters) fills both from one
// catalog read; every edit opens the right drawer over the page and comes back to it.
export interface CharactersUiModel {
  route_prefix: string;
  /** `project`: this project's roles; `personal`: the person's own, read in the personal space. */
  scope?: "project" | "personal";
  primitives: { escape(value: unknown): string };
  agent_display_model?: AgentDisplayModel;
}

/** What the page calls each import source: a saved snapshot holds only `runtime_id`, and the register stays out of the browser. */
const RUNTIME_NAMES = JSON.stringify(Object.fromEntries(CHARACTER_IMPORT_RUNTIMES.map(id => [id, externalTool(id).display_name])));

/** The editor over the page: its head, notices, versions and footer are drawn by the program; the fields stay put while it is open. */
function renderDrawer(): string {
  return `<dialog class="mw-drawer mw-drawer--right roles-drawer" data-character-drawer aria-labelledby="roles-drawer-title">
    <form class="mw-form mw-drawer__shell" data-character-editor novalidate>
      <header class="mw-form__header roles-drawer__head" data-character-drawer-head></header>
      <div class="mw-form__body mw-scroll roles-drawer__body">
        <div class="roles-drawer__notices" data-character-drawer-notices></div>
        <section class="roles-dsec" aria-labelledby="roles-way-title">
          <div class="roles-dsec__head"><h3 id="roles-way-title">${uiText("workbench.roles.way")}</h3><span data-character-way-state></span></div>
          <label class="roles-field" data-character-title-field><span class="roles-field__k">${uiText("workbench.characters.name")}</span><input class="mw-input" data-character-title maxlength="120" autocomplete="off" placeholder="${uiText("workbench.roles.name-example")}"></label>
          <label class="roles-field"><span class="mw-sr-only">${uiText("workbench.roles.way")}</span><textarea class="mw-input" data-character-instructions maxlength="20000" rows="7" placeholder="${uiText("workbench.roles.way-placeholder")}"></textarea></label>
        </section>
        <section class="roles-dsec" aria-labelledby="roles-tools-title">
          <div class="roles-dsec__head"><h3 id="roles-tools-title">${uiText("workbench.roles.tools")}</h3><span data-character-tools-state></span></div>
          <label class="mw-check-row"><input class="mw-check" type="checkbox" data-character-inherit checked><span>${uiText("workbench.characters.inherit-tools")}</span></label>
          <label class="roles-field" data-character-tools-field hidden><span class="roles-field__k">${uiText("workbench.characters.limit-tools")}</span><input class="mw-input" data-character-tools placeholder="read-file, search" autocomplete="off" spellcheck="false"><small class="mw-field__hint">${uiText("workbench.characters.limit-tools-hint")}</small></label>
          <label class="mw-check-row"><input class="mw-check" type="checkbox" data-character-actions-inherit checked><span>${uiText("workbench.characters.inherit-actions")}</span></label>
          <div data-character-actions-field hidden><p class="mw-field__hint">${uiText("workbench.characters.limit-actions-hint")}</p><div data-character-actions-list></div></div>
          <p class="mw-field__hint" data-character-actions-status role="status"></p>
          <div class="roles-inline"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-character-actions-refresh>${icon("refresh")}<span>${uiText("workbench.characters.refresh-directory")}</span></button><a class="roles-link" href="/capabilities/access?client=agent%3Aprologue">${uiText("workbench.characters.manage-grants")}</a></div>
          ${renderNote({ text: uiText.text("workbench.roles.narrow-only"), icon: "shield" })}
        </section>
        <details class="mw-collapsible roles-versions" data-slot="collapsible" data-character-versions-fold hidden><summary data-character-versions-summary>${uiText("workbench.roles.versions")}</summary>
          <div class="mw-collapsible__body"><div data-character-versions></div>${renderNote({ text: uiText.text("workbench.roles.restore-note"), icon: "history" })}</div></details>
        ${renderCharacterSource()}
      </div>
      <footer class="mw-form__footer roles-drawer__foot" data-character-drawer-foot></footer>
    </form>
  </dialog>`;
}

/** The role page. Its sections are read once and drawn by the program; system and plugin roles are listed only in Settings. */
export function renderCharacters(model: CharactersUiModel): string {
  const p = model.primitives, personal = model.scope === "personal";
  const data = `data-characters data-character-scope="${personal ? "personal" : "project"}" data-character-api="${p.escape(model.route_prefix)}/api/plugins/io.molis.work.characters" data-character-runtime-names="${p.escape(RUNTIME_NAMES)}"`;
  const heading = `<header class="settings-heading"><div class="settings-heading-title"><h1 id="${personal ? "settings-title" : "roles-title"}">${uiText("workbench.characters.title")}</h1></div>
      <p>${uiText(personal ? "workbench.roles.about-personal" : "workbench.roles.about-project")}</p></header>`;
  const builtin = personal ? `<section class="settings-section mw-settings-section roles-builtin" aria-labelledby="roles-builtin-title" data-character-builtin data-character-builtin-api="/api/agent-definitions/roles" data-character-builtin-settings="/settings/prompts">
      <script type="application/json" data-agent-display-model="roles">${scriptJson(model.agent_display_model ?? {})}</script>
      <header class="mw-settings-section__head roles-sec-head"><h2 id="roles-builtin-title">${uiText("workbench.characters.builtin")}</h2></header>
      <div class="mw-settings-section__rows"><p class="roles-hint">${uiText("workbench.characters.builtin-hint")}</p>
      <div class="roles-builtin-list" data-character-builtin-list role="list"><p class="roles-hint mw-loading">${uiText("workbench.characters.loading")}</p></div></div>
    </section>` : "";
  const body = `<style>${CHARACTERS_STYLES}</style>${heading}
    <div class="roles-body" data-character-body aria-busy="true"><p class="roles-hint mw-loading">${uiText("workbench.characters.loading")}</p></div>
    ${builtin}
    <p class="roles-notice" data-character-notice role="status" aria-live="polite"></p>
    ${renderDrawer()}
    ${renderCharacterImport()}`;
  return `<section class="settings-document roles-page" aria-labelledby="${personal ? "settings-title" : "roles-title"}" data-settings-panel="characters" ${data}>${body}</section>`;
}
