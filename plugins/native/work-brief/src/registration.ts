import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createHomeWorkBriefPlugin } from "./home-plugin.js";
import { createWorkBriefPlugin, WORK_BRIEF_CLIENT_FACTORY_SCRIPT, WORK_BRIEF_PROJECT_PLUGIN_ID, workBriefManifest, workBriefUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORK_BRIEF_PROJECT_PLUGIN_ID, catalog_order: 28,
  manifest: workBriefManifest,
  project_runtime: { create: createWorkBriefPlugin, package_name: "@molis-ai/molis-work-plugin-work-brief", factory_export: "createWorkBriefPlugin" },
  // The Home half of a dual-instance plugin: the personal brief. Each project's half is `project_runtime` above.
  runtime: { create: createHomeWorkBriefPlugin, dual_instance: true, package_name: "@molis-ai/molis-work-plugin-work-brief", factory_export: "createHomeWorkBriefPlugin" },
  workbench: {
    order: 28,
    contributions: [workBriefUiContribution], clientFactory: WORK_BRIEF_CLIENT_FACTORY_SCRIPT,
  },
};
