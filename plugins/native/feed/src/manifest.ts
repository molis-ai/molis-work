import { feedCaptureScene } from "./scenes.js";
import { feedContentActions, feedSubjectAction, feedSourceSubjectAction } from "./content-actions.js";
import { feedHomeEventsAction } from "./home-events.js";
import { feedRuleActions } from "./rule-actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FEED_UI_CONTRIBUTION_ID } from "./ui.js";

import { FEED_PLUGIN_ID } from "./identity.js";
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
  permissions: [...new Set([...Object.values(feedContentActions), ...Object.values(feedRuleActions), feedHomeEventsAction].flatMap(d => d.action.permissions))].map(permission => ({ permission, required: false, reason: "读写 Feed 内容、捕捉规则与首页事项" })),
  capabilities: { provides: [], consumes: [] },
  actions: [...Object.values(feedContentActions), ...Object.values(feedRuleActions), feedSubjectAction, feedSourceSubjectAction, feedHomeEventsAction],
  artifacts: { produces: [], consumes: [] },
  requires: [],
  action_scenes: [feedCaptureScene],
  behaviors: [
    { behavior_id: "open", title: "打开", effect: "read", subject_kinds: ["feed_item"] },
    { behavior_id: "reauth", title: "重新授权", effect: "write", subject_kinds: ["source"] },
    { behavior_id: "save", title: "保存为资料", effect: "write", subject_kinds: ["feed_item"] },
    { behavior_id: "promote", title: "升格为 Goal", effect: "write", subject_kinds: ["feed_item"] },
    { behavior_id: "archive", title: "忽略", effect: "write", subject_kinds: ["feed_item"] },
  ],
  judgment_subjects: [
    { subject_kind: "feed_item", title: "Feed 消息" },
    { subject_kind: "source", title: "来源" },
  ],
  ui: {
    contributions: [FEED_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Feed", contribution_id: FEED_UI_CONTRIBUTION_ID, icon: "rss", order: 40 },
    ],
  },
};
