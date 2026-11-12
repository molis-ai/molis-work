import { BASELINE_FONT, BASELINE_SKIN, renderDialog, renderHint, renderLookCard, renderLookGroup, renderLookProof, renderSheet } from "@molis-ai/molis-work-design-system";
import type { UiDefinitionRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, escapeHtml, icon, renderButton, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WebLocalePreference } from "./i18n.js";
import { WORKBENCH_LANGUAGES } from "./platform-languages.js";
import { appearanceJson, type WorkbenchAppearance, type WorkbenchAppearanceChoices } from "./appearance-document.js";

interface AppearanceSettingsPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  currentLocale(): string;
  localeSwitchHref(locale: WebLocalePreference, nextPath: string): string;
}

export interface AppearanceSettingsModel {
  readonly current: WorkbenchAppearance;
  readonly choices: WorkbenchAppearanceChoices;
}
const scope = ({ id, revision }: UiDefinitionRef) => `${id}@${revision}`;

function renderAppearanceChoices(readText: AppearanceSettingsPrimitives["readText"], { current, choices }: AppearanceSettingsModel): string {
  const { snapshot, selection } = current;
  const active = choices.skins.find(skin => scope(skin.ref) === scope(snapshot.skin));
  const cards = choices.skins.map(skin => renderLookCard(readText, {
    id: skin.ref.id, name: skin.name, by: readText("workbench.immersive-shell.built"), previewSkin: scope(skin.ref),
  }, { inUse: skin === active, fontName: choices.fonts.find(font => scope(font.ref) === scope(skin.recommended_font))?.name })).join("");
  const option = (control: string, id: string, label: string, pressed: boolean) =>
    renderButton({ label, variant: "secondary", size: "sm", attrs: { [control]: id, "aria-pressed": String(pressed) } });
  const fonts = choices.fonts.filter(font => font.ref.id !== "system-menlo");
  const proof = renderLookProof(readText, {
    look: { id: snapshot.skin.id, name: active?.name ?? "Soft Workbench", by: readText("workbench.immersive-shell.built") }, state: "idle",
    scopes: { skin: scope(snapshot.skin), font: scope(snapshot.font.scheme), mono: scope(snapshot.font.mono) },
  });
  return `<div class="appearance-choices" data-appearance-settings>
    <script type="application/json" data-appearance-choices>${appearanceJson(choices)}</script>
    <div class="appearance-controls">
      <section class="settings-section appearance-picker" aria-label="${escapeHtml(uiText.text("workbench.settings-appearance.skin"))}">
        <h2>${escapeHtml(uiText.text("workbench.settings-appearance.skin"))}</h2>${renderLookGroup(readText, cards)}
        <div class="appearance-pick-row"><strong>${escapeHtml(uiText.text("workbench.settings-appearance.interface-font"))}</strong>
          <div class="appearance-options" role="group" aria-label="${escapeHtml(uiText.text("workbench.settings-appearance.interface-font"))}">
            ${option("data-appearance-font", "follow", uiText.text("workbench.settings-appearance.use-skins-recommendation"), selection.font.policy === "follow-skin")}
            ${fonts.map(font => option("data-appearance-font", font.ref.id, font.name, selection.font.policy === "pinned" && scope(selection.font.scheme) === scope(font.ref))).join("")}
          </div>
        </div>
        <div class="appearance-pick-row"><strong>${escapeHtml(uiText.text("workbench.settings-appearance.monospace-font"))}</strong>
          <div class="appearance-options" role="group" aria-label="${escapeHtml(uiText.text("workbench.settings-appearance.monospace-font"))}">
            ${option("data-appearance-mono", "", uiText.text("workbench.settings-appearance.system-mono"), selection.mono === null)}
            ${choices.fonts.filter(font => font.ref.id === "system-menlo").map(font => option("data-appearance-mono", font.ref.id, font.name, selection.mono?.id === font.ref.id)).join("")}
          </div>
        </div>
      </section>
      <button class="mw-btn mw-btn--link" data-appearance-restore type="button">${escapeHtml(uiText.text("workbench.settings-appearance.restore-built-appearance"))}</button>
      <button class="mw-btn mw-btn--secondary appearance-proof-open" data-appearance-preview type="button" hidden>${escapeHtml(uiText.text("workbench.settings-appearance.view-specimen"))}</button>
    </div>
    <div data-appearance-proof-home>${proof}</div>
    ${renderSheet({ labelledBy: "appearance-proof-sheet-title", title: uiText.text("workbench.settings-appearance.specimen"), closeLabel: uiText.text("workbench.settings-appearance.back-choices"),
      className: "appearance-proof-sheet", attrs: { "data-appearance-proof-sheet": true }, body: '<div data-appearance-proof-sheet-body></div>', footer: "" })}
  </div>`;
}

