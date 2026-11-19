import { t as uiText, renderSettingRow, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMemoryClassSettings } from "./settings-memory-classes.js";

/** One switch of the memory preferences: the whole row is its label. The switch waits, disabled, for the page to read what is stored. */
function prefRow(key: string, title: string, description: string): string {
  return renderSettingRow({ name: title, hint: description, label: true, className: "memory-pref",
    control: renderSwitch({ disabled: true, attrs: { "data-memory-pref": key, "aria-label": title } }) });
}

export function renderMemoryPreferences(personal: boolean): string {
  return `<section class="mw-settings-section memory-prefs" aria-labelledby="memory-form-title">
      <header class="mw-settings-section__head"><h2 id="memory-form-title">${uiText("workbench.settings-memory.how-memories-form")}</h2></header>
      <div class="mw-settings-section__rows">
      <div class="mw-setting-row"><span class="mw-setting-row__copy" data-memory-preference-source></span><span class="mw-setting-row__control"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-preference-inherit hidden>${uiText("workbench.settings-memory.follow-default")}</button></span></div>
      ${prefRow("form", uiText.text("workbench.settings-memory.allow-remembering"), personal ? uiText.text("workbench.settings-memory.main-switch-off-no-new-memories-no-suggestions") : uiText.text("workbench.settings-memory.off-no-new-memories-suggestions-project"))}
      <div class="mw-setting-row memory-pref-static" data-memory-pref-ask><span class="mw-setting-row__copy"><strong>${uiText("workbench.settings-memory.remember-when-ask")}</strong><span data-memory-pref-ask-copy>${uiText("workbench.settings-memory.when-say-now-remember-kept-once-told-where")}</span></span><span class="mw-setting-row__control" data-memory-pref-ask-value>${uiText("workbench.settings-memory.always")}</span></div>
      ${prefRow("auto", uiText.text("workbench.settings-memory.keep-low-risk-preferences-lessons-automatically"), uiText.text("workbench.settings-memory.kept-automatically-when-ask-same-thing-two-different"))}
      ${prefRow("learn_from_work", uiText.text("workbench.settings-memory.suggest-work"), uiText.text("workbench.settings-memory.when-work-ends-suggest-what-worth-keeping-accept"))}
      ${prefRow("learn_from_ui", uiText.text("workbench.settings-memory.learn-interface"), uiText.text("workbench.settings-memory.only-counts-how-often-accept-ignore-rewrite-undo"))}
      </div>
    </section>
    <section class="mw-settings-section memory-prefs" aria-labelledby="memory-use-title">
      <header class="mw-settings-section__head"><h2 id="memory-use-title">${uiText("workbench.settings-memory.who-can-use-them")}</h2></header>
      <div class="mw-settings-section__rows">
      ${prefRow("consumers.assistant", uiText.text("workbench.settings-memory.assistant"), uiText.text("workbench.settings-memory.work-give-assistant-bottom-bar"))}
      ${prefRow("consumers.agent", uiText.text("workbench.settings-memory.agent-work"), uiText.text("workbench.settings-memory.coding-plugin-agents-workflows"))}
      ${prefRow("consumers.ui", uiText.text("workbench.settings-memory.interface-suggestions"), uiText.text("workbench.settings-memory.suggestions-based-what-looking"))}
      ${prefRow("consumers.plugin", uiText.text("workbench.settings-memory.plugins"), uiText.text("workbench.settings-memory.plugins-read-preferences-conventions-project-facts"))}
      ${prefRow("consumers.mcp", uiText.text("workbench.settings-memory.external-ai-clients"), personal ? uiText.text("workbench.settings-memory.clients-connected-over-mcp-personal-memories-closed-them") : uiText.text("workbench.settings-memory.clients-connected-over-mcp-read-only"))}
      ${renderMemoryClassSettings()}
      </div>
    </section>`;
}
