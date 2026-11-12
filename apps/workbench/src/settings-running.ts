import { t as uiText, renderAlert, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { settingRow } from "./settings-row.js";

/**
 * 设置 › 运行 (specs/proactive-assistant/resident-runtime-design.md §5): whether the desktop opens at login and whether Molis Work keeps
 * running with the window closed. Both are the desktop's own (the system's login items, `config/desktop.json`), read and changed through
 * its native commands. The settings directory lists the page only in the desktop app; the page itself is the same everywhere, since a
 * section is fetched into the settings area without the desktop's marker. The switches show where the desktop's commands are
 * (`molisWorkBindRunningSettings`); anywhere else the page says where to find them.
 */
export function renderRunningSettings(): string {
  const toggle = (key: "launch_at_login" | "keep_running", title: string, description: string) => settingRow(`<span id="running-${key}">${uiText(title)}</span>`, uiText(description),
    renderSwitch({ disabled: true, attrs: { "data-running-setting": key, "aria-labelledby": `running-${key}` } }));
  return `<section class="settings-document" aria-labelledby="settings-title" data-running-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${uiText("workbench.settings-running.title")}</h1></div></header>
    ${renderAlert({ tone: "info", role: null, title: uiText.text("workbench.settings-running.desktop-only"), attrs: { "data-running-elsewhere": true } })}
    <section class="settings-section" aria-label="${uiText("workbench.settings-running.title")}" data-running-switches hidden>
      ${toggle("launch_at_login", "workbench.settings-running.launch-at-login", "workbench.settings-running.launch-at-login-hint")}
      ${toggle("keep_running", "workbench.settings-running.keep-running", "workbench.settings-running.keep-running-hint")}
    </section>
    <p class="settings-form-error" role="alert" data-running-error hidden></p>
  </section>`;
}
