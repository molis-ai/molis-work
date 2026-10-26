import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: FEED_PROJECT_PLUGIN_ID, catalog_order: 10,
  manifest: feedManifest,
  // Enabling Feed always enables Inbox, so the attention entry cannot disappear.
  companions: ["inbox"],
  workbench: {
    order: 5,
    contributions: [feedUiContribution],
    stylesheet: FEED_STYLES,
    recordRow: { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" },
  },
};
