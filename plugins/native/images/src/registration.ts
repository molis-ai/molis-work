import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { IMAGES_PROJECT_PLUGIN_ID, imagesManifest, imagesUiContribution, IMAGES_STYLES, IMAGES_CLIENT_FACTORY_SCRIPT, imagesProjectData, createImagesPlugin } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: IMAGES_PROJECT_PLUGIN_ID, catalog_order: 4,
  runtime: { create: createImagesPlugin,
    package_name: "@molis-ai/molis-work-plugin-images", factory_export: "createImagesPlugin" },
  manifest: imagesManifest,
  project_data: imagesProjectData,
  personal: true,
  workbench: {
    order: 2,
    contributions: [imagesUiContribution],
    stylesheet: IMAGES_STYLES,
    clientFactory: IMAGES_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-images-job]", idDataset: "imagesJob" },
  },
};
