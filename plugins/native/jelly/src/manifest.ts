import { jellySync } from "./replication.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { JELLY_PLUGIN_ID } from "./contract.js";
import { JELLY_UI_CONTRIBUTION_ID } from "./ui.js";
import { JELLY_ACTIONS, JELLY_ACTION_PERMISSIONS } from "./actions.js";
import { JELLY_DATABASE } from "./database.js";
import { JELLY_MODEL_CONFIGURATION } from "./model-configuration.js";
export const jellyManifest: PluginManifest = {
  summary: "日历与笔记，按天安排。",
  schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: JELLY_PLUGIN_ID, version: /* @version product.release */ "0.1.0", name: "Jelly", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-jelly-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机日历、笔记及撤销恢复记录" },
    ...JELLY_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按每项能力的授权读写个人内容、使用模型或管理模型选择" })),
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  actions: [...JELLY_ACTIONS],
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  // 日历 is the person's 日程 without the notes; 笔记 (full text, search, whole-workspace exports) is a switch of its own.
  read_groups: [
    { group_id: "calendar", title: "日历", description: "日历事项与进展", actions: ["jelly.calendar.list", "jelly.calendar.progress", "jelly.item.get"] },
    { group_id: "notes", title: "笔记", description: "笔记全文、搜索，以及整个 Jelly 工作区的读取与导出",
      actions: ["jelly.search", "jelly.note.export", "jelly.note.subject.read", "jelly.content.list", "jelly.content.read", "jelly.workspace.get", "jelly.workspace.export"] },
  ],
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
  ui: { locales: { default: "zh", available: ["zh", "en"] }, contributions: [JELLY_UI_CONTRIBUTION_ID], views: [{ view_id: "jelly", slot: "navigator", title: "Jelly", contribution_id: JELLY_UI_CONTRIBUTION_ID, icon: "calendar", hue: "mint", order: 35, group: "personal" }] },
};
