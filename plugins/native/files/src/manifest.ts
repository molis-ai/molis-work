import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import {
  CODING_FILE_CHANGED_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  FILES_COLLECTION_SCHEMA_VERSION,
  FILES_COLLECTION_TYPE,
  FILE_SNAPSHOT_SCHEMA_VERSION,
  FILE_SNAPSHOT_TYPE,
  FILE_TEXT_SELECTION_SCHEMA_VERSION,
  FILE_TEXT_SELECTION_TYPE,
  GIT_FILE_CHANGED_EVENT,
  WORKSPACE_REF_SCHEMA_VERSION,
  WORKSPACE_REF_TYPE,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { FILES_UI_CONTRIBUTION_ID } from "./ui.js";

export const FILES_PLUGIN_ID = "io.molis.work.files";
/** Named, not imported: subscribing to a Plugin is not depending on its code. */
export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const FILES_PROJECT_PLUGIN_ID = "files";

export const FILES_WORKSPACE_INPUT_PORT = "workspace";
export const FILES_COLLECTION_OUTPUT_PORT = "files";
export const FILES_BEFORE_OUTPUT_PORT = "before";
export const FILES_AFTER_OUTPUT_PORT = "after";
export const FILES_SELECTION_OUTPUT_PORT = "selection";

/**
 * Files: the browser and reader everything downstream captures from.
 *
 * It subscribes to the two Plugins that change files behind the user's back —
 * Coding when a Run writes, Git when the working tree moves — because a tree
 * that silently shows a deleted file is worse than one that reloads.
 *
 * `before` and `after` are two ports rather than one with two versions: a
 * comparison needs both ends at once, and a single port can only ever hold one
 * current value.
 */
export const filesManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FILES_PLUGIN_ID,
  version: "1.0.0",
  name: "Files",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-files-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取绑定的工作目录引用" },
    { permission: "artifact:write", required: true, reason: "发布文件集合、文本快照与选区" },
    { permission: "storage:private", required: false, reason: "记住上次读到哪个文件" },
  ],
  capabilities: {
    provides: [],
    consumes: [projectsCapabilities.readWorkspace.capability_id],
  },
  artifacts: {
    produces: [
      { artifact_type_id: FILES_COLLECTION_TYPE, schema_version: FILES_COLLECTION_SCHEMA_VERSION },
      { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION },
      { artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION },
    ],
    consumes: [{ artifact_type_id: WORKSPACE_REF_TYPE, schema_version: WORKSPACE_REF_SCHEMA_VERSION }],
  },
  ports: {
    inputs: [
      {
        port: FILES_WORKSPACE_INPUT_PORT,
        artifact_type_id: WORKSPACE_REF_TYPE,
        schema_version: WORKSPACE_REF_SCHEMA_VERSION,
      },
    ],
    outputs: [
      {
        port: FILES_COLLECTION_OUTPUT_PORT,
        artifact_type_id: FILES_COLLECTION_TYPE,
        schema_version: FILES_COLLECTION_SCHEMA_VERSION,
      },
      {
        port: FILES_BEFORE_OUTPUT_PORT,
        artifact_type_id: FILE_SNAPSHOT_TYPE,
        schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
      },
      {
        port: FILES_AFTER_OUTPUT_PORT,
        artifact_type_id: FILE_SNAPSHOT_TYPE,
        schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
      },
      {
        port: FILES_SELECTION_OUTPUT_PORT,
        artifact_type_id: FILE_TEXT_SELECTION_TYPE,
        schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION,
      },
    ],
  },
  events: {
    publishes: [],
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
      {
        event_type_id: GIT_FILE_CHANGED_EVENT,
        type_version: 1,
        from_plugin_ids: ["io.molis.work.git"],
      },
    ],
  },
  ui: {
    contributions: [FILES_UI_CONTRIBUTION_ID],
    commands: [
      {
        command_id: "files.open-file",
        title: "在 Files 中打开",
        input_kinds: ["current", "object"],
        opens_view_id: "tree",
      },
    ],
    views: [
      {
        view_id: "tree",
        slot: "navigator",
        title: "Files",
        contribution_id: FILES_UI_CONTRIBUTION_ID,
        icon: "folder-tree",
        order: 20,
        accepts_objects: true,
      },
    ],
  },
};

/**
 * The binding the Host creates by default.
 *
 * Named as plain ids rather than imported from those Plugins: a default is a
 * suggestion about wiring, not a dependency on the other Plugin's code, and
 * Files stays useful if Workspace is not installed.
 */
export const FILES_WORKSPACE_SOURCE = {
  source_plugin_id: "io.molis.work.workspace",
  source_port: "workspace",
} as const;
