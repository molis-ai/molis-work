import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { ARTIFACTS_PROJECT_PLUGIN_ID, ARTIFACTS_HOME_STORE, artifactsManifest, artifactReferenceUiContribution, artifactBrowserUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, catalog_order: 21,
  manifest: artifactsManifest,
  // Originals over 6 MB, kept by digest per project (original-store.ts); the module's owner removes a deleted project's directory.
  home_store: ARTIFACTS_HOME_STORE,
  workbench: {
    order: 18,
    contributions: [artifactReferenceUiContribution, artifactBrowserUiContribution],
  },
};
