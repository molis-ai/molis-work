import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ISSUES_ACTIONS } from "./actions.js";
import { localizeManifestActions } from "./manifest-action-text.js";
import { issuesSkills } from "./skills.js";
import { ISSUES_DATABASE } from "./database.js";
import { ISSUE_BODY_BYTES } from "./images.js";
import { issuesSync } from './replication.js';

export const ISSUES_PLUGIN_ID = "io.molis.work.issues";
export const ISSUES_UI_CONTRIBUTION_ID = "io.molis.work.native.issues.ui.v1";
export const issuesManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: ISSUES_PLUGIN_ID, version: /* @version product.release */ "0.1.0", name: "Issue", summary: "记录、查看和整理自己的问题。", summary_text: { key: "issues.directory.summary" }, kind: "app",
  publisher: { publisher_id: "molis", signature: "official-issues-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "issues:read", required: true, reason: "查看你的个人问题记录", reason_text: { key: "issues.permission.issues-read.reason" } },
    { permission: "issues:write", required: true, reason: "记录、编辑和删除你的个人问题", reason_text: { key: "issues.permission.issues-write.reason" } },
    { permission: "storage:private", required: true, reason: "在本机个人空间里保存你的问题记录", reason_text: { key: "issues.permission.storage-private.reason" } },
    { permission: "model:invoke", required: false, reason: "在你触发时，帮录入或整理的问题起标题并判断类型", reason_text: { key: "issues.permission.model-invoke.reason" } },
  ],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, actions: localizeManifestActions(ISSUES_ACTIONS),
  methods: issuesSkills.map(({ body: _body, body_by_locale: _localized, ...method }) => ({ ...method, tools: [...method.tools] })),
  // Each partition's own library (specs/unified-partition-plugins §4.2, batch 108): the personal space's, or a project's where it is enabled.
  databases: { partition: ISSUES_DATABASE },
  sync: issuesSync,
  routes: [
    { route_id: "issues.prepare", method: "POST", path: "/prepare", permission: "issues:write", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.cancel_capture", method: "POST", path: "/cancel-capture", permission: "issues:write" },
    { route_id: "issues.name_draft", method: "POST", path: "/name-draft", permission: "issues:write", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.suggest_name", method: "POST", path: "/suggest-name", permission: "issues:read", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.capture", method: "POST", path: "/capture", permission: "issues:write", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.discard", method: "POST", path: "/discard", permission: "issues:write" },
    { route_id: "issues.list", method: "GET", path: "/list", permission: "issues:read" },
    { route_id: "issues.read", method: "GET", path: "/read", permission: "issues:read" },
    { route_id: "issues.create", method: "POST", path: "/create", permission: "issues:write", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.update", method: "POST", path: "/update", permission: "issues:write", max_body_bytes: ISSUE_BODY_BYTES },
    { route_id: "issues.delete", method: "POST", path: "/delete", permission: "issues:write" },
  ],
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "issues.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "issues.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "issues.help.example-1" }, { key: "issues.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "issues.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "issues.help.advanced-summary" }, body: { key: "issues.help.advanced" } },
        ],
      }],
    }, contributions: [ISSUES_UI_CONTRIBUTION_ID], views: [
    { view_id: "directory", slot: "navigator", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID, icon: "circle-alert", order: 57 },
    { view_id: "issues", slot: "stage", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID },
    { view_id: "capture", slot: "side", title: "Issue", contribution_id: ISSUES_UI_CONTRIBUTION_ID, icon: "circle-alert" },
  ] },
};
