import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { JELLY_PROJECT_PLUGIN_ID, jellyManifest, JELLY_CLIENT_FACTORY_SCRIPT, JELLY_STYLES, jellyUiContribution, createJellyPlugin } from "./index.js";
import { JELLY_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: JELLY_PROJECT_PLUGIN_ID, catalog_order: 5,
  runtime: { create: createJellyPlugin,
    package_name: "@molis-ai/molis-work-plugin-jelly", factory_export: "createJellyPlugin" },
  messages: JELLY_MESSAGES,
  manifest: jellyManifest,
  personal: true,
  workbench: {
    order: 3,
    contributions: [jellyUiContribution],
    stylesheet: JELLY_STYLES,
    clientFactory: JELLY_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-jelly-id]", idDataset: "jellyId" },
  },
};
