import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { WORK_PROJECT_PLUGIN_ID, workManifest, workUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORK_PROJECT_PLUGIN_ID, catalog_order: 7,
  manifest: workManifest,
  summary: "回到你的会话，继续正在做的事。",
  workbench: {
    order: 17,
    contributions: [workUiContribution],
    recordRow: { selector: "[data-operation-select]", idDataset: "operationSelect" },
  },
};
