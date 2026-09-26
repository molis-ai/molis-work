import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { WORKFLOWS_PLUGIN_ID, WORKFLOWS_PROJECT_PLUGIN_ID } from "./model.js";
import { WORKFLOWS_UI_CONTRIBUTION_ID } from "./ui.js";

export { WORKFLOWS_PLUGIN_ID, WORKFLOWS_PROJECT_PLUGIN_ID };

export const workflowsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: WORKFLOWS_PLUGIN_ID,
  version: "1.0.0",
  name: "工作流程",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-workflows-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机保存流程和每一次的进度" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [WORKFLOWS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "工作流程", contribution_id: WORKFLOWS_UI_CONTRIBUTION_ID, icon: "workflow", order: 25 },
    ],
  },
};
