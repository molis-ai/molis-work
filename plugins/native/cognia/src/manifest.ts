import { COGNIA_ACTIONS, COGNIA_ACTION_PERMISSIONS } from "./actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { COGNIA_PLUGIN_ID } from "./types.js";
import { COGNIA_UI_CONTRIBUTION_ID } from "./ui.js";
import { COGNIA_MCP_EXPORTS } from "./mcp.js";
export const cogniaManifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: COGNIA_PLUGIN_ID, version: "1.0.0", name: "Cognia", kind: "native", publisher: { publisher_id: "molis", signature: "official-cognia-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], actions: COGNIA_ACTIONS, permissions: [...COGNIA_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按调用者授权使用 Cognia 能力" })), { permission: "storage:private", required: true, reason: "本机知识库、导入快照与审阅草稿" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, mcp_exports: [...COGNIA_MCP_EXPORTS], ui: { contributions: [COGNIA_UI_CONTRIBUTION_ID], views: [{ view_id: "cognia", slot: "navigator", title: "Cognia", contribution_id: COGNIA_UI_CONTRIBUTION_ID, icon: "book", order: 36 }] } };
