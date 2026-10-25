import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PAGES_MESSAGES, PAGES_PROJECT_PLUGIN_ID, pagesManifest, PAGES_CLIENT_FACTORY_SCRIPT, PAGES_STYLES, pagesUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: PAGES_PROJECT_PLUGIN_ID, catalog_order: 15,
  manifest: pagesManifest,
  messages: PAGES_MESSAGES,
  personal: true,
  workbench: {
    order: 9,
    contributions: [pagesUiContribution],
    stylesheet: PAGES_STYLES,
    clientFactory: PAGES_CLIENT_FACTORY_SCRIPT,
    clientAssets: ["/assets/molis-work-pages-editor.js"],
    searchRow: { selector: "button.feed-stage-entry[data-page-id]", idDataset: "pageId" },
  },
};
