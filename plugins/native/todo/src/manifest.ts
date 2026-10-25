import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/todo";
import { TODO_ACTIONS, TODO_ACTION_PERMISSIONS } from "./actions.js";
import { TODO_UI_CONTRIBUTION_ID } from "./ui.js";
import { todoAgentManifest, todoMethods } from "./roles.js";
import { TODO_DATABASE } from "./database.js";

export { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID };

/** The most one request may carry, as on the Host's native path before W5-01. */
const TODO_BODY_BYTES = 1_000_000;

export const todoManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: TODO_PLUGIN_ID,
  version: "0.3.0",
  name: "待办",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-todo-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机待办库与修改记录" },
    ...TODO_ACTION_PERMISSIONS.map(permission => ({ permission, required: permission === "todo:read", reason: "按每项能力的授权读取或修改待办" })),
    { permission: "projects:reach", required: false, reason: "在你自己的待办页里看到并整理你各个项目里的待办；不给时只处理当前项目里的待办" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  actions: [...TODO_ACTIONS],
  // Fixed paths before `/items/:id`, and each mapped to the action of the same name in ./plugin.ts.
  databases: { home: TODO_DATABASE },
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
  methods: todoMethods.map(({ body: _body, ...declared }) => ({ ...declared, tools: [...declared.tools] })),
  ui: {
    contributions: [TODO_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "todo", slot: "navigator", title: "待办", contribution_id: TODO_UI_CONTRIBUTION_ID, icon: "list", order: 25, group: "personal" },
    ],
  },
};