/** Recovery uses Soft's own complete token scope even if the surrounding selection cannot be rendered. */
export function renderAppearanceRecovery(_L: AppearanceSettingsPrimitives["readText"], current: WorkbenchAppearance | undefined): string {
  if (!current) return "";
  return renderDialog({
    title: uiText.text("workbench.settings-appearance.restore-built-appearance"), labelledBy: "appearance-recovery-title", closeLabel: uiText.text("common.control.close"), className: "appearance-recovery",
    attrs: { "data-appearance-recovery": true, "data-ui-skin": scope(BASELINE_SKIN.ref),
      "data-ui-font": scope(BASELINE_FONT.ref), "data-ui-mono": scope(BASELINE_FONT.ref) },
    body: `<p>${escapeHtml(uiText.text("workbench.settings-appearance.switch-soft-workbench-system-fonts-every-window-home"))}</p><p data-appearance-recovery-status role="status" hidden></p>`,
    footer: renderButton({ label: uiText.text("workbench.settings-appearance.try-again"), variant: "secondary", attrs: { "data-appearance-check": true, hidden: true } })
      + renderButton({ label: uiText.text("common.control.cancel"), variant: "secondary", attrs: { "data-dialog-close": true } })
      + renderButton({ label: uiText.text("workbench.settings-appearance.restore-built-appearance"), variant: "primary", attrs: { "data-appearance-recover": true } }),
  }) + `<div class="mw-toast appearance-notice" data-appearance-notice hidden>
    <span data-appearance-message role="status" aria-live="polite"></span>
    <button class="mw-toast__action" type="button" data-appearance-undo hidden>${escapeHtml(uiText.text("workbench.settings-appearance.undo"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-read hidden>${escapeHtml(uiText.text("workbench.settings-appearance.try-again"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-continue hidden>${escapeHtml(uiText.text("workbench.settings-appearance.continue-change"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-dismiss aria-label="${escapeHtml(uiText.text("common.control.close"))}">${icon("x")}</button>
  </div>`;
}

