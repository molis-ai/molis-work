import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FEED_UI_CONTRIBUTION_ID } from "./ui.js";

export const FEED_PLUGIN_ID = "io.molis.work.feed";
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
  permissions: [],
  capabilities: { provides: [], consumes: ["functions.evaluate"] },
  artifacts: { produces: [], consumes: [] },
  requires: [{
    capability_id: "functions.evaluate",
    version: 1,
    optional: true,
    reason: "捕捉规则可绑一个判断函数，命中后先落判断再决定是否显示建议",
  }],
  behaviors: [
    { behavior_id: "open", title: "打开", effect: "read", subject_kinds: ["feed_item"] },
    { behavior_id: "reauth", title: "重新授权", effect: "write", subject_kinds: ["source"] },
    { behavior_id: "save", title: "保存为资料", effect: "write", subject_kinds: ["feed_item"] },
    { behavior_id: "promote", title: "升格为 Goal", effect: "write", subject_kinds: ["feed_item"] },
    { behavior_id: "archive", title: "忽略", effect: "write", subject_kinds: ["feed_item"] },
  ],
  function_scenes: [
    { scene_id: "feed.capture", title: "捕捉规则", subject_kinds: ["feed_item"] },
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
