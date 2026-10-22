import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { createFeedRuleReplica, installFeedReplication } from "./index.js";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import { SOURCE_CONTENT_REPLICA_ID } from "@molis-ai/molis-work-contracts/modules/sources";
import { SIGNAL_CONTENT_REPLICA_ID } from "@molis-ai/molis-work-contracts/modules/signals";
import { FEED_CONTENT_REPLICA_ID } from "@molis-ai/molis-work-contracts/modules/feed";
export const registration: PluginRegistration = {
  sync:{capture_rules:{scope:'project-database',kind:'feed_rule',install:installFeedReplication,create:createFeedRuleReplica,content:createSyncJsonContent},source_descriptions:{scope:'project-sections',kind:'project_sources',namespace:'sources',owners:[SOURCE_CONTENT_REPLICA_ID],content:createSyncJsonContent},messages:{scope:'project-sections',kind:'project_feed',namespace:'messages',owners:[SIGNAL_CONTENT_REPLICA_ID,FEED_CONTENT_REPLICA_ID],content:createSyncJsonContent}},
  project_plugin_id: FEED_PROJECT_PLUGIN_ID, catalog_order: 10,
  manifest: feedManifest,
  // Enabling Feed always enables Inbox, so the attention entry cannot disappear.
  companions: ["inbox"],
  summary: "订阅来源，读消息，留下值得留的。",
  workbench: {
    order: 5,
    contributions: [feedUiContribution],
    stylesheet: FEED_STYLES,
    recordRow: { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" },
  },
};
