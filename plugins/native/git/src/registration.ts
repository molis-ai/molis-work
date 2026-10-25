import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { GIT_CLIENT_FACTORY_SCRIPT, GIT_PROJECT_PLUGIN_ID, GIT_STYLES, gitManifest, gitUiContribution } from "./index.js";
import { GIT_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: GIT_PROJECT_PLUGIN_ID, catalog_order: 24,
  messages: GIT_MESSAGES,
  manifest: gitManifest,
  workbench: { order: 22, contributions: [gitUiContribution], clientFactory: GIT_CLIENT_FACTORY_SCRIPT, stylesheet: GIT_STYLES },
  summary: "查看工作区的版本与变更。",
};
