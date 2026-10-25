import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { WORKFLOWS_PLUGIN_ID } from "./model.js";
import { WORKFLOWS_UI_CONTRIBUTION_ID } from "./ui.js";
import { WORKFLOWS_ACTIONS } from "./actions.js";
import { WORKFLOWS_DATABASE } from "./database.js";

/** The largest body any Workflows route reads: the same 400 000 bytes the Host's own route gave them. */
const WORKFLOWS_BODY_BYTES = 400_000;

export const workflowsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: WORKFLOWS_PLUGIN_ID,
  version: "0.3.0",
  name: "工作流程",
  summary: "把插件串成流程，一步步做完。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-workflows-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机保存流程和每一次的进度" },
    { permission: "workflows:read", required: true, reason: "读取流程与每一次的进度" },
    { permission: "workflows:write", required: true, reason: "编辑流程、开始运行和交接到下一站" },
    { permission: "actions:delegate", required: true, reason: "替当前这个调用者调用每一站的内容动作、动作步骤和判断规则" },
    { permission: "model:invoke", required: false, reason: "AI 整理这一段交接的内容" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: WORKFLOWS_ACTIONS,
  databases: { home: WORKFLOWS_DATABASE },
  routes: [
    { route_id: "workflows.list", method: "GET", path: "/workflows" },
    { route_id: "workflows.create", method: "POST", path: "/workflows", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.judgments", method: "GET", path: "/workflows/judgments" },
    { route_id: "workflows.step_actions", method: "GET", path: "/workflows/steps/actions" },
    { route_id: "workflows.station_items", method: "GET", path: "/workflows/stations/:plugin/items" },
    { route_id: "workflows.instance_get", method: "GET", path: "/workflows/instances/:id" },
    { route_id: "workflows.instance_preview", method: "POST", path: "/workflows/instances/:id/preview", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.instance_continue", method: "POST", path: "/workflows/instances/:id/continue", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.instance_stop", method: "POST", path: "/workflows/instances/:id/stop", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.get", method: "GET", path: "/workflows/:id" },
    { route_id: "workflows.update", method: "POST", path: "/workflows/:id", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.delete", method: "POST", path: "/workflows/:id/delete", max_body_bytes: WORKFLOWS_BODY_BYTES },
    { route_id: "workflows.instance_start", method: "POST", path: "/workflows/:id/instances", max_body_bytes: WORKFLOWS_BODY_BYTES },
  ],
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [WORKFLOWS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "工作流程", contribution_id: WORKFLOWS_UI_CONTRIBUTION_ID, icon: "workflow", hue: "orange", order: 25, group: "advance", accepts_objects: true },
    ],
  },
};
