import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_CONNECTION_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { FEED_PLUGIN_ID, FEED_CAPTURE_ARTIFACT_TYPE_ID, FEED_CAPTURE_SCHEMA_VERSION } from "./identity.js";
import { FEED_HOME_DATABASE } from "./content-ledger.js";
import { FEED_PROJECT_DATABASE } from "./database.js";
import { FEED_EN } from "./en.js";
import { feedReconcileJob } from "./runtime-reconcile.js";
import { feedWakeJob } from "./runtime-wake.js";
import { FEED_PERMISSIONS } from "./permissions.js";
import { FEED_ACTIONS, GOAL_CONTRACT, WAKE } from "./runtime-actions.js";
import { feedRuntimeCaptureScene } from "./scenes.js";
import { FEED_UI_CONTRIBUTION_ID } from "./ui.js";
export { FEED_PLUGIN_ID } from "./identity.js";
/** What the project database stores for this Plugin. */
export const FEED_PROJECT_PLUGIN_ID = "feed";

/**
 * Feed's declaration, written out as one literal because it is a dual-instance plugin's (the gate `scripts/gates/dual-instance.mjs` reads it as
 * syntax): each project runs Feed, and the Home runs its half, which keeps the reference ledger of the evidence bodies the projects hold
 * (`databases.home`). The two halves share this Manifest and each answers only its own actions; every permission is required.
 */
export const feedManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FEED_PLUGIN_ID,
  version: "0.4.0",
  name: "Feed",
  summary: "订阅来源，读消息，留下值得留的。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-feed-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: FEED_PERMISSIONS,
  // A Goal's material is read after the Goal itself has been read, as the caller (`feed.goals.context`).
  capabilities: { provides: [], consumes: [GOAL_CONTRACT.capability_id] },
  actions: FEED_ACTIONS,
  artifacts: { produces: [{ artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID, schema_version: FEED_CAPTURE_SCHEMA_VERSION, title: "捕获的消息",
    preview: { capability_id: "feed.artifacts.preview", version: 1 } }], consumes: [] },
  requires: [],
  runtime: { scope: "home" },
  databases: { project: FEED_PROJECT_DATABASE, home: FEED_HOME_DATABASE },
  // The kinds of Inbox entry Feed adds and removes: an item's, and a source's fault.
  attention: { subjects: ["feed_item", "source_fault"] },
  // The person binds an account to each account source: one slot per service the platform can pull for (its own list is the only one), the record being the source.
  connections: { slots: Object.keys(CONNECTOR_REQUEST_SERVICES).map(service => ({ slot_id: service, service_id: service, reason: "读取你为这个来源选好的账号", binding: "per_record" as const })) },
  notifications: { receive: { capability_id: "feed.notifications.receive", version: 1 } },
  action_scenes: [feedRuntimeCaptureScene],
  // The Home says when a connection changed (never which account); the kept job then looks at each account source again.
  events: { publishes: [], subscribes: [{ event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1 }] },
  background: { jobs: [feedWakeJob, feedReconcileJob], wakeups: [{ action: { capability_id: WAKE.capability_id, version: WAKE.version }, reason: WAKE.action.title }] },
  ui: {
    translations: FEED_EN,
    contributions: [FEED_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Feed", contribution_id: FEED_UI_CONTRIBUTION_ID, icon: "rss", hue: "brown", order: 40, rail: "core", pinned_default: true, accepts_objects: true },
    ],
  },
};
