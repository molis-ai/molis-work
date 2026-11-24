import { PLUGIN_LOCAL_TOOLS_PERMISSION, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfPreferences, shelfSettings } from "./device-preferences.js";
import { SHELF_UI_CONTRIBUTION_ID } from "./ui.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { SHELF_RUNTIME_ACTIONS } from "./runtime-actions.js";
import { SHELF_ACTIONS, SHELF_PROJECT_ACTIONS } from "./actions.js";
import { SHELF_HOME_ROUTES } from "./routes.js";
import { SHELF_OWNER_FILES } from "./owner-files.js";
import { SHELF_LOCAL_TOOLS } from "./local-tools.js";
/** Shelf is a platform part the runtime hosts (44B, decision 66): its id is the platform's, which no package may install. */
export const SHELF_PLUGIN_ID = "system.shelf";
/** The key the workbench and the Host name the Shelf surface by. */
export const SHELF_PROJECT_PLUGIN_ID = "shelf";

/** One Home instance, every permission required: it is the Host's own build, never installed or switched off. */
export const shelfManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: SHELF_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Shelf",
  summary: "把文件放上来处理副本，原件不动。", summary_text: { key: "shelf.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-shelf-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机置物架文件与摘录", reason_text: { key: "shelf.permission.storage-private.reason" } },
    { permission: "artifact:read", required: true, reason: "读取明确选择接收的 Coding 成果", reason_text: { key: "shelf.permission.artifact-read.reason" } },
    { permission: "shelf:read", required: true, reason: "读取置物架的副本和处理状态", reason_text: { key: "shelf.permission.shelf-read.reason" } },
    { permission: "terminal:run", required: true, reason: "打开资料架对话终端", reason_text: { key: "shelf.permission.terminal-run.reason" } },
    { permission: "shelf:write", required: true, reason: "添加和整理置物架副本", reason_text: { key: "shelf.permission.shelf-write.reason" } },
    { permission: "materials:read", required: true, reason: "解析已选择的材料", reason_text: { key: "shelf.permission.materials-read.reason" } },
    { permission: "materials:fetch", required: true, reason: "获取已选择的网页内容", reason_text: { key: "shelf.permission.materials-fetch.reason" } },
    { permission: "materials:fetch_local", required: true, reason: "获取已选择的本机网页内容", reason_text: { key: "shelf.permission.materials-fetch-local.reason" } },
    { permission: "materials:original", required: true, reason: "处理前核对放进来的原文件有没有变", reason_text: { key: "shelf.permission.materials-original.reason" } },
    { permission: "model:invoke", required: true, reason: "按所选配方处理材料", reason_text: { key: "shelf.permission.model-invoke.reason" } },
    { permission: "artifacts:read", required: true, reason: "读取项目成果", reason_text: { key: "shelf.permission.artifacts-read.reason" } },
    { permission: "artifacts:write", required: true, reason: "将副本保存到项目成果", reason_text: { key: "shelf.permission.artifacts-write.reason" } },
    { permission: "projects:exist", required: true, reason: "副本来自的项目被删除后，在副本上标出「项目已删除」", reason_text: { key: "shelf.permission.projects-exist.reason" } },
    { permission: "actions:invoke", required: true, reason: "调用已授权的成果与资料能力", reason_text: { key: "shelf.permission.actions-invoke.reason" } },
    { permission: "model:read", required: true, reason: "读取当前可用模型", reason_text: { key: "shelf.permission.model-read.reason" } },
    { permission: PLUGIN_LOCAL_TOOLS_PERMISSION, required: true, reason: "查找这台电脑上已安装的外部 AI 工具", reason_text: { key: "shelf.permission.local-tools.reason" } },
  ],
  capabilities: { provides: [], consumes: [] },
  // One instance, in the Home: a project's Coding results are read for the project each call is for (`services.artifacts`).
  runtime: { scope: "home" },
  owner_files: SHELF_OWNER_FILES,
  // The platform's look for the terminal Agents on this machine (`services.localTools`).
  local_tools: SHELF_LOCAL_TOOLS,
  settings_entries: shelfSettings,
  actions: [shelfPreferences.read, shelfPreferences.write, ...SHELF_ACTIONS, ...SHELF_PROJECT_ACTIONS, ...SHELF_RUNTIME_ACTIONS],
  sync:{protocol_version:/* @version sync.protocol */ 1,collections:[{id:'copies',title:'材料、结果与终态任务',schema_version:/* @version sync.collection.shelf.copies */ 1,requires:[]}]},
  artifacts: { produces: [], consumes: [{ artifact_type_id: /* @version type.coding.report "coding.report.v{version}" */ "coding.report.v1", schema_version: /* @version type.coding.report */ 1 }] },
  // A Coding change set offered to Shelf is exchange data, not a 成果. What Shelf saves into a project is an imported document there.
  process_items: { produces: [], consumes: [{ artifact_type_id: /* @version type.coding.changeset "coding.changeset.v{version}" */ "coding.changeset.v1", schema_version: /* @version type.coding.changeset */ 1 }] },
  // The panel's routes, saving into a project and receiving a project's Coding results included (a project page's request carries its project).
  routes: [
    ...SHELF_HOME_ROUTES,
    { route_id: "shelf.project-results", method: "GET", path: "/project-results" },
    { route_id: "shelf.project-result-preview", method: "GET", path: "/project-result" },
    { route_id: "shelf.project-result-receive", method: "POST", path: "/project-result" },
  ],
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "shelf.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "shelf.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "shelf.help.example-1" }, { key: "shelf.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "shelf.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "shelf.help.advanced-summary" }, body: { key: "shelf.help.advanced" } },
        ],
      }],
    },
    contributions: [SHELF_UI_CONTRIBUTION_ID, SHELF_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      // The side panel's first tab (order 0, before 灵光's 10 and the panel's own tabs); it never opens in the work area.
      { view_id: "side", slot: "side", title: "Shelf", contribution_id: SHELF_UI_CONTRIBUTION_ID, icon: "library", hue: "slate", order: 0 },
      { view_id: "settings", slot: "settings", title: "Shelf", contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID, icon: "library", settings_data: { action: "shelf.snapshot" } },
    ],
  },
};
