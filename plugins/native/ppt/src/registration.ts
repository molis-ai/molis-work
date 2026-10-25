import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createPptPlugin, PPT_MESSAGES, PPT_PROJECT_PLUGIN_ID, pptManifest, PPT_CLIENT_FACTORY_SCRIPT, PPT_STYLES, pptUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: PPT_PROJECT_PLUGIN_ID, catalog_order: 18,
  manifest: pptManifest,
  project_runtime: { create: createPptPlugin, package_name: "@molis-ai/molis-work-plugin-ppt", factory_export: "createPptPlugin" },
  messages: PPT_MESSAGES,
  personal: true,
  workbench: {
    order: 12,
    contributions: [pptUiContribution],
    stylesheet: PPT_STYLES,
    clientFactory: PPT_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-ppt-id]", idDataset: "pptId" },
  },
};
