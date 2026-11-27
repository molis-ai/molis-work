import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createWorkflowsPlugin, WORKFLOWS_PROJECT_PLUGIN_ID, workflowsManifest, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_STYLES, workflowsUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORKFLOWS_PROJECT_PLUGIN_ID, catalog_order: 20,
  manifest: workflowsManifest,
  project_runtime: { create: createWorkflowsPlugin, package_name: "@molis-ai/molis-work-plugin-workflows", factory_export: "createWorkflowsPlugin" },
  observation: {
    coverage: [
      // Each handoff of a run, reported by Workflows as itself: the handoff's text stays in the run and is named, the action a station ran is
      // the exit's record under the same call. An action result over 20,000 characters is kept by the run as its size only.
      { fact: `${workflowsManifest.plugin_id}.step`, entries: ["plugin"], state: "complete", record_kind: "flow" },
      { fact: `${workflowsManifest.plugin_id}.step.action_result`, entries: ["plugin"], state: "by_rule", reason: "large_action_result_size_only", record_kind: "flow" },
    ],
  },
  workbench: {
    order: 16,
    contributions: [workflowsUiContribution],
    stylesheet: WORKFLOWS_STYLES,
    clientFactory: WORKFLOWS_CLIENT_FACTORY_SCRIPT,
  },
};
