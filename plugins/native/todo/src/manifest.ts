import { todoSync } from "./replication.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID } from "./contract.js";
import { TODO_ACTIONS, TODO_ACTION_PERMISSIONS } from "./actions.js";
import { localizeManifestActions } from "./manifest-action-text.js";
import { TODO_UI_CONTRIBUTION_ID } from "./ui.js";
import { todoAgentManifest, todoSkills } from "./roles.js";
import { TODO_DATABASE } from "./database.js";

export { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID };

/** The most one request may carry, as on the Host's native path before W5-01. */
const TODO_BODY_BYTES = 1_000_000;

export const todoManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: TODO_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "待办",
  name_text: { key: "todo.directory.name" },
  summary: "记下要做的事，分清今天、在等谁。", summary_text: { key: "todo.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-todo-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "在本机保存待办事项和修改记录", reason_text: { key: "todo.permission.storage-private.reason" } },
    ...TODO_ACTION_PERMISSIONS.map(permission => ({ permission, required: permission === "todo:read", reason: "按你的权限读取、新建或整理待办", reason_text: { key: "todo.permission.action.reason" } })),
  ],
  capabilities: { provides: [], consumes: ["assistant.works.related"] },
  artifacts: { produces: [], consumes: [] },
  actions: localizeManifestActions([...TODO_ACTIONS]), sync:todoSync,
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  read_groups: [{ group_id: "todo", title: "待办", title_text: { key: "todo.read-group.todo.title" },
    description: "待办事项、它们的日期与到期提醒", description_text: { key: "todo.read-group.todo.description" },
    actions: ["todo.items.list", "todo.items.get", "todo.item.subject.read", "todo.search.entries", "todo.reminders.due", "todo.events"] }],
  // Each partition's own library (specs/unified-partition-plugins §4.2); its open todos are the overview's tasks, their reminders ring from there.
  databases: { partition: TODO_DATABASE },
  overview_projection: { kinds: ["task"] },
  // Fixed paths before `/items/:id`, and each mapped to the action of the same name in ./plugin.ts.
  routes: [
    { route_id: "todo.list", method: "GET", path: "/items" },
    { route_id: "todo.create", method: "POST", path: "/items", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.batch", method: "POST", path: "/batch", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.revert", method: "POST", path: "/revert", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.reminders", method: "GET", path: "/reminders" },
    { route_id: "todo.organize.list", method: "GET", path: "/organize" },
    { route_id: "todo.organize.get", method: "GET", path: "/organize/:id" },
    { route_id: "todo.organize.apply", method: "POST", path: "/organize/:id/apply", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.organize.close", method: "POST", path: "/organize/:id/close", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.get", method: "GET", path: "/items/:id" },
    { route_id: "todo.update", method: "POST", path: "/items/:id", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.status", method: "POST", path: "/items/:id/status", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.archive", method: "POST", path: "/items/:id/archive", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.delete", method: "POST", path: "/items/:id/delete", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.link", method: "POST", path: "/items/:id/link", max_body_bytes: TODO_BODY_BYTES },
    { route_id: "todo.acknowledge", method: "POST", path: "/items/:id/acknowledge", max_body_bytes: TODO_BODY_BYTES },
  ],
  agent: todoAgentManifest,
  // Offered to other Agents for business work; bodies in ./roles.ts.
  methods: todoSkills.map(({ body: _body, body_by_locale: _localized, ...declared }) => ({ ...declared, tools: [...declared.tools] })),
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "todo.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "todo.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "todo.help.example-1" }, { key: "todo.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "todo.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "todo.help.advanced-summary" }, body: { key: "todo.help.advanced" } },
        ],
      }],
    },
    contributions: [TODO_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "todo", slot: "navigator", title: "待办", title_text: { key: "todo.directory.view-todo" }, contribution_id: TODO_UI_CONTRIBUTION_ID, icon: "list", hue: "green", order: 25, group: "personal" },
    ],
  },
};
