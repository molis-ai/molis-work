import { GIT_ACTIONS } from "./action-definitions.js";
import { HOST_REVIEW_SETTLED_EVENT, HOST_WORKSPACE_CHANGED_EVENT, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import {
  CODING_CHANGESET_TYPE,
  DIFF_CHANGESET_SCHEMA_VERSION,
  DIFF_CHANGESET_TYPE,
  GIT_RESULT_SCHEMA_VERSION,
  GIT_RESULT_TYPE,
  workspaceReadActions,
  prepareGitIndexCapability,
  readGitResultsCapability, prepareGitOperationCapability, readGitOperationsCapability,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { GIT_FILE_CHANGED_EVENT, GIT_OPERATION_UPDATED_EVENT } from "./events.js";
import { GIT_UI_CONTRIBUTION_ID } from "./ui.js";

export const GIT_PLUGIN_ID = "io.molis.work.git";
/** Named, not imported: subscribing to a Plugin is not depending on its code. */
const CODING_PLUGIN_ID = "io.molis.work.coding";
const CODING_RUN_UPDATED_EVENT = "io.molis.work.coding.run-updated";
const CODING_FILE_CHANGED_EVENT = "io.molis.work.coding.file-changed";
const CODING_WORKSPACE_INVALIDATED_EVENT = "io.molis.work.coding.workspace-invalidated";
/** What the project database stores for this Plugin. */
export const GIT_PROJECT_PLUGIN_ID = "git";

export const GIT_WORKSPACE_INPUT_PORT = "workspace";
export const GIT_RUN_CHANGESET_INPUT_PORT = "run-changeset";
export const GIT_CHANGESET_OUTPUT_PORT = "changeset";
export const GIT_RESULT_OUTPUT_PORT = "result";

/**
 * Git: what is in the working tree, and what a Run wants put there.
 *
 * The Run's change set is an **optional** input, not a requirement: Git is
 * perfectly useful with nothing but a workspace bound, and making the Coding
 * connection mandatory would stop it activating in a project that has no
 * Coding sessions at all.
 *
 * It publishes a single-file change set on `changeset` so the same comparison
 * surface renders a working-tree change and a prepared one, and a receipt on
 * `result` so whoever asked for an operation learns how it went.
 */
export const gitManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: GIT_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Git",
  summary: "查看项目仓库的版本与变更。", summary_text: { key: "git.directory.summary" },
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-git-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取项目目录引用、已固定的 Git 差异与待确认的变更", reason_text: { key: "git.permission.artifact-read.reason" } },
    { permission: "artifact:write", required: true, reason: "保存工作区的固定差异与已确定的 Git 操作结果", reason_text: { key: "git.permission.artifact-write.reason" } },
    { permission: "storage:private", required: true, reason: "在本地保存你选中的固定差异、提交说明和冲突解决草稿", reason_text: { key: "git.permission.storage-private.reason" } },
    { permission: "workspace:read", required: true, reason: "只读查看项目关联目录的 Git 状态、分支摘要、差异和冲突文件", reason_text: { key: "git.permission.workspace-read.reason" } },
    // Starting a review only: whether the stage or the Git operation happens is a person's to approve, every time (PG-009).
    { permission: "review:git-index", required: true, reason: "发起暂存或取消暂存的操作审阅，经你明确批准后才修改暂存区", reason_text: { key: "git.permission.review-git-index.reason" } },
    { permission: "review:git-operation", required: true, reason: "发起提交、分支、推送、合并、拉取与解决冲突的操作审阅，经你明确批准后才执行", reason_text: { key: "git.permission.review-git-operation.reason" } },
  ],
  capabilities: {
    provides: [],
    consumes: [projectDirectoryActions.get.capability_id, workspaceReadActions.git.capability_id, prepareGitIndexCapability.capability_id, readGitResultsCapability.capability_id,
      prepareGitOperationCapability.capability_id, readGitOperationsCapability.capability_id, "diff.state"],
  },
  actions: GIT_ACTIONS,
  artifacts: { produces: [], consumes: [] },
  // Change sets and run receipts are exchange data for Diff and Coding; they are not 成果.
  process_items: {
    produces: [
      { artifact_type_id: DIFF_CHANGESET_TYPE, schema_version: DIFF_CHANGESET_SCHEMA_VERSION },
      { artifact_type_id: GIT_RESULT_TYPE, schema_version: GIT_RESULT_SCHEMA_VERSION },
    ],
    consumes: [
      { artifact_type_id: GIT_RESULT_TYPE, schema_version: GIT_RESULT_SCHEMA_VERSION },
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: /* @version type.coding.changeset */ 1 },
    ],
  },
  ports: {
    inputs: [{ port: GIT_RUN_CHANGESET_INPUT_PORT, artifact_type_id: CODING_CHANGESET_TYPE, schema_version: /* @version type.coding.changeset */ 1, optional: true }],
    outputs: [
      {
        port: GIT_CHANGESET_OUTPUT_PORT,
        artifact_type_id: DIFF_CHANGESET_TYPE,
        schema_version: DIFF_CHANGESET_SCHEMA_VERSION,
      },
      {
        port: GIT_RESULT_OUTPUT_PORT,
        artifact_type_id: GIT_RESULT_TYPE,
        schema_version: GIT_RESULT_SCHEMA_VERSION,
      },
    ],
  },
  events: {
    publishes: [{ event_type_id: GIT_FILE_CHANGED_EVENT, type_version: /* @version event.io.molis.work.git.file-changed */ 1 }, { event_type_id: GIT_OPERATION_UPDATED_EVENT, type_version: /* @version event.io.molis.work.git.operation-updated */ 1 }],
    subscribes: [
      { event_type_id: CODING_RUN_UPDATED_EVENT, type_version: /* @version event.io.molis.work.coding.run-updated */ 1, from_plugin_ids: [CODING_PLUGIN_ID] },
      {
        event_type_id: CODING_FILE_CHANGED_EVENT,
        type_version: /* @version event.io.molis.work.coding.file-changed */ 1,
        from_plugin_ids: [CODING_PLUGIN_ID],
      },
      {
        event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT,
        type_version: /* @version event.io.molis.work.coding.workspace-invalidated */ 1,
        from_plugin_ids: [CODING_PLUGIN_ID],
      },
      // Operations Git asked for, once a person approved and the Host ran them. Only the Host sends it, so no source is named.
      { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: /* @version event.host.review.settled */ 1 },
      // Every person-approved workspace operation of this project, whoever asked: a Coding worktree or integration too (BL-379).
      // The Host broadcasts it to each installation that subscribes and holds `workspace:read`.
      { event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: /* @version event.host.workspace.changed */ 1 },
    ],
  },
  routes: [
    { route_id: "git.results", method: "GET", path: "/results" },
    { route_id: "git.save-result", method: "POST", path: "/results" },
    { route_id: "git.state", method: "GET", path: "/state" },
    { route_id: "git.select-diff", method: "POST", path: "/diff" },
    { route_id: "git.prepare-index", method: "POST", path: "/prepare-index" },
    { route_id: "git.summary", method: "GET", path: "/summary" },
    { route_id: "git.pr-support", method: "GET", path: "/pr-support" },
    { route_id: "git.conflict", method: "GET", path: "/conflict" },
    { route_id: "git.operations", method: "GET", path: "/operations" },
    { route_id: "git.prepare-operation", method: "POST", path: "/operations" },
  ],
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "git.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "git.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "git.help.example-1" }, { key: "git.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "git.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "git.help.advanced-summary" }, body: { key: "git.help.advanced" } },
        ],
      }],
    },
    embedded_plugins: ["io.molis.work.diff"],
    contributions: [GIT_UI_CONTRIBUTION_ID],
    views: [
      {
        view_id: "changes",
        slot: "navigator",
        title: "Git",
        contribution_id: GIT_UI_CONTRIBUTION_ID,
        icon: "git-branch",
        hue: "orange",
        order: 30,
      },
    ],
  },
};

