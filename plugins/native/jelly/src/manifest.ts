import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { JELLY_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/jelly";
import { JELLY_UI_CONTRIBUTION_ID } from "./ui.js";
import { JELLY_MCP_EXPORTS } from "./mcp.js";
import { JELLY_ACTIONS, JELLY_ACTION_PERMISSIONS } from "./actions.js";
export const jellyManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: JELLY_PLUGIN_ID, version: "1.0.0", name: "Jelly", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-jelly-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机日历、笔记、灵感及撤销恢复记录" },
    ...JELLY_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按每项能力的授权读写个人内容、使用模型或管理模型选择" })),
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  mcp_exports: [...JELLY_MCP_EXPORTS],
  actions: [...JELLY_ACTIONS],
  ui: { contributions: [JELLY_UI_CONTRIBUTION_ID], views: [{ view_id: "jelly", slot: "navigator", title: "Jelly", contribution_id: JELLY_UI_CONTRIBUTION_ID, icon: "calendar", order: 35 }] },
};
