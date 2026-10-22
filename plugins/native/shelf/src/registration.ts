import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { SHELF_INSTRUCTIONS, SHELF_PROJECT_PLUGIN_ID, shelfManifest, SHELF_CLIENT_FACTORY_SCRIPT, SHELF_SETTINGS_CLIENT_SCRIPT, SHELF_STYLES, shelfSettingsUiContribution, shelfUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { shelfSyncDocument } from "./index.js";
export const registration: PluginRegistration = {
  sync:{copies:shelfSyncDocument},
  project_plugin_id: SHELF_PROJECT_PLUGIN_ID, catalog_order: 11,
  manifest: shelfManifest,
  instructions: SHELF_INSTRUCTIONS,
  personal: true,
  summary: "把文件放上来处理副本，原件不动。",
  workbench: {
    order: 8,
    contributions: [shelfUiContribution, shelfSettingsUiContribution],
    stylesheet: SHELF_STYLES,
    clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
    // Its terminal well runs xterm, which the side tab's own document has to load (the page loads it for the stage).
    clientAssets: ["/desktop/pty-client.js"],
    settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
  },
};
