import { t as uiText, escapeHtml, format, renderAlert, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SETTINGS_UPDATE_CLIENT_SCRIPT } from "./scripts/settings-update.js";
import { settingRow } from "./settings-row.js";
import type { MolisWorkSettingsView } from "./settings-view.js";

/** What the Host says about going back a version (upgrade-continuity U3 §5.2), for 设置 › 更新. */
export type SettingsRollbackPoint =
  | { readonly available: true; readonly version: string; readonly data: "unchanged" | "restore"; readonly written_since: string | null }
  | { readonly available: false; readonly reason: "no_previous" | "snapshot_missing" | "snapshot_invalid" | "upgrade_unfinished" };

export interface SettingsUpdateView {
  readonly point: SettingsRollbackPoint;
  /** Set after going back: the version it came back from, which the desktop does not put back on its own. */
  readonly held: { readonly held_version: string; readonly rolled_back_from: string } | null;
}

const REASON_KEY: Readonly<Record<Extract<SettingsRollbackPoint, { available: false }>["reason"], string>> = {
  no_previous: "workbench.settings-update.no-previous",
  snapshot_missing: "workbench.settings-update.snapshot-missing",
  snapshot_invalid: "workbench.settings-update.snapshot-invalid",
  upgrade_unfinished: "workbench.settings-update.upgrade-unfinished",
};

/** A date in the person's language. `format` gives HTML, but a date has nothing in it to escape, so it also reads as plain text. */
const when = (at: string | null) => at ? format.date(at, "datetime") : "";

/** The confirm dialog (11-04 specimen 「更新与回退」): what changes for the program and for the data, the copy that is saved first. */
function rollbackDialog(point: Extract<SettingsRollbackPoint, { available: true }>, current: string): string {
  const title = uiText.text("workbench.settings-update.go-back-to", { version: point.version });
  const data = point.data === "restore"
    ? uiText.text("workbench.settings-update.data-restore", { time: when(point.written_since) })
    : uiText.text("workbench.settings-update.data-unchanged");
  const warning = point.data === "restore"
    ? renderAlert({ tone: "warning", role: null, title: uiText.text("workbench.settings-update.written-since-goes-back", { time: when(point.written_since) }) }) : "";
  return `<dialog class="mw-dialog mw-dialog--alert" data-slot="alert-dialog" aria-labelledby="rollback-title" data-rollback-dialog>
    <form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="rollback-title">${escapeHtml(title)}？</h2></div></header>
      <div class="mw-form__body">
        ${settingRow(uiText.text("workbench.settings-update.program"), "", `<span class="setting-number">${escapeHtml(current)} → ${escapeHtml(point.version)}</span>`)}
        ${settingRow(uiText.text("workbench.settings-update.data"), escapeHtml(data), "")}
        ${warning}
        <label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" checked data-rollback-save><span>${uiText("workbench.settings-update.save-copy-first")}</span></label>
        <p class="settings-form-error" role="alert" data-rollback-error hidden></p>
      </div>
      <footer class="mw-form__footer">${renderButton({ variant: "secondary", label: uiText.text("common.control.cancel"), type: "submit", attrs: { value: "cancel" } })}${renderButton({ variant: "danger", label: title, attrs: { "data-rollback-confirm": true } })}</footer>
    </form>
  </dialog>`;
}

/**
 * 设置 › 更新 (U3 §5.4): the version in use and the way back to the one before. Going back is the desktop's to do (it owns the local service
 * and has to stop it), so the button is there in the desktop app; a browser gets the one command that does the same.
 */
export function renderUpdateSettings(view: MolisWorkSettingsView, desktopShell: boolean): string {
  const update = view.update, current = view.diagnostics.version ?? uiText.text("workbench.settings-update.unknown-version");
  const version = `<section class="settings-section" aria-label="${uiText("workbench.settings-update.version")}">${settingRow(uiText.text("workbench.settings-update.current-version"), "Molis Work", `<span class="setting-number">${escapeHtml(current)}</span>`)}</section>`;
  const held = update?.held ? renderAlert({ tone: "success", attrs: { "data-rollback-held": true },
    title: uiText.text("workbench.settings-update.rolled-back", { version: update.held.held_version }),
    body: uiText.text("workbench.settings-update.held", { version: update.held.rolled_back_from }),
    actions: [{ variant: "secondary", label: uiText.text("workbench.settings-update.install-again", { version: update.held.rolled_back_from }), attrs: { "data-rollback-lift": true } }] }) : "";
  const point = update?.point;
  let back = "";
  if (point?.available) {
    const subtitle = point.data === "restore" ? uiText.text("workbench.settings-update.before-upgrade", { version: point.version, time: when(point.written_since) }) : point.version;
    const action = desktopShell
      ? renderButton({ variant: "secondary", label: uiText.text("workbench.settings-update.go-back-to", { version: point.version }), attrs: { "data-rollback-open": true } })
      : `<code class="setting-command">molis-work home rollback --confirm</code>`;
    back = `<section class="settings-section" aria-labelledby="rollback-section">${settingRow(`<span id="rollback-section">${uiText("workbench.settings-update.go-back")}</span>`, escapeHtml(subtitle), action)}${desktopShell ? "" : `<p class="settings-muted">${uiText("workbench.settings-update.in-terminal")}</p>`}</section>${desktopShell ? rollbackDialog(point, current) : ""}`;
  } else if (point && !update?.held) {
    back = `<section class="settings-section" aria-labelledby="rollback-section">${settingRow(`<span id="rollback-section">${uiText("workbench.settings-update.go-back")}</span>`, uiText.text(REASON_KEY[point.reason]), "")}</section>`;
  }
  return `<section class="settings-document" aria-labelledby="settings-title" data-update-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${uiText("workbench.settings-update.title")}</h1></div></header>
    ${version}${held}${back}
    <div data-rollback-progress hidden>${renderAlert({ tone: "info", state: "running", title: uiText.text("workbench.settings-update.going-back"), body: uiText.text("workbench.settings-update.going-back-wait") })}</div>
  </section><script>${SETTINGS_UPDATE_CLIENT_SCRIPT}</script>`;
}
