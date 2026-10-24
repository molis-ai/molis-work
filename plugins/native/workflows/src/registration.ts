import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { WORKFLOWS_PROJECT_PLUGIN_ID, workflowsManifest, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_STYLES, workflowsUiContribution, workflowsProjectData, WORKFLOWS_HOME_STORE } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORKFLOWS_PROJECT_PLUGIN_ID, catalog_order: 20,
  home_store: WORKFLOWS_HOME_STORE,
  manifest: workflowsManifest,
  project_data: workflowsProjectData,
  personal: true,
  summary: "把插件串成流程，一步步做完。",
  workbench: {
    order: 16,
    contributions: [workflowsUiContribution],
    stylesheet: WORKFLOWS_STYLES,
    clientFactory: WORKFLOWS_CLIENT_FACTORY_SCRIPT,
  },
};
