import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { CHARACTERS_PROJECT_PLUGIN_ID, charactersManifest, charactersSettingsUiContribution, CHARACTERS_CLIENT_FACTORY_SCRIPT } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: CHARACTERS_PROJECT_PLUGIN_ID, catalog_order: 14,
  manifest: charactersManifest,
  personal: true,
  summary: "定义 AI 做事方式，供任务选用。",
  // Its page is rendered by the project's running plugin and shown as Settings › 角色; this registers that page.
  workbench: {
    order: 14,
    contributions: [charactersSettingsUiContribution],
    clientFactory: CHARACTERS_CLIENT_FACTORY_SCRIPT,
  },
};
