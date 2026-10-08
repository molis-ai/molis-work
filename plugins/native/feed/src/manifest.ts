import { feedQueryActions } from "./query-actions.js";
import { feedCaptureScene } from "./scenes.js";
import { feedContentActions, feedSearchEntriesAction, feedSubjectAction, feedSourceSubjectAction } from "./content-actions.js";
import { feedHomeEventsAction } from "./home-events.js";
import { feedRuleActions } from "./rule-actions.js";
import { feedItemActions } from "./item-actions.js";
import { feedSourceActions } from "./source-actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FEED_UI_CONTRIBUTION_ID } from "./ui.js";

import { FEED_PLUGIN_ID, FEED_CAPTURE_ARTIFACT_TYPE_ID, FEED_CAPTURE_SCHEMA_VERSION } from "./identity.js";
import { feedArtifactPreview } from "./artifact-preview.js";
export { FEED_PLUGIN_ID } from "./identity.js";
/** What the project database stores for this Plugin. */
export const FEED_PROJECT_PLUGIN_ID = "feed";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const feedManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FEED_PLUGIN_ID,
  version: "1.0.0",
  name: "Feed",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-feed-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [...new Set([...Object.values(feedContentActions), ...Object.values(feedQueryActions), ...Object.values(feedRuleActions), ...Object.values(feedItemActions), ...Object.values(feedSourceActions), feedHomeEventsAction].flatMap(d => d.action.permissions))].map(permission => ({ permission, required: false, reason: "读写 Feed 内容、捕捉规则与首页事项，处理消息去向与管理来源" })),
  capabilities: { provides: [], consumes: [] },
  actions: [feedArtifactPreview, ...Object.values(feedContentActions), ...Object.values(feedQueryActions), ...Object.values(feedRuleActions), ...Object.values(feedItemActions), ...Object.values(feedSourceActions), feedSubjectAction, feedSourceSubjectAction, feedSearchEntriesAction, feedHomeEventsAction],
  artifacts: { produces: [{ artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID, schema_version: FEED_CAPTURE_SCHEMA_VERSION, title: "捕获的消息",
    preview: { capability_id: "feed.artifacts.preview", version: 1 } }], consumes: [] },
  requires: [],
  action_scenes: [feedCaptureScene],
  ui: {
    contributions: [FEED_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Feed", contribution_id: FEED_UI_CONTRIBUTION_ID, icon: "rss", order: 40 },
    ],
  },
};
