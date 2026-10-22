import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_UI_CONTRIBUTION_ID } from "./ui.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { SHELF_RUNTIME_ACTIONS } from "./runtime-actions.js";
import { SHELF_ACTIONS } from "./actions.js";
import { codingResultDocument } from "@molis-ai/molis-work-contracts/modules/coding";

export const SHELF_PLUGIN_ID = "io.molis.work.shelf";
/** What the project database stores for this Plugin. */
export const SHELF_PROJECT_PLUGIN_ID = "shelf";

/**
 * Declarative placement for this first-party Plugin, a dual-instance one: the Home instance keeps the person's shelf, each
 * project's instance receives Coding results through Runtime grants and its durable input graph. Every permission is
 * required, as a dual-instance Manifest's must be.
 */
export const shelfManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: SHELF_PLUGIN_ID,
  version: "0.3.0",
  name: "Shelf",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-shelf-binding" },
  // 常开插件 (specs/side-shelf §3.2): on in every project, never in the plugin list, the market, the Dock or a project's
  // plugin settings, so it cannot be removed.
  always_on: true,
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机置物架文件与摘录" },
    { permission: "artifact:read", required: true, reason: "读取明确选择接收的 Coding 成果" },
    { permission: "shelf:read", required: true, reason: "读取置物架里的副本、剪贴板历史与设置" },
    { permission: "shelf:write", required: true, reason: "把副本、处理结果与设置写进置物架" },
    { permission: "model:invoke", required: true, reason: "用你配置的模型处理所选材料" },
    { permission: "materials:read", required: true, reason: "抽取 PDF、网页文件与图片里的文字" },
    { permission: "materials:fetch", required: true, reason: "抓取放进置物架的公开网页" },
    { permission: "materials:fetch_local", required: true, reason: "抓取放进置物架的本机网页" },
  ],
  // The text of a Coding result comes from Coding itself (the plugin audience only); Shelf adds its own heading and source.
  capabilities: { provides: [], consumes: [codingResultDocument.capability_id] },
  // The project instance offers the Coding-result actions; the Home instance the personal store's.
  actions: [...SHELF_RUNTIME_ACTIONS, ...SHELF_ACTIONS],
  artifacts: { produces: [], consumes: [{ artifact_type_id: "coding.report.v1", schema_version: 1 }] },
  // A Coding change set offered to Shelf is exchange data, not a 成果. What Shelf saves into a project is an imported document there.
  process_items: { produces: [], consumes: [{ artifact_type_id: "coding.changeset.v1", schema_version: 1 }] },
  ports: { inputs: [{ port: "coding-report", artifact_type_id: "coding.report.v1", schema_version: 1, optional: true, default_source: { plugin_id: "io.molis.work.coding", port: "report" } }, { port: "coding-changeset", artifact_type_id: "coding.changeset.v1", schema_version: 1, optional: true, default_source: { plugin_id: "io.molis.work.coding", port: "changeset" } }], outputs: [] },
  routes: [
    { route_id: "shelf.project-results", method: "GET", path: "/project-results" },
    { route_id: "shelf.project-result-preview", method: "GET", path: "/project-result" },
    { route_id: "shelf.project-result-receive", method: "POST", path: "/project-result" },
  ],
  ui: {
    contributions: [SHELF_UI_CONTRIBUTION_ID, SHELF_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      // The side panel's first tab (order 0, before 灵光's 10 and the panel's own tabs); it never opens in the work area.
      { view_id: "side", slot: "side", title: "Shelf", contribution_id: SHELF_UI_CONTRIBUTION_ID, icon: "library", order: 0 },
      { view_id: "settings", slot: "settings", title: "Shelf", contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID },
    ],
  },
};
