import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import {
  CODING_CHANGESET_TYPE,
  CODING_FILE_CHANGED_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  DIFF_CHANGESET_SCHEMA_VERSION,
  DIFF_CHANGESET_TYPE,
  GIT_FILE_CHANGED_EVENT,
  GIT_RESULT_SCHEMA_VERSION,
  GIT_RESULT_TYPE,
  WORKSPACE_REF_SCHEMA_VERSION,
  WORKSPACE_REF_TYPE,
  readWorkspaceGitCapability,
  prepareGitIndexCapability,
  readGitResultsCapability, prepareGitOperationCapability, readGitOperationsCapability,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { GIT_UI_CONTRIBUTION_ID } from "./ui.js";

export const GIT_PLUGIN_ID = "io.molis.work.git";
/** Named, not imported: subscribing to a Plugin is not depending on its code. */
export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const GIT_PROJECT_PLUGIN_ID = "git";

export const GIT_WORKSPACE_INPUT_PORT = "workspace";
export const GIT_RUN_CHANGESET_INPUT_PORT = "run_changeset";
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
  schema_version: 2,
  host_api_version: 2,
  plugin_id: GIT_PLUGIN_ID,
  version: "1.4.0",
  name: "Git",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-git-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取工作目录引用与待接受的变更" },
    { permission: "artifact:write", required: true, reason: "发布工作区改动与操作回执" },
    { permission: "storage:private", required: true, reason: "保留固定差异选择、提交信息与冲突草稿" },
  ],
  capabilities: {
    provides: [],
    consumes: [projectsCapabilities.readWorkspace.capability_id, readWorkspaceGitCapability.capability_id, prepareGitIndexCapability.capability_id, readGitResultsCapability.capability_id,
      prepareGitOperationCapability.capability_id, readGitOperationsCapability.capability_id],
  },
  artifacts: {
    produces: [
      { artifact_type_id: DIFF_CHANGESET_TYPE, schema_version: DIFF_CHANGESET_SCHEMA_VERSION },
      { artifact_type_id: GIT_RESULT_TYPE, schema_version: GIT_RESULT_SCHEMA_VERSION },
    ],
    consumes: [
      { artifact_type_id: GIT_RESULT_TYPE, schema_version: GIT_RESULT_SCHEMA_VERSION },
      { artifact_type_id: WORKSPACE_REF_TYPE, schema_version: WORKSPACE_REF_SCHEMA_VERSION },
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
    ],
  },
  ports: {
    inputs: [
      {
        port: GIT_WORKSPACE_INPUT_PORT,
        artifact_type_id: WORKSPACE_REF_TYPE,
        schema_version: WORKSPACE_REF_SCHEMA_VERSION,
      },
      {
        port: GIT_RUN_CHANGESET_INPUT_PORT,
        artifact_type_id: CODING_CHANGESET_TYPE,
        schema_version: 1,
        optional: true,
      },
    ],
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
    publishes: [{ event_type_id: GIT_FILE_CHANGED_EVENT, type_version: 1 }],
    subscribes: [
      {
        event_type_id: CODING_FILE_CHANGED_EVENT,
        type_version: 1,
        from_plugin_ids: [CODING_PLUGIN_ID],
      },
      {
        event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT,
        type_version: 1,
        from_plugin_ids: [CODING_PLUGIN_ID],
      },
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
    { route_id: "git.operations", method: "GET", path: "/operations" },
    { route_id: "git.prepare-operation", method: "POST", path: "/operations" },
  ],
  ui: {
    contributions: [GIT_UI_CONTRIBUTION_ID],
    commands: [
      {
        command_id: "git.open-change",
        title: "查看这处改动",
        input_kinds: ["current", "object"],
        opens_view_id: "changes",
      },
      {
        command_id: "git.accept-run-changes",
        title: "把这一轮的改动放进工作区",
        input_kinds: ["agent-session", "artifacts"],
        opens_view_id: "changes",
      },
    ],
    views: [
      {
        view_id: "changes",
        slot: "navigator",
        title: "Git",
        contribution_id: GIT_UI_CONTRIBUTION_ID,
        icon: "git-branch",
        order: 30,
        accepts_objects: true,
      },
    ],
  },
};

/** The binding the Host creates by default, named rather than imported. */
export const GIT_WORKSPACE_SOURCE = {
  source_plugin_id: "io.molis.work.workspace",
  source_port: "workspace",
} as const;
