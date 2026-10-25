import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { INBOX_PROJECT_PLUGIN_ID, inboxManifest, inboxUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: INBOX_PROJECT_PLUGIN_ID, catalog_order: 8,
  manifest: inboxManifest,
  workbench: {
    order: 6,
    contributions: [inboxUiContribution],
    recordRow: { selector: "[data-inbox-row][data-inbox-entry-id]", idDataset: "inboxEntryId" },
  },
};
