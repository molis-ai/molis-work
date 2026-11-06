import { V_HOST_API, V_MANIFEST_SCHEMA, V_PACKAGE_PLUGINS_NATIVE_JELLY_MANIFEST_JELLYMANIFEST } from "./versions.generated.js";
import { jellySync } from "./replication.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { JELLY_PLUGIN_ID } from "./contract.js";
import { JELLY_UI_CONTRIBUTION_ID } from "./ui.js";
import { JELLY_ACTIONS, JELLY_ACTION_PERMISSIONS } from "./actions.js";
import { JELLY_DATABASE } from "./database.js";
import { JELLY_MODEL_CONFIGURATION } from "./model-configuration.js";
import { JELLY_MESSAGES } from "./messages.js";
import { JELLY_EN } from "./en.js";
export const jellyManifest: PluginManifest = {
  summary: "日历与笔记，按天安排。",
  schema_version: V_MANIFEST_SCHEMA, host_api_version: V_HOST_API, plugin_id: JELLY_PLUGIN_ID, version: V_PACKAGE_PLUGINS_NATIVE_JELLY_MANIFEST_JELLYMANIFEST, name: "Jelly", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-jelly-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机日历、笔记及撤销恢复记录" },
    ...JELLY_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按每项能力的授权读写个人内容、使用模型或管理模型选择" })),
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  actions: [...JELLY_ACTIONS],
  runtime: { scope: "home" },
  databases: { home: JELLY_DATABASE },
  model_configuration: JELLY_MODEL_CONFIGURATION,
  sync: jellySync,
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
  ui: { messages: JELLY_MESSAGES, translations: JELLY_EN, contributions: [JELLY_UI_CONTRIBUTION_ID], views: [{ view_id: "jelly", slot: "navigator", title: "Jelly", contribution_id: JELLY_UI_CONTRIBUTION_ID, icon: "calendar", hue: "mint", order: 35, group: "personal" }] },
};
