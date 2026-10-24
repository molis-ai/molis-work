import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { JELLY_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/jelly";
import { JELLY_UI_CONTRIBUTION_ID } from "./ui.js";
import { JELLY_ACTIONS, JELLY_ACTION_PERMISSIONS } from "./actions.js";
import { JELLY_DATABASE } from "./database.js";
import { JELLY_MODEL_CONFIGURATION } from "./model-configuration.js";
export const jellyManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: JELLY_PLUGIN_ID, version: "0.3.0", name: "Jelly", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-jelly-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机日历、笔记及撤销恢复记录" },
    ...JELLY_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按每项能力的授权读写个人内容、使用模型或管理模型选择" })),
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  actions: [...JELLY_ACTIONS],
  databases: { home: JELLY_DATABASE },
  model_configuration: JELLY_MODEL_CONFIGURATION,
  routes: [
    { route_id: "jelly.workspace", method: "GET", path: "/" },
    { route_id: "jelly.calendar", method: "GET", path: "/calendar" },
    { route_id: "jelly.progress", method: "GET", path: "/progress" },
    { route_id: "jelly.export", method: "GET", path: "/export" },
    { route_id: "jelly.model.read", method: "GET", path: "/model-settings" },
    { route_id: "jelly.note.export", method: "GET", path: "/notes/:id/export" },
    { route_id: "jelly.commands", method: "POST", path: "/commands", max_body_bytes: 36_000_000 },
    { route_id: "jelly.preview", method: "POST", path: "/preview", max_body_bytes: 36_000_000 },
    { route_id: "jelly.ai", method: "POST", path: "/ai", max_body_bytes: 36_000_000, stream: "ndjson" },
    { route_id: "jelly.model.save", method: "POST", path: "/model-settings", max_body_bytes: 36_000_000 },
  ],
  ui: { contributions: [JELLY_UI_CONTRIBUTION_ID], views: [{ view_id: "jelly", slot: "navigator", title: "Jelly", contribution_id: JELLY_UI_CONTRIBUTION_ID, icon: "calendar", order: 35 }] },
};
