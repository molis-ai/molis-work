import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { COGNIA_PROJECT_PLUGIN_ID, cogniaManifest, COGNIA_CLIENT_FACTORY_SCRIPT, COGNIA_STYLES, cogniaUiContribution, createCogniaPlugin } from "./index.js";
import { COGNIA_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: COGNIA_PROJECT_PLUGIN_ID, catalog_order: 2,
  runtime: { create: createCogniaPlugin, package_name: "@molis-ai/molis-work-plugin-cognia", factory_export: "createCogniaPlugin" },
  messages: COGNIA_MESSAGES,
  manifest: cogniaManifest,
  personal: true,
  workbench: {
    order: 0,
    contributions: [cogniaUiContribution],
    stylesheet: COGNIA_STYLES,
    clientFactory: COGNIA_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-cognia-id]", idDataset: "cogniaId" },
  },
};
