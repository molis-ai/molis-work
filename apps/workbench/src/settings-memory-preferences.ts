import { t as uiText, renderSettingRow, renderSettingsSection, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMemoryClassSettings } from "./settings-memory-classes.js";

/** One switch of the memory preferences: the whole row is its label. The switch waits, disabled, for the page to read what is stored. */
function prefRow(key: string, title: string, description: string): string {
  return renderSettingRow({ name: title, hint: description, label: true, className: "memory-pref",
    control: renderSwitch({ disabled: true, attrs: { "data-memory-pref": key, "aria-label": title } }) });
}

export function renderMemoryPreferences(personal: boolean): string {
  return `${renderSettingsSection({ title: uiText.text("workbench.settings-memory.how-memories-form"), id: "memory-form-title", className: "memory-prefs",
    body: `      ${renderSettingRow({ name: "", nameAttrs: { "data-memory-preference-source": true }, control: `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-preference-inherit hidden>${uiText("workbench.settings-memory.follow-default")}</button>` })}
      ${prefRow("form", uiText.text("workbench.settings-memory.allow-remembering"), personal ? uiText.text("workbench.settings-memory.main-switch-off-no-new-memories-no-suggestions") : uiText.text("workbench.settings-memory.off-no-new-memories-suggestions-project"))}
      ${renderSettingRow({ name: uiText.text("workbench.settings-memory.remember-when-ask"), hint: uiText.text("workbench.settings-memory.when-say-now-remember-kept-once-told-where"), hintAttrs: { "data-memory-pref-ask-copy": true }, className: "memory-pref-static", attrs: { "data-memory-pref-ask": true }, control: `<span data-memory-pref-ask-value>${uiText("workbench.settings-memory.always")}</span>` })}
      ${prefRow("auto", uiText.text("workbench.settings-memory.keep-low-risk-preferences-lessons-automatically"), uiText.text("workbench.settings-memory.kept-automatically-when-ask-same-thing-two-different"))}
      ${prefRow("learn_from_work", uiText.text("workbench.settings-memory.suggest-work"), uiText.text("workbench.settings-memory.when-work-ends-suggest-what-worth-keeping-accept"))}
      ${prefRow("learn_from_ui", uiText.text("workbench.settings-memory.learn-interface"), uiText.text("workbench.settings-memory.only-counts-how-often-accept-ignore-rewrite-undo"))}` })}
    ${renderSettingsSection({ title: uiText.text("workbench.settings-memory.who-can-use-them"), id: "memory-use-title", className: "memory-prefs",
      body: `      ${prefRow("consumers.assistant", uiText.text("workbench.settings-memory.assistant"), uiText.text("workbench.settings-memory.work-give-assistant-bottom-bar"))}
      ${prefRow("consumers.agent", uiText.text("workbench.settings-memory.agent-work"), uiText.text("workbench.settings-memory.coding-plugin-agents-workflows"))}
      ${prefRow("consumers.ui", uiText.text("workbench.settings-memory.interface-suggestions"), uiText.text("workbench.settings-memory.suggestions-based-what-looking"))}
      ${prefRow("consumers.plugin", uiText.text("workbench.settings-memory.plugins"), uiText.text("workbench.settings-memory.plugins-read-preferences-conventions-project-facts"))}
      ${prefRow("consumers.mcp", uiText.text("workbench.settings-memory.external-ai-clients"), personal ? uiText.text("workbench.settings-memory.clients-connected-over-mcp-personal-memories-closed-them") : uiText.text("workbench.settings-memory.clients-connected-over-mcp-read-only"))}
      ${renderMemoryClassSettings()}` })}`;
}
