import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import { TEXT_STATS_UI_CONTRIBUTION_ID } from "./ui.js";

export const TEXT_STATS_PLUGIN_ID = "io.molis.work.text-stats";
/** What the project database stores for this Plugin. */
export const TEXT_STATS_PROJECT_PLUGIN_ID = "text-stats";
export const TEXT_STATS_INPUT_PORT = "text";

/**
 * The smallest complete Plugin in the system.
 *
 * No Capabilities, no output ports, no events, no storage, one required input.
 * It exists as much to keep the platform honest as to count characters: if
 * consuming a bound Artifact needs more than this, the platform is asking too
 * much of whoever writes the next Plugin.
 */
export const textStatsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: TEXT_STATS_PLUGIN_ID,
  version: "1.1.0",
  name: "Text stats",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-text-stats-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取绑定的文本快照" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [],
    consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }],
  },
  ports: {
    inputs: [
      {
        port: TEXT_STATS_INPUT_PORT,
        artifact_type_id: FILE_SNAPSHOT_TYPE,
        schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
      },
    ],
    outputs: [],
  },
  routes: [{ route_id: "text-stats.state", method: "GET", path: "/state" }],
  ui: {
    contributions: [TEXT_STATS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "browse", slot: "navigator", title: "Text Stats", contribution_id: TEXT_STATS_UI_CONTRIBUTION_ID, icon: "hash", order: 66 },
      {
        view_id: "stats",
        slot: "stage",
        title: "Text stats",
        contribution_id: TEXT_STATS_UI_CONTRIBUTION_ID,
        icon: "hash",
        order: 60,
      },
    ],
  },
};
