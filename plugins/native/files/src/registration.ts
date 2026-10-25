import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { FILES_CLIENT_FACTORY_SCRIPT, FILES_PROJECT_PLUGIN_ID, FILES_STYLES, filesManifest, filesUiContribution } from "./index.js";
import { FILES_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: FILES_PROJECT_PLUGIN_ID, catalog_order: 23,
  messages: FILES_MESSAGES,
  manifest: filesManifest,
  workbench: { order: 21, contributions: [filesUiContribution], clientFactory: FILES_CLIENT_FACTORY_SCRIPT, stylesheet: FILES_STYLES },
};
