import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DATASET_PLUGIN_ID, DATASET_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/dataset";
import { DATASET_UI_CONTRIBUTION_ID } from "./ui.js";
import { DATASET_MCP_EXPORTS } from "./mcp.js";

export { DATASET_PLUGIN_ID, DATASET_PROJECT_PLUGIN_ID };

export const datasetManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: DATASET_PLUGIN_ID,
  version: "1.0.0",
  name: "Dataset",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-dataset-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机数据表库" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [DATASET_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Dataset", contribution_id: DATASET_UI_CONTRIBUTION_ID, icon: "database", order: 58 },
    ],
  },
  mcp_exports: [...DATASET_MCP_EXPORTS],
};
