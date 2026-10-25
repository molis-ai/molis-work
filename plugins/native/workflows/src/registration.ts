import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createWorkflowsPlugin, WORKFLOWS_MESSAGES, WORKFLOWS_PROJECT_PLUGIN_ID, workflowsManifest, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_STYLES, workflowsUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORKFLOWS_PROJECT_PLUGIN_ID, catalog_order: 20,
  manifest: workflowsManifest,
  project_runtime: { create: createWorkflowsPlugin, package_name: "@molis-ai/molis-work-plugin-workflows", factory_export: "createWorkflowsPlugin" },
  messages: WORKFLOWS_MESSAGES,
  personal: true,
  workbench: {
    order: 16,
    contributions: [workflowsUiContribution],
    stylesheet: WORKFLOWS_STYLES,
    clientFactory: WORKFLOWS_CLIENT_FACTORY_SCRIPT,
  },
};
