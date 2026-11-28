import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { WORK_BRIEF_CLIENT_FACTORY_SCRIPT } from "./client.js";
import { WORK_BRIEF_PROJECT_PLUGIN_ID } from "./identity.js";
import { workBriefManifest } from "./manifest.js";
import { createWorkBriefPlugin } from "./plugin.js";
import { workBriefUiContribution } from "./ui.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: WORK_BRIEF_PROJECT_PLUGIN_ID, catalog_order: 28, demo_seed: false,
  manifest: workBriefManifest,
  project_runtime: { create: createWorkBriefPlugin, package_name: "@molis-ai/molis-work-plugin-work-brief", factory_export: "createWorkBriefPlugin" },
  workbench: {
    order: 28,
    contributions: [workBriefUiContribution], clientFactory: WORK_BRIEF_CLIENT_FACTORY_SCRIPT,
  },
};
