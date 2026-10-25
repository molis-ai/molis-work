import { createHomeShelfPlugin } from "./home-plugin.js";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createShelfPlugin, SHELF_MESSAGES, SHELF_PROJECT_PLUGIN_ID, shelfManifest, SHELF_CLIENT_FACTORY_SCRIPT, SHELF_SETTINGS_CLIENT_SCRIPT, SHELF_STYLES, shelfSettingsUiContribution, shelfUiContribution } from "./index.js";
import { shelfBoardSpecimens } from "./board-specimens.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: SHELF_PROJECT_PLUGIN_ID, catalog_order: 11,
  manifest: shelfManifest,
  project_runtime: { create: createShelfPlugin, package_name: "@molis-ai/molis-work-plugin-shelf", factory_export: "createShelfPlugin" },
  personal: true,
  home_store: { path: "shelf" },
  // The Home half of a dual-instance plugin; each project's half is `project_runtime` above. The sample goes on a new shelf once,
  // in the Home half's own `start`: reading the shelf writes nothing.
  runtime: { scope: "home", create: createHomeShelfPlugin, dual_instance: true,
    package_name: "@molis-ai/molis-work-plugin-shelf", factory_export: "createHomeShelfPlugin" },
  messages: SHELF_MESSAGES,
  workbench: {
    order: 8,
    contributions: [shelfUiContribution, shelfSettingsUiContribution],
    stylesheet: SHELF_STYLES,
    clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
    // Its terminal well runs xterm, which the side tab's own document has to load (the page loads it for the stage).
    clientAssets: ["/desktop/pty-client.js"],
    settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
    specimens: shelfBoardSpecimens,
  },
};
