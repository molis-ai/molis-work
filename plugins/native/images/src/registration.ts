import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { IMAGES_PROJECT_PLUGIN_ID, IMAGES_MESSAGES, imagesManifest, imagesUiContribution, IMAGES_STYLES, IMAGES_CLIENT_FACTORY_SCRIPT, imagesProjectData, createImagesPlugin, IMAGES_DATABASE, IMAGES_FILES, IMAGES_IMAGE_GENERATION } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { openImagesSyncStore, openImagesCopyOwner, createImagesSyncContent } from "./index.js";
export const registration: PluginRegistration = {
  sync:{saved_images:{scope:'projects',locate:syncTupleLocation('images',true,2, false),open:openImagesSyncStore,copy:openImagesCopyOwner,content:createImagesSyncContent}},
  project_plugin_id: IMAGES_PROJECT_PLUGIN_ID, catalog_order: 4,
  runtime: { scope: "home", create: createImagesPlugin, database: IMAGES_DATABASE, files: IMAGES_FILES, image_generation: IMAGES_IMAGE_GENERATION,
    package_name: "@molis-ai/molis-work-plugin-images", factory_export: "createImagesPlugin" },
  manifest: imagesManifest,
  messages: IMAGES_MESSAGES,
  project_data: imagesProjectData,
  personal: true,
  summary: "连接生图服务，按描述生成图片。",
  workbench: {
    order: 2,
    contributions: [imagesUiContribution],
    stylesheet: IMAGES_STYLES,
    clientFactory: IMAGES_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-images-job]", idDataset: "imagesJob" },
  },
};
