import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createApp } from "./studio/server/app.js";
import { ALCHEMIST_PROJECT_PLUGIN_ID, alchemistManifest, ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, alchemistUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: ALCHEMIST_PROJECT_PLUGIN_ID, catalog_order: 19,
  manifest: alchemistManifest,
  personal: true,
  workbench: {
    pageRequests: createApp(undefined, { invoke: () => Promise.reject(new Error("Route catalog only")) }).routes
      .filter(route => route.method !== "ALL" && !route.path.includes("*"))
      .map(route => ({ method: route.method, path: "/api/alchemist/studio" + route.path })),
    order: 15,
    contributions: [alchemistUiContribution],
    stylesheet: ALCHEMIST_STYLES,
    clientFactory: ALCHEMIST_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-alchemist-id]", idDataset: "alchemistId" },
  },
};