export function renderAppearanceSettingsDocument(
  { readText, currentLocale, localeSwitchHref }: AppearanceSettingsPrimitives,
  nextPath: string,
  model?: AppearanceSettingsModel,
): string {
  const source = model?.current.snapshot.locale.source;
  const preference = source === "system" || source === "default" ? "system" : currentLocale();
  const language = (value: WebLocalePreference, label: string, tag?: string) =>
    `<a class="mw-toggle${preference === value ? " is-current" : ""}" href="${localeSwitchHref(value, nextPath)}" data-ui-language="${value}"${tag ? ` lang="${tag}"` : ""} aria-current="${preference === value}">${escapeHtml(label)}</a>`;
  const options = (attribute: string, values: [string, string][]) => `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group" role="group">${values.map(([value, label]) => `<button class="mw-toggle" type="button" ${attribute}="${value}" aria-pressed="false">${uiText(label)}</button>`).join("")}</div>`;
  const row = (title: string, description: string, control: string) => `<section class="settings-setting-row"><div class="setting-copy"><strong>${uiText(title)}</strong><span>${uiText(description)}</span></div><div class="setting-value" aria-label="${uiText(title)}">${control}</div></section>`;
  return `<section class="settings-document appearance-document" aria-labelledby="settings-title"><header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-appearance.interface-language")}</h1>${renderHint({ id: "settings-hint-appearance", label: uiText.text("workbench.settings-appearance.how-applies"), text: uiText.text("workbench.settings-appearance.theme-density-terminal-colors-saved-device") })}</div></header>
    ${model ? renderAppearanceChoices(readText, model) : ""}
    <section class="settings-section" aria-label="${uiText("workbench.settings-appearance.preferences")}">
    ${row("workbench.settings-appearance.theme", "workbench.settings-appearance.choose-theme-follow-system-appearance", options("data-theme-option", [["light", "workbench.primitive-catalog.light"], ["dark", "workbench.primitive-catalog.dark"], ["system", "workbench.language.follow-system"]]))}
    ${row("workbench.settings-appearance.language", "workbench.settings-appearance.change-interface-text-while-keeping-project-content-its", `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group" data-ui-language-options>${language("system", t.text("workbench.language.follow-system"))}${WORKBENCH_LANGUAGES.languages.map(value => language(value.tag, value.name, value.html_lang)).join("")}</div>`)}
    ${row("workbench.settings-appearance.interface-density", "workbench.settings-appearance.adjust-spacing-goal-navigation-content", options("data-density-option", [["standard", "workbench.settings-appearance.density-standard"], ["compact", "workbench.settings-appearance.density-compact"]]))}
    ${row("workbench.settings-appearance.terminal-appearance", "workbench.settings-appearance.choose-separate-color-scheme-terminal-content", options("data-terminal-theme-option", [["auto", "workbench.settings-appearance.follow-interface"], ["light", "workbench.primitive-catalog.light"], ["dark", "workbench.primitive-catalog.dark"]]))}
    </section>
  </section>`;
}

export function renderRuntimePlanDialog(ports: {
  readText(text: string): string;
  icon(name: "x", className?: string): string;
}): string {
  const { icon } = ports;
  return `<dialog class="runtime-plan-dialog" data-runtime-plan-dialog aria-labelledby="runtime-plan-title">
    <div class="runtime-plan-shell">
      <header><div><h2 id="runtime-plan-title" data-runtime-plan-title>${uiText("workbench.settings-appearance.runtime-connection-preview")}</h2><p data-runtime-plan-message>${uiText("workbench.settings-appearance.reading-change-plan")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-runtime-plan-close aria-label="${uiText("workbench.settings-appearance.close-preview")}">${icon("x")}</button></header>
      <div class="runtime-plan-body"><ul class="runtime-change-list" data-runtime-change-list></ul><dl class="runtime-plan-meta"><div><dt>${uiText("workbench.settings-appearance.backup")}</dt><dd data-runtime-plan-backup>${uiText("workbench.settings-appearance.no-backup-needed")}</dd></div><div><dt>${uiText("workbench.settings-appearance.afterward")}</dt><dd data-runtime-plan-restart>${uiText("workbench.settings-appearance.restart-runtime-page-says")}</dd></div></dl><label class="runtime-plan-confirm" data-runtime-confirm-row><input type="checkbox" data-runtime-confirm><span data-runtime-confirm-label>${uiText("workbench.settings-appearance.i-have-reviewed-confirm-change")}</span></label><p class="settings-form-error" data-runtime-plan-error role="alert" hidden></p></div>
      <footer><button class="mw-btn mw-btn--secondary" type="button" data-runtime-plan-close>${uiText("common.control.cancel")}</button><button class="mw-btn mw-btn--primary runtime-plan-apply" type="button" data-runtime-plan-apply disabled>${uiText("workbench.settings-appearance.apply")}</button></footer>
    </div>
  </dialog>`;
}
