import { PLUGIN_LOCAL_TOOLS_PERMISSION, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_UI_CONTRIBUTION_ID } from "./ui.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { SHELF_RUNTIME_ACTIONS, shelfReceiveCopy } from "./runtime-actions.js";
import { SHELF_ACTIONS, SHELF_PROJECT_ACTIONS } from "./actions.js";
import { SHELF_HOME_ROUTES } from "./routes.js";
import { SHELF_OWNER_FILES } from "./owner-files.js";
import { SHELF_LOCAL_TOOLS } from "./local-tools.js";
import { CODING_RESULT_DOCUMENT_ID } from "./coding-result.js";
import { SHELF_MESSAGES } from "./messages.js";
import { SHELF_EN } from "./en.js";
export const SHELF_PLUGIN_ID = "io.molis.work.shelf";
/** What the project database stores for this Plugin. */
export const SHELF_PROJECT_PLUGIN_ID = "shelf";

/**
 * The personal Home instance and each project's result instance share this declaration (a dual-instance plugin): every
 * permission is required, as a dual-instance Manifest's must be.
 */
export const shelfManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: SHELF_PLUGIN_ID,
  version: "0.3.0",
  name: "Shelf",
  summary: "把文件放上来处理副本，原件不动。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-shelf-binding" },
  // 常开插件 (specs/side-shelf §3.2): on in every project, never in the plugin list, the market, the Dock or a project's
  // plugin settings, so it cannot be removed.
  always_on: true,
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机置物架文件与摘录" },
    { permission: "artifact:read", required: true, reason: "读取明确选择接收的 Coding 成果" },
    { permission: "shelf:read", required: true, reason: "读取置物架的副本和处理状态" },
    { permission: "terminal:run", required: true, reason: "打开资料架对话终端" },
    { permission: "shelf:write", required: true, reason: "添加和整理置物架副本" },
    { permission: "materials:read", required: true, reason: "解析已选择的材料" },
    { permission: "materials:fetch", required: true, reason: "获取已选择的网页内容" },
    { permission: "materials:fetch_local", required: true, reason: "获取已选择的本机网页内容" },
    { permission: "materials:original", required: true, reason: "处理前核对放进来的原文件有没有变" },
    { permission: "model:invoke", required: true, reason: "按所选配方处理材料" },
    { permission: "artifacts:read", required: true, reason: "读取项目成果" },
    { permission: "artifacts:write", required: true, reason: "将副本保存到项目成果" },
    { permission: "projects:exist", required: true, reason: "副本来自的项目被删除后，在副本上标出「项目已删除」" },
    { permission: "actions:invoke", required: true, reason: "调用已授权的成果与资料能力" },
    { permission: "model:read", required: true, reason: "读取当前可用模型" },
    { permission: PLUGIN_LOCAL_TOOLS_PERMISSION, required: true, reason: "查找这台电脑上装了哪些终端 Agent" },
  ],
  // The text of a Coding result comes from Coding itself (the plugin audience only); Shelf adds its own heading and source.
  capabilities: { provides: [], consumes: [CODING_RESULT_DOCUMENT_ID] },
  // Runs in the Home, and also as each project's instance (the registration says so): one plugin, two halves of this one Manifest.
  runtime: { scope: "home" },
  // The Home half is given these files (`services.ownerFiles`); a project's half, which shares this Manifest, is not.
  owner_files: SHELF_OWNER_FILES,
  // The Home half is also given the platform's look for the terminal Agents on this machine (`services.localTools`); the project half is not.
  local_tools: SHELF_LOCAL_TOOLS,
  // Each Runtime instance redeems only the actions it owns.
  actions: [...SHELF_ACTIONS, ...SHELF_PROJECT_ACTIONS, shelfReceiveCopy, ...SHELF_RUNTIME_ACTIONS],
  artifacts: { produces: [], consumes: [{ artifact_type_id: "coding.report.v1", schema_version: 1 }] },
  // A Coding change set offered to Shelf is exchange data, not a 成果. What Shelf saves into a project is an imported document there.
  process_items: { produces: [], consumes: [{ artifact_type_id: "coding.changeset.v1", schema_version: 1 }] },
  ports: { inputs: [{ port: "coding-report", artifact_type_id: "coding.report.v1", schema_version: 1, optional: true, default_source: { plugin_id: "io.molis.work.coding", port: "report" } }, { port: "coding-changeset", artifact_type_id: "coding.changeset.v1", schema_version: 1, optional: true, default_source: { plugin_id: "io.molis.work.coding", port: "changeset" } }], outputs: [] },
  // The project instance answers the Coding-result routes; the Home instance the panel's own, saving into a project included.
  routes: [
    ...SHELF_HOME_ROUTES,
    { route_id: "shelf.project-results", method: "GET", path: "/project-results" },
    { route_id: "shelf.project-result-preview", method: "GET", path: "/project-result" },
    { route_id: "shelf.project-result-receive", method: "POST", path: "/project-result" },
  ],
  ui: {
    messages: SHELF_MESSAGES,
    translations: SHELF_EN,
    contributions: [SHELF_UI_CONTRIBUTION_ID, SHELF_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      // The side panel's first tab (order 0, before 灵光's 10 and the panel's own tabs); it never opens in the work area.
      { view_id: "side", slot: "side", title: "Shelf", contribution_id: SHELF_UI_CONTRIBUTION_ID, icon: "library", hue: "slate", order: 0 },
      { view_id: "settings", slot: "settings", title: "Shelf", contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID, icon: "library", settings_data: { action: "shelf.snapshot" } },
    ],
  },
};
