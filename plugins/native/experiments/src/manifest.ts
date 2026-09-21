import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
export const EXPERIMENTS_PLUGIN_ID = "io.molis.work.experiments";
export const EXPERIMENTS_UI_CONTRIBUTION_ID = "io.molis.work.native.experiments.ui.v1";
export const experimentsManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: EXPERIMENTS_PLUGIN_ID, version: "1.0.0", name: "实验", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-experiments-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [{ permission: "storage:private", required: true, reason: "保存个人实验快照、模型配置和复核记录" }],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ui: { contributions: [EXPERIMENTS_UI_CONTRIBUTION_ID], views: [
    { view_id: "directory", slot: "navigator", title: "实验", contribution_id: EXPERIMENTS_UI_CONTRIBUTION_ID, icon: "sparkles", order: 56 },
  ] },
};
