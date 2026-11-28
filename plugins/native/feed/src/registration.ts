import { FEED_CLIENT_FACTORY_SCRIPT } from "./client.js";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createFeedPlugin, FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {

  project_plugin_id: FEED_PROJECT_PLUGIN_ID, catalog_order: 10,
  manifest: feedManifest,
  project_runtime: { create: createFeedPlugin, package_name: "@molis-ai/molis-work-plugin-feed", factory_export: "createFeedPlugin" },
  workbench: {
    clientFactory: FEED_CLIENT_FACTORY_SCRIPT, clientMounts: "surfaces",
    order: 5,
    contributions: [feedUiContribution],
    stylesheet: FEED_STYLES,
    frameStyleFeatures: ["keep-edits", "source-ladder", "detail-reading"],
    stylesheetPrefixes: ["source-"],
    surfaceAliases: ["sources"],
    searchRow: { selector: "[data-feed-task-toggle]", idDataset: "feedTaskToggle" },
    searchRecordKinds: ["source"],
    reopenRecord: false,
    recordRow: { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" },
  },
};
