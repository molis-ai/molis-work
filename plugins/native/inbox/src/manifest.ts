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
  capabilities: { provides: [], consumes: ["functions.evaluate"] },
  artifacts: { produces: [], consumes: [] },
  requires: [{
    capability_id: "functions.evaluate",
    version: 1,
    optional: true,
    reason: "Inbox 下一步可绑一个判断函数，落地时给出建议",
  }],
  behaviors: [
    { behavior_id: "done", title: "做完了", effect: "write", subject_kinds: ["inbox_entry"] },
    { behavior_id: "dismiss", title: "忽略", effect: "write", subject_kinds: ["inbox_entry"] },
  ],
  function_scenes: [
    { scene_id: "inbox.next", title: "下一步", subject_kinds: ["inbox_entry"] },
  ],
  judgment_subjects: [
    { subject_kind: "inbox_entry", title: "Inbox 条目" },
  ],
  ui: {
    contributions: [INBOX_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Inbox", contribution_id: INBOX_UI_CONTRIBUTION_ID, icon: "inbox", order: 30 },
    ],
  },
};
