import type {} from "@molis-ai/molis-work-plugin-sdk";
import { bindActionRows, bindSample, bindShortcutForm, showPermissions } from "./bind-actions.js";
import { bindEngine, bindModel, bindPanelKeys, bindRuntimes } from "./bind-basic.js";
import { bindDropWheel, bindHotkeys, installRecorder } from "./bind-hotkeys.js";
import { reloadPage } from "./reload.js";
import { markOccupied, refreshSettings } from "./save.js";
import type { HotkeyTables, SettingsPage, Translate } from "./types.js";

/**
 * The bundle's entry for the global settings page. The wrapper in src/settings-client.ts puts the chord tables and the plugin's
 * route in front of it; `L` is the page's own translator. Live-saves Shelf's device settings.
 */
declare const SHELF_HOTKEY_TABLES: HotkeyTables;
declare const SHELF_SETTINGS_API: string;
declare const L: Translate;

const page: SettingsPage = { api: (document.body.dataset.routePrefix || "") + SHELF_SETTINGS_API, tables: SHELF_HOTKEY_TABLES, L, settings: null, recording: null };

function bind(root?: ParentNode): void {
  const scope: ParentNode = root && "querySelector" in root ? root : document;
  const reload = () => reloadPage(page, bind);
  bindPanelKeys(page, scope);
  bindEngine(page, scope);
  bindModel(page, scope, reload);
  bindRuntimes(page, scope, reload);
  bindShortcutForm(page, scope, reload);
  bindActionRows(page, scope, reload);
  bindSample(page, scope);
  showPermissions(page, scope);
  void refreshSettings(page, scope);
  bindDropWheel(page, scope);
  bindHotkeys(page, scope);
  markOccupied(page, scope);
}

installRecorder(page);
globalThis.molisWorkBindShelfSettings = bind;
if (document.querySelector("[data-shelf-settings]")) bind(document);
