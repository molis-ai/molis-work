import { inboxContentActions, inboxSearchEntriesAction, inboxSubjectAction } from "./content-actions.js";
import { inboxWorkEventsAction } from "./work-events.js";
import { inboxNextScene } from "./scenes.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { INBOX_UI_CONTRIBUTION_ID } from "./ui.js";
import { INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS, inboxActions } from "./actions.js";
import { INBOX_PROJECT_DATABASE } from "./database.js";

import { INBOX_PLUGIN_ID } from "./identity.js";
import { localizeManifestActions } from "./manifest-action-text.js";
import { inboxPresentation, inboxPresentationActions } from "./presentation.js";
export { INBOX_PLUGIN_ID } from "./identity.js";
/** What the project database stores for this Plugin. */
export const INBOX_PROJECT_PLUGIN_ID = "inbox";

/** What Inbox needs of the platform to run: its entries are Attention's, its scene and its judgments are its own, and Feed and Pages answer for their part. */
const PLATFORM_PERMISSIONS = [
  { permission: "attention:read", required: true, reason: "读取这个项目里的 Inbox 事项", reason_text: { key: "inbox.permission.attention-read.reason" } },
  { permission: "attention:write", required: true, reason: "更新这个项目里 Inbox 事项的处理状态", reason_text: { key: "inbox.permission.attention-write.reason" } },
  { permission: "scenes:use", required: true, reason: "绑定并运行 Inbox 的下一步判断", reason_text: { key: "inbox.permission.scenes-use.reason" } },
  { permission: "judgments:read", required: true, reason: "读取 Inbox 的下一步判断记录", reason_text: { key: "inbox.permission.judgments-read.reason" } },
  { permission: "judgments:write", required: true, reason: "保存 Inbox 的下一步判断结果", reason_text: { key: "inbox.permission.judgments-write.reason" } },
  { permission: "journal:project", required: true, reason: "把判断结果记进事项的处理历史", reason_text: { key: "inbox.permission.journal-project.reason" } },
  { permission: "actions:delegate", required: true, reason: "按你的权限读取 Feed 消息、请 Pages 生成文稿并读取已发布规则", reason_text: { key: "inbox.permission.actions-delegate.reason" } },
] as const;

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while the Plugin itself is started and isolated by Plugin
 * Runtime (`createInboxPlugin`, one instance per project).
 */
export const inboxManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: INBOX_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Inbox",
  summary: "只看需要你介入的事项。", summary_text: { key: "inbox.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-inbox-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [...[...new Set([...INBOX_ACTION_PERMISSIONS, ...Object.values(inboxContentActions).flatMap(d => d.action.permissions)])]
    .filter(permission => !PLATFORM_PERMISSIONS.some(platform => platform.permission === permission))
    .map(permission => ({ permission, required: false, reason: "使用 Inbox 里对应的阅读与处理功能", reason_text: { key: "inbox.permission.action.reason" } })),
    { permission: "goals:read", required: false, reason: "可选：显示来自目标的待决定事项标题", reason_text: { key: "inbox.permission.goals-read.reason" } },
    { permission: "storage:private", required: true, reason: "保存这个项目里 Inbox 的下一步规则绑定", reason_text: { key: "inbox.permission.storage-private.reason" } },
    ...PLATFORM_PERMISSIONS],
  presentation: inboxPresentation,
  actions: localizeManifestActions([...INBOX_ACTIONS, ...inboxPresentationActions, ...Object.values(inboxContentActions), inboxSubjectAction, inboxSearchEntriesAction, inboxWorkEventsAction]),
  action_scenes: [inboxNextScene],
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  read_groups: [{ group_id: "inbox", title: "来信", title_text: { key: "inbox.read-group.inbox.title" },
    description: "Inbox 里待处理的事项与它们的内容", description_text: { key: "inbox.read-group.inbox.description" },
    actions: ["inbox.list", "inbox.subject.read", "inbox.search.entries", "inbox.events", "inbox.content.list", "inbox.content.read"] }],
  // The page's requests: each adapts one HTTP call to one of the plugin's own actions (`createInboxRouteHandlers`), under /api/plugins/<plugin_id>/.
  routes: [
    { route_id: "inbox.list", method: "GET", path: "/entries", permission: "inbox:read" },
    { route_id: "inbox.entry.status", method: "POST", path: "/entries/:entry_id/status", permission: "inbox:write" },
    { route_id: "inbox.pages.results", method: "GET", path: "/pages", permission: "inbox:read" },
    { route_id: "inbox.pages.generate", method: "POST", path: "/pages", permission: "inbox:write" },
    { route_id: "inbox.judgment.read", method: "GET", path: "/judgment", permission: "inbox:read" },
    { route_id: "inbox.judgment.write", method: "POST", path: "/judgment", permission: "inbox:write" },
    { route_id: "inbox.judgment.evaluate", method: "POST", path: "/judgment/evaluate", permission: "inbox:read" },
  ],
  databases: { project: INBOX_PROJECT_DATABASE },
  capabilities: { provides: [], consumes: ["feed.briefs.read", "feed.items.content"] },
  artifacts: { produces: [], consumes: [] },
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "inbox.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "inbox.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "inbox.help.example-1" }, { key: "inbox.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "inbox.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "inbox.help.advanced-summary" }, body: { key: "inbox.help.advanced" } },
        ],
      }],
    },
    contributions: [INBOX_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Inbox", contribution_id: INBOX_UI_CONTRIBUTION_ID, icon: "inbox", hue: "mint", order: 30, rail: "core", pinned_default: true, accepts_objects: true,
        stage_data: { action: inboxActions.stage.capability_id } },
    ],
  },
};
