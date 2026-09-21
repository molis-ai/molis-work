import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FUNCTIONS_PLUGIN_ID, FUNCTIONS_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { FUNCTIONS_UI_CONTRIBUTION_ID } from "./ui.js";
import { FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { FUNCTIONS_MCP_EXPORTS } from "./mcp.js";

export { FUNCTIONS_PLUGIN_ID, FUNCTIONS_PROJECT_PLUGIN_ID };

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const functionsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FUNCTIONS_PLUGIN_ID,
  version: "1.0.0",
  name: "Functions",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-functions-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: ["functions.evaluate"], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [FUNCTIONS_UI_CONTRIBUTION_ID, FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Functions", contribution_id: FUNCTIONS_UI_CONTRIBUTION_ID, icon: "sparkles", order: 55 },
      { view_id: "settings", slot: "settings", title: "Functions", contribution_id: FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID, order: 110 },
    ],
  },
  mcp_exports: [...FUNCTIONS_MCP_EXPORTS],
};
