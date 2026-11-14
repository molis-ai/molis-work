import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { WORKFLOWS_PLUGIN_ID } from "./model.js";
import { WORKFLOWS_UI_CONTRIBUTION_ID } from "./ui.js";
import { WORKFLOWS_ACTIONS } from "./actions.js";
import { workflowsSync } from "./replication.js";
import { WORKFLOWS_DATABASE } from "./database.js";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";

/** The largest body any Workflows route reads: the same 400 000 bytes the Host's own route gave them. */
const WORKFLOWS_BODY_BYTES = 400_000;

export const workflowsManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: WORKFLOWS_PLUGIN_ID,
  sync: workflowsSync,
  version: /* @version product.release */ "0.1.0",
  name: "工作流程",
  name_text: { key: "workflows.directory.name" },
  summary: "把插件串成流程，一步步做完。", summary_text: { key: "workflows.directory.summary" },
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
  // Each handoff is reported to the work records as this installation (specs/observation-collection/design.md §4「工作流」).
  capabilities: { provides: [], consumes: [observationActions.report.capability_id] },
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
  ui: { locales: { default: "zh", available: ["zh", "en"] },
    contributions: [WORKFLOWS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "工作流程", title_text: { key: "workflows.directory.view-directory" }, contribution_id: WORKFLOWS_UI_CONTRIBUTION_ID, icon: "workflow", hue: "orange", order: 25, group: "advance", accepts_objects: true },
    ],
  },
};
