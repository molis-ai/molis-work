import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest, LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_STYLES, lingguangUiContribution, lingguangProjectData, LINGGUANG_HOME_STORE } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: LINGGUANG_PROJECT_PLUGIN_ID, catalog_order: 12,
  home_store: LINGGUANG_HOME_STORE,
  manifest: lingguangManifest,
  project_data: lingguangProjectData,
  personal: true,
  summary: "先记下想法，再决定留下或丢掉。",
  workbench: {
    order: 13,
    contributions: [lingguangUiContribution],
    stylesheet: LINGGUANG_STYLES,
    clientFactory: LINGGUANG_CLIENT_FACTORY_SCRIPT, clientServed: true,
    searchRow: { selector: "[data-lingguang-id]", idDataset: "lingguangId" },
  },
};
