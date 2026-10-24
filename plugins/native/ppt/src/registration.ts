import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PPT_PROJECT_PLUGIN_ID, pptManifest, PPT_CLIENT_FACTORY_SCRIPT, PPT_STYLES, pptUiContribution, pptProjectData } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: PPT_PROJECT_PLUGIN_ID, catalog_order: 18,
  manifest: pptManifest,
  project_data: pptProjectData,
  personal: true,
  summary: "写大纲，放映或导出 PowerPoint。",
  workbench: {
    order: 12,
    contributions: [pptUiContribution],
    stylesheet: PPT_STYLES,
    clientFactory: PPT_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-ppt-id]", idDataset: "pptId" },
  },
};
