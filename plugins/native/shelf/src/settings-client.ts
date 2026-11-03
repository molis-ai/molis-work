import { readFileSync } from "node:fs";

import {
  CARBON_CMD_KEY,
  CARBON_CONTROL_KEY,
  CARBON_KEY_NAME,
  CARBON_OPTION_KEY,
  CARBON_SHIFT_KEY,
  KEYBOARD_CODE_TO_CARBON,
  MODIFIER_EVENT_CODES,
  defaultShelfHotKeys,
} from "@molis-ai/molis-work-module-shelf";

import { SHELF_PLUGIN_ID } from "./manifest.js";

const bundle = readFileSync(new URL("./shelf-settings-client.js", import.meta.url), "utf8").trim();

/**
 * Live-saves Shelf device settings from the global settings page. Its code is the type-checked TypeScript in
 * `src/browser/settings/`, bundled by esbuild into `dist/shelf-settings-client.js` when the package builds. The chord tables
 * belong to the Shelf module, so they and the plugin's route go in front of the bundle here, as the two constants its entry declares.
 */
export const SHELF_SETTINGS_CLIENT_SCRIPT = `(() => {
const SHELF_HOTKEY_TABLES = ${JSON.stringify({
  codes: KEYBOARD_CODE_TO_CARBON,
  names: CARBON_KEY_NAME,
  modifierCodes: MODIFIER_EVENT_CODES,
  defaults: defaultShelfHotKeys(),
  control: CARBON_CONTROL_KEY,
  option: CARBON_OPTION_KEY,
  shift: CARBON_SHIFT_KEY,
  cmd: CARBON_CMD_KEY,
})};
const SHELF_SETTINGS_API = ${JSON.stringify("/api/plugins/" + SHELF_PLUGIN_ID)};
${bundle}
})();`;
