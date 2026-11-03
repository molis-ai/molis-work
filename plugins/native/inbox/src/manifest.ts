import { inboxContentActions, inboxSearchEntriesAction, inboxSubjectAction } from "./content-actions.js";
import { inboxHomeEventsAction } from "./home-events.js";
import { inboxNextScene } from "./scenes.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { INBOX_UI_CONTRIBUTION_ID } from "./ui.js";
import { INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS, INBOX_STAGE_GOAL_READ, inboxActions } from "./actions.js";
import { INBOX_PROJECT_DATABASE } from "./database.js";

import { INBOX_PLUGIN_ID } from "./identity.js";
export { INBOX_PLUGIN_ID } from "./identity.js";
/** What the project database stores for this Plugin. */
export const INBOX_PROJECT_PLUGIN_ID = "inbox";

/** What Inbox needs of the platform to run: its entries are Attention's, its scene and its judgments are its own, and Feed and Pages answer for their part. */
const PLATFORM_PERMISSIONS = [
  { permission: "attention:read", required: true, reason: "读取这个项目的 Inbox 事项" },
  { permission: "attention:write", required: true, reason: "更改 Inbox 事项的状态" },
  { permission: "scenes:use", required: true, reason: "绑定并运行 Inbox 下一步的判断场景" },
  { permission: "judgments:read", required: true, reason: "读取 Inbox 下一步的判断记录" },
  { permission: "judgments:write", required: true, reason: "记录 Inbox 下一步的判断结果" },
  { permission: "journal:project", required: true, reason: "把判断结果记进事项的历史" },
  { permission: "actions:delegate", required: true, reason: "替当前这个调用者读取 Feed 的消息、调用 Pages 生成文稿和已发布的判断规则" },
] as const;

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while the Plugin itself is started and isolated by Plugin
 * Runtime (`createInboxPlugin`, one instance per project).
 */
export const inboxManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: INBOX_PLUGIN_ID,
  version: "0.3.0",
  name: "Inbox",
  summary: "只看需要你介入的事项。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-inbox-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [...[...new Set([...INBOX_ACTION_PERMISSIONS, ...Object.values(inboxContentActions).flatMap(d => d.action.permissions)])]
    .filter(permission => !PLATFORM_PERMISSIONS.some(platform => platform.permission === permission)).map(permission => ({ permission, required: false, reason: "使用对应的 Inbox 能力" })),
    { permission: "storage:private", required: true, reason: "项目里 Inbox 下一步的绑定" },
    ...PLATFORM_PERMISSIONS],
  actions: [...INBOX_ACTIONS, ...Object.values(inboxContentActions), inboxSubjectAction, inboxSearchEntriesAction, inboxHomeEventsAction],
  action_scenes: [inboxNextScene],
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
  capabilities: { provides: [], consumes: ["feed.briefs.read", "feed.items.content", INBOX_STAGE_GOAL_READ.capability_id] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [INBOX_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Inbox", contribution_id: INBOX_UI_CONTRIBUTION_ID, icon: "inbox", hue: "mint", order: 30, rail: "core", pinned_default: true, accepts_objects: true,
        stage_data: { action: inboxActions.stage.capability_id } },
    ],
  },
};
