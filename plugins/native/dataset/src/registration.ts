import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createDatasetPlugin, DATASET_MESSAGES, DATASET_PROJECT_PLUGIN_ID, datasetManifest, DATASET_CLIENT_FACTORY_SCRIPT, DATASET_STYLES, datasetUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: DATASET_PROJECT_PLUGIN_ID, catalog_order: 17,
  manifest: datasetManifest,
  project_runtime: { create: createDatasetPlugin, package_name: "@molis-ai/molis-work-plugin-dataset", factory_export: "createDatasetPlugin" },
  messages: DATASET_MESSAGES,
  personal: true,
  workbench: {
    order: 11,
    contributions: [datasetUiContribution],
    stylesheet: DATASET_STYLES,
    clientFactory: DATASET_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-dataset-id]", idDataset: "datasetId" },
  },
};
