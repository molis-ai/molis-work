import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { WORK_UI_CONTRIBUTION_ID } from "./ui/contribution.js";

export const WORK_PLUGIN_ID = "io.molis.work.sessions";
/** What the project database stores for this Plugin. */
export const WORK_PROJECT_PLUGIN_ID = "sessions";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const workManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: WORK_PLUGIN_ID,
  version: "1.0.0",
  name: "Sessions",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-sessions-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [WORK_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Sessions", contribution_id: WORK_UI_CONTRIBUTION_ID, icon: "terminal", order: 20 },
    ],
  },
};
