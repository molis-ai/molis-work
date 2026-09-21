import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/form";
import { FORM_UI_CONTRIBUTION_ID } from "./ui.js";
import { FORM_MCP_EXPORTS } from "./mcp.js";

export { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID };

export const formManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FORM_PLUGIN_ID,
  version: "1.0.0",
  name: "Forms",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-form-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [FORM_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Forms", contribution_id: FORM_UI_CONTRIBUTION_ID, icon: "clipboard", order: 57 },
    ],
  },
  mcp_exports: [...FORM_MCP_EXPORTS],
};
