import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createFeedHomePlugin } from "./home-plugin.js";
import { createFeedPlugin, FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: FEED_PROJECT_PLUGIN_ID, catalog_order: 10,
  manifest: feedManifest,
  project_runtime: { create: createFeedPlugin, package_name: "@molis-ai/molis-work-plugin-feed", factory_export: "createFeedPlugin" },
  // The Home half of a dual-instance plugin; each project's half is `project_runtime` above. It keeps the Home's reference ledger of the
  // evidence bodies the projects hold, and deletes the ones nothing refers to (`services.evidenceCollector`, S-98).
  runtime: { create: createFeedHomePlugin, dual_instance: true, package_name: "@molis-ai/molis-work-plugin-feed", factory_export: "createFeedHomePlugin" },
  // Enabling Feed always enables Inbox, so the attention entry cannot disappear.
  companions: ["inbox"],
  workbench: {
    order: 5,
    contributions: [feedUiContribution],
    stylesheet: FEED_STYLES,
    recordRow: { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" },
  },
};
