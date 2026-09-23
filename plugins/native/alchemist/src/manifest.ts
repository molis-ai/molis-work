import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ALCHEMIST_PLUGIN_ID, ALCHEMIST_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/alchemist";
import { ALCHEMIST_UI_CONTRIBUTION_ID } from "./ui.js";

export { ALCHEMIST_PLUGIN_ID, ALCHEMIST_PROJECT_PLUGIN_ID };

export const alchemistManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: ALCHEMIST_PLUGIN_ID,
  version: "1.1.0",
  name: "炼金术士",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-alchemist-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "按项目保存方向、Idea、研究证据、决策和个人 Memory" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [ALCHEMIST_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "炼金术士", contribution_id: ALCHEMIST_UI_CONTRIBUTION_ID, icon: "zap", order: 60 },
    ],
  },
};
