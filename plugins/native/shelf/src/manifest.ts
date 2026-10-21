import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_UI_CONTRIBUTION_ID } from "./ui.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { SHELF_RUNTIME_ACTIONS } from "./runtime-actions.js";
import { codingResultDocument } from "@molis-ai/molis-work-contracts/modules/coding";

export const SHELF_PLUGIN_ID = "io.molis.work.shelf";
/** What the project database stores for this Plugin. */
export const SHELF_PROJECT_PLUGIN_ID = "shelf";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * moving all personal copy operations into Plugin Runtime. Coding results
 * offered to Shelf do arrive through Runtime grants and its durable input graph.
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
  ],
  // The text of a Coding result comes from Coding itself (the plugin audience only); Shelf adds its own heading and source.
  capabilities: { provides: [], consumes: [codingResultDocument.capability_id] },
  // Redeemed by this project's Runtime instance. The personal store's actions are Home-level; the Host registers them from `SHELF_ACTIONS`.
  actions: SHELF_RUNTIME_ACTIONS,
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
