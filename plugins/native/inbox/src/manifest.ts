import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { INBOX_UI_CONTRIBUTION_ID } from "./ui.js";

export const INBOX_PLUGIN_ID = "io.molis.work.inbox";
/** What the project database stores for this Plugin. */
export const INBOX_PROJECT_PLUGIN_ID = "inbox";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const inboxManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: INBOX_PLUGIN_ID,
  version: "1.0.0",
  name: "Inbox",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-inbox-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [INBOX_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Inbox", contribution_id: INBOX_UI_CONTRIBUTION_ID, icon: "inbox", order: 30 },
    ],
  },
};
