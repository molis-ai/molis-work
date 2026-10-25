import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  CODING_CHANGESET_TYPE,
  DIFF_CHANGESET_SCHEMA_VERSION,
  DIFF_CHANGESET_TYPE,
  FILE_SNAPSHOT_SCHEMA_VERSION,
  FILE_SNAPSHOT_TYPE,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { DIFF_ACTIONS } from "./actions.js";
import { DIFF_UI_CONTRIBUTION_ID } from "./ui.js";

import { DIFF_MESSAGES } from "./messages.js";
import { DIFF_EN } from "./en.js";
export const DIFF_PLUGIN_ID = "io.molis.work.diff";
/** What the project database stores for this Plugin. */
export const DIFF_PROJECT_PLUGIN_ID = "diff";

export const DIFF_BEFORE_INPUT_PORT = "before";
export const DIFF_AFTER_INPUT_PORT = "after";
export const DIFF_CHANGESET_INPUT_PORT = "changeset";
export const DIFF_GIT_INPUT_PORT = "git-changeset";

export const DIFF_SNAPSHOTS_GROUP = "snapshots";
export const DIFF_CHANGESET_GROUP = "change-set";
export const DIFF_GIT_GROUP = "git-change-set";

/**
 * Diff: one comparison surface for three interchangeable kinds of input.
 *
 * The three groups exist because the user must be able to tell *which* thing
 * they are looking at: two files they captured, a change a Run proposed, or a
 * change already in the working tree. Merging them into one port set would
 * make the same screen mean three different things with no way to say which.
 *
 * Every input port is optional: a group that is not selected must not block
 * activation, and Diff with nothing bound is a legitimate, explainable state.
 */
export const diffManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: DIFF_PLUGIN_ID,
  version: "0.3.0",
  name: "Diff",
  summary: "比较固定版本，逐项阅读差异。",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-diff-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取要对比的快照与变更" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: DIFF_ACTIONS,
  artifacts: {
    produces: [],
    consumes: [
      { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION },
      { artifact_type_id: DIFF_CHANGESET_TYPE, schema_version: DIFF_CHANGESET_SCHEMA_VERSION },
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
    ],
  },
  process_items: {
    produces: [],
    consumes: [
      { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION },
      { artifact_type_id: DIFF_CHANGESET_TYPE, schema_version: DIFF_CHANGESET_SCHEMA_VERSION },
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
    ],
  },
  ports: {
    inputs: [
      {
        port: DIFF_BEFORE_INPUT_PORT,
        artifact_type_id: FILE_SNAPSHOT_TYPE,
        schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
        optional: true,
        default_source: { plugin_id: "io.molis.work.files", port: "before" },
      },
      {
        port: DIFF_AFTER_INPUT_PORT,
        artifact_type_id: FILE_SNAPSHOT_TYPE,
        schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
        optional: true,
        default_source: { plugin_id: "io.molis.work.files", port: "after" },
      },
      {
        port: DIFF_CHANGESET_INPUT_PORT,
        artifact_type_id: CODING_CHANGESET_TYPE,
        schema_version: 1,
        optional: true,
        default_source: { plugin_id: "io.molis.work.coding", port: "changeset" },
      },
      {
        port: DIFF_GIT_INPUT_PORT,
        artifact_type_id: DIFF_CHANGESET_TYPE,
        schema_version: DIFF_CHANGESET_SCHEMA_VERSION,
        optional: true,
        default_source: { plugin_id: "io.molis.work.git", port: "changeset" },
      },
    ],
    outputs: [],
    input_groups: [
      {
        group_id: DIFF_SNAPSHOTS_GROUP,
        title: "两份快照",
        ports: [DIFF_BEFORE_INPUT_PORT, DIFF_AFTER_INPUT_PORT],
        default: true,
      },
      {
        group_id: DIFF_CHANGESET_GROUP,
        title: "Coding 准备的变更",
        ports: [DIFF_CHANGESET_INPUT_PORT],
      },
      {
        group_id: DIFF_GIT_GROUP,
        title: "Git 工作区改动",
        ports: [DIFF_GIT_INPUT_PORT],
      },
    ],
  },
  routes: [{ route_id: "diff.state", method: "GET", path: "/state" }],
  ui: {
    messages: DIFF_MESSAGES,
    translations: DIFF_EN,
    contributions: [DIFF_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "browse", slot: "navigator", title: "Diff", contribution_id: DIFF_UI_CONTRIBUTION_ID, icon: "git-compare", order: 65 },
      {
        view_id: "comparison",
        slot: "stage",
        title: "Diff",
        contribution_id: DIFF_UI_CONTRIBUTION_ID,
        icon: "git-compare",
        order: 40,
      },
    ],
  },
};
