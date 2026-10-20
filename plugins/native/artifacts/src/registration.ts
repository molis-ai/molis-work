import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest, artifactReferenceUiContribution, artifactBrowserUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, catalog_order: 21,
  manifest: artifactsManifest,
  summary: "项目的固定成果，各版本可回看。",
  workbench: {
    order: 18,
    contributions: [artifactReferenceUiContribution, artifactBrowserUiContribution],
  },
};
