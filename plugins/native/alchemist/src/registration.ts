import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { ALCHEMIST_PROJECT_PLUGIN_ID, ALCHEMIST_INSTRUCTIONS, alchemistManifest, ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, alchemistUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { openAlchemistSyncStore } from "./index.js";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
export const registration: PluginRegistration = {
  sync:{studio:{scope:'project-library',kind:'project_studio',open:openAlchemistSyncStore,content:createSyncJsonContent}},
  project_plugin_id: ALCHEMIST_PROJECT_PLUGIN_ID, catalog_order: 19,
  manifest: alchemistManifest,
  instructions: ALCHEMIST_INSTRUCTIONS,
  personal: true,
  summary: "写下方向，炼成可比较的卡再决定。",
  workbench: {
    order: 15,
    contributions: [alchemistUiContribution],
    stylesheet: ALCHEMIST_STYLES,
    clientFactory: ALCHEMIST_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-alchemist-id]", idDataset: "alchemistId" },
  },
};
