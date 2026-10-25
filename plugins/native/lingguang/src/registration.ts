import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createLingguangPlugin, LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest, LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_STYLES, lingguangUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: LINGGUANG_PROJECT_PLUGIN_ID, catalog_order: 12,
  manifest: lingguangManifest,
  project_runtime: { create: createLingguangPlugin, package_name: "@molis-ai/molis-work-plugin-lingguang", factory_export: "createLingguangPlugin" },
  personal: true,
  workbench: {
    order: 13,
    contributions: [lingguangUiContribution],
    stylesheet: LINGGUANG_STYLES,
    clientFactory: LINGGUANG_CLIENT_FACTORY_SCRIPT, clientServed: true,
    searchRow: { selector: "[data-lingguang-id]", idDataset: "lingguangId" },
  },
};
