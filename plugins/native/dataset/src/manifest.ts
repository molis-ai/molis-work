import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  DATASET_ARTIFACT_SCHEMA_VERSION,
  DATASET_ARTIFACT_TYPE_ID,
  DATASET_PLUGIN_ID,
  DATASET_PROJECT_PLUGIN_ID,
} from "@molis-ai/molis-work-contracts/modules/dataset";
import { DATASET_UI_CONTRIBUTION_ID } from "./ui.js";
import { DATASET_MCP_EXPORTS } from "./mcp.js";
import { datasetActions, DATASET_ACTION_PERMISSIONS } from "./actions.js";

export { DATASET_PLUGIN_ID, DATASET_PROJECT_PLUGIN_ID };

export const datasetManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: DATASET_PLUGIN_ID,
  version: "1.1.0",
  name: "Dataset",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-dataset-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机数据表库" },
    { permission: "artifact:write", required: true, reason: "把数据表存成 Artifact" },
    ...DATASET_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write").map(permission => ({ permission, required: true, reason: "数据表动作使用的读取、编辑或模型权限" })),
  ],
  actions: Object.values(datasetActions),
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [{ artifact_type_id: DATASET_ARTIFACT_TYPE_ID, schema_version: DATASET_ARTIFACT_SCHEMA_VERSION }],
    consumes: [],
  },
  ui: {
    contributions: [DATASET_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Dataset", contribution_id: DATASET_UI_CONTRIBUTION_ID, icon: "database", order: 58 },
    ],
  },
  mcp_exports: [...DATASET_MCP_EXPORTS],
};
