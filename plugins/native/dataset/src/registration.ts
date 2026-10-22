import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { DATASET_INSTRUCTIONS, DATASET_PROJECT_PLUGIN_ID, datasetManifest, DATASET_CLIENT_FACTORY_SCRIPT, DATASET_STYLES, datasetUiContribution, datasetProjectData, DATASET_HOME_STORE } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { syncTupleLocation, createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import { openDatasetStore, openDatasetCopyOwner } from "./index.js";
export const registration: PluginRegistration = {
  sync:{datasets:{scope:'projects',locate:syncTupleLocation('dataset',true,2, false),open:openDatasetStore,copy:openDatasetCopyOwner,content:createSyncJsonContent}},
  project_plugin_id: DATASET_PROJECT_PLUGIN_ID, catalog_order: 17,
  home_store: DATASET_HOME_STORE,
  manifest: datasetManifest,
  project_data: datasetProjectData,
  instructions: DATASET_INSTRUCTIONS,
  personal: true,
  summary: "做表格，导入 CSV，可回到旧版。",
  workbench: {
    order: 11,
    contributions: [datasetUiContribution],
    stylesheet: DATASET_STYLES,
    clientFactory: DATASET_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-dataset-id]", idDataset: "datasetId" },
  },
};
