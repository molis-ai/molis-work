import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { FORM_PROJECT_PLUGIN_ID, formManifest, FORM_CLIENT_FACTORY_SCRIPT, FORM_STYLES, formUiContribution, formProjectData } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: FORM_PROJECT_PLUGIN_ID, catalog_order: 16,
  manifest: formManifest,
  project_data: formProjectData,
  personal: true,
  summary: "建问卷，收答卷，看逐题汇总。",
  workbench: {
    order: 10,
    contributions: [formUiContribution],
    stylesheet: FORM_STYLES,
    clientFactory: FORM_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-form-id]", idDataset: "formId" },
  },
};
