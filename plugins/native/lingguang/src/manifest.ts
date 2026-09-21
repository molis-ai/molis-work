import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LINGGUANG_PLUGIN_ID, LINGGUANG_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/lingguang";
import { LINGGUANG_UI_CONTRIBUTION_ID } from "./ui.js";

export { LINGGUANG_PLUGIN_ID, LINGGUANG_PROJECT_PLUGIN_ID };

export const lingguangManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: LINGGUANG_PLUGIN_ID,
  version: "1.0.0",
  name: "灵光",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-lingguang-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机灵光库" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [LINGGUANG_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "island", slot: "island", title: "灵光", contribution_id: LINGGUANG_UI_CONTRIBUTION_ID, icon: "idea", order: 10 },
    ],
  },
};
