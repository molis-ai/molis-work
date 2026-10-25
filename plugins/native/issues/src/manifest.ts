import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ISSUES_ACTIONS } from "./actions.js";
import { issuesMethods } from "./methods.js";
import { ISSUES_DATABASE } from "./database.js";

export const ISSUES_PLUGIN_ID = "io.molis.work.issues";
export const ISSUES_UI_CONTRIBUTION_ID = "io.molis.work.native.issues.ui.v1";
export const issuesManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: ISSUES_PLUGIN_ID, version: "0.3.0", name: "Issue", summary: "记录、查看和整理自己的问题。", kind: "app",
  publisher: { publisher_id: "molis", signature: "official-issues-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "issues:read", required: true, reason: "查看个人问题记录" },
    { permission: "issues:write", required: true, reason: "记录、编辑和删除个人问题" },
    { permission: "storage:private", required: true, reason: "在个人 Home 保存问题" },
    { permission: "model:invoke", required: false, reason: "给录入和重新整理的问题起标题、判类型（显式调用）" },
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, actions: ISSUES_ACTIONS,
  methods: issuesMethods.map(({ body: _body, ...method }) => ({ ...method, tools: [...method.tools] })),
  runtime: { scope: "home" },
  databases: { home: ISSUES_DATABASE },
  routes: [
    { route_id: "issues.prepare", method: "POST", path: "/prepare", permission: "issues:write" },
    { route_id: "issues.cancel_capture", method: "POST", path: "/cancel-capture", permission: "issues:write" },
    { route_id: "issues.name_draft", method: "POST", path: "/name-draft", permission: "issues:write" },
    { route_id: "issues.suggest_name", method: "POST", path: "/suggest-name", permission: "issues:read" },
    { route_id: "issues.capture", method: "POST", path: "/capture", permission: "issues:write" },
    { route_id: "issues.discard", method: "POST", path: "/discard", permission: "issues:write" },
    { route_id: "issues.list", method: "GET", path: "/list", permission: "issues:read" },
    { route_id: "issues.read", method: "GET", path: "/read", permission: "issues:read" },
    { route_id: "issues.create", method: "POST", path: "/create", permission: "issues:write" },
    { route_id: "issues.update", method: "POST", path: "/update", permission: "issues:write" },
    { route_id: "issues.delete", method: "POST", path: "/delete", permission: "issues:write" },
  ],
  ui: { contributions: [ISSUES_UI_CONTRIBUTION_ID], views: [
    { view_id: "directory", slot: "navigator", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID, icon: "circle-alert", order: 57 },
    { view_id: "issues", slot: "stage", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID },
    { view_id: "capture", slot: "side", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID, icon: "circle-alert" },
  ] },
};
