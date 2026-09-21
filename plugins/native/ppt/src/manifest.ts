import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PPT_PLUGIN_ID, PPT_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PPT_UI_CONTRIBUTION_ID } from "./ui.js";
import { PPT_MCP_EXPORTS } from "./mcp.js";

export { PPT_PLUGIN_ID, PPT_PROJECT_PLUGIN_ID };

export const pptManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PPT_PLUGIN_ID,
  version: "1.0.0",
  name: "PPT",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-ppt-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机演示稿库" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [PPT_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "PPT", contribution_id: PPT_UI_CONTRIBUTION_ID, icon: "image", order: 59 },
    ],
  },
  mcp_exports: [...PPT_MCP_EXPORTS],
};
