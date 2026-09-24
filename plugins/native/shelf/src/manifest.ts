import { SHELF_TEXT_MATERIAL_TYPE } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_UI_CONTRIBUTION_ID } from "./ui.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";

export const SHELF_PLUGIN_ID = "io.molis.work.shelf";
/** What the project database stores for this Plugin. */
export const SHELF_PROJECT_PLUGIN_ID = "shelf";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * moving all personal copy operations into Plugin Runtime. Project material
 * outputs do activate through Runtime grants and its durable input graph.
 */
export const shelfManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: SHELF_PLUGIN_ID,
  version: "1.4.0",
  name: "Shelf",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-shelf-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机置物架文件与摘录" },
    { permission: "artifact:read", required: true, reason: "读取本项目固定材料和明确选择接收的 Coding 成果" },
    { permission: "artifact:write", required: true, reason: "将明确选择的 Shelf 固定版本设为材料输出" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [{ artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1 }], consumes: [{ artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1 }, { artifact_type_id: "coding.report.v1", schema_version: 1 }, { artifact_type_id: "coding.changeset.v1", schema_version: 1 }] },
  ports: { inputs: [{ port: "coding-report", artifact_type_id: "coding.report.v1", schema_version: 1, optional: true }, { port: "coding-changeset", artifact_type_id: "coding.changeset.v1", schema_version: 1, optional: true }], outputs: [{ port: "material", artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1 }] },
  routes: [
    { route_id: "shelf.project-results", method: "GET", path: "/project-results" },
    { route_id: "shelf.project-result-preview", method: "GET", path: "/project-result" },
    { route_id: "shelf.project-result-receive", method: "POST", path: "/project-result" },
    { route_id: "shelf.material-output", method: "GET", path: "/material-output" },
    { route_id: "shelf.select-material-output", method: "POST", path: "/material-output" },
  ],
  ui: {
    contributions: [SHELF_UI_CONTRIBUTION_ID, SHELF_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Shelf", contribution_id: SHELF_UI_CONTRIBUTION_ID, icon: "library", order: 50 },
      { view_id: "settings", slot: "settings", title: "Shelf", contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID },
    ],
  },
};
