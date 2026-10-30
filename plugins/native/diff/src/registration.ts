import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createDiffPlugin, DIFF_CLIENT_FACTORY_SCRIPT, DIFF_PROJECT_PLUGIN_ID, diffManifest, diffUiContribution } from "./index.js";
import { diffBoardSpecimens } from "./board-specimens.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: DIFF_PROJECT_PLUGIN_ID, catalog_order: 25,
  manifest: diffManifest,
  project_runtime: { create: createDiffPlugin, package_name: "@molis-ai/molis-work-plugin-diff", factory_export: "createDiffPlugin" },
  workbench: { order: 23, contributions: [diffUiContribution], clientFactory: DIFF_CLIENT_FACTORY_SCRIPT, specimens: diffBoardSpecimens },
};
