import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { FILES_CLIENT_FACTORY_SCRIPT, FILES_PROJECT_PLUGIN_ID, filesManifest } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: FILES_PROJECT_PLUGIN_ID, catalog_order: 23,
  manifest: filesManifest,
  workbench: { order: 21, contributions: [], clientFactory: FILES_CLIENT_FACTORY_SCRIPT, clientFrom: "coding" },
  summary: "查看工作区文件与保留的内容。",
};
