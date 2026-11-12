import { t as uiText, renderAlert, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SETTINGS_RUNNING_CLIENT_SCRIPT } from "./scripts/settings-running.js";
import { settingRow } from "./settings-row.js";

/**
 * 设置 › 运行 (specs/proactive-assistant/resident-runtime-design.md §5): whether the desktop opens at login and whether Molis Work keeps
 * running with the window closed. Both are the desktop's own (the system's login items, `config/desktop.json`), read and changed through
 * its native commands, so the page lists them only in the desktop app; a browser that opens the address is told where they are.
 */
export function renderRunningSettings(desktopShell: boolean): string {
  const heading = `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${uiText("workbench.settings-running.title")}</h1></div></header>`;
  if (!desktopShell) {
    return `<section class="settings-document" aria-labelledby="settings-title">${heading}${renderAlert({ tone: "info", role: null, title: uiText.text("workbench.settings-running.desktop-only") })}</section>`;
  }
  const toggle = (key: "launch_at_login" | "keep_running", title: string, description: string) => settingRow(`<span id="running-${key}">${uiText(title)}</span>`, uiText(description),
    renderSwitch({ disabled: true, attrs: { "data-running-setting": key, "aria-labelledby": `running-${key}` } }));
  return `<section class="settings-document" aria-labelledby="settings-title" data-running-settings>
    ${heading}
    <section class="settings-section" aria-label="${uiText("workbench.settings-running.title")}">
      ${toggle("launch_at_login", "workbench.settings-running.launch-at-login", "workbench.settings-running.launch-at-login-hint")}
      ${toggle("keep_running", "workbench.settings-running.keep-running", "workbench.settings-running.keep-running-hint")}
    </section>
    <p class="settings-form-error" role="alert" data-running-error hidden></p>
  </section><script>${SETTINGS_RUNNING_CLIENT_SCRIPT}</script>`;
}
