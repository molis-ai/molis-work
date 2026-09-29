import { inboxContentActions, inboxSearchEntriesAction, inboxSubjectAction } from "./content-actions.js";
import { inboxHomeEventsAction } from "./home-events.js";
import { inboxNextScene } from "./scenes.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { INBOX_UI_CONTRIBUTION_ID } from "./ui.js";
import { INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS } from "./actions.js";

import { INBOX_PLUGIN_ID } from "./identity.js";
export { INBOX_PLUGIN_ID } from "./identity.js";
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
  permissions: [...new Set([...INBOX_ACTION_PERMISSIONS, ...Object.values(inboxContentActions).flatMap(d => d.action.permissions)])].map(permission => ({ permission, required: false, reason: "使用对应的 Inbox 能力" })),
  actions: [...INBOX_ACTIONS, ...Object.values(inboxContentActions), inboxSubjectAction, inboxSearchEntriesAction, inboxHomeEventsAction],
  action_scenes: [inboxNextScene],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
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
