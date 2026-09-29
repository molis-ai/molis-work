import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/todo";
import { TODO_ACTIONS, TODO_ACTION_PERMISSIONS } from "./actions.js";
import { TODO_UI_CONTRIBUTION_ID } from "./ui.js";
import { todoAgentManifest } from "./roles.js";

export { TODO_PLUGIN_ID, TODO_PROJECT_PLUGIN_ID };

export const todoManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: TODO_PLUGIN_ID,
  version: "1.0.0",
  name: "待办",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-todo-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机待办库与修改记录" },
    ...TODO_ACTION_PERMISSIONS.map(permission => ({ permission, required: permission === "todo:read", reason: "按每项能力的授权读取或修改待办" })),
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  actions: [...TODO_ACTIONS],
  agent: todoAgentManifest,
  ui: {
    contributions: [TODO_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "todo", slot: "navigator", title: "待办", contribution_id: TODO_UI_CONTRIBUTION_ID, icon: "list", order: 25 },
    ],
  },
};
