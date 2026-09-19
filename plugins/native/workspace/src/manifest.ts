import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";

import { WORKSPACE_REF_SCHEMA_VERSION, WORKSPACE_REF_TYPE } from "./artifact.js";
import { WORKSPACE_SELECTED_EVENT } from "./events.js";
import { WORKSPACE_UI_CONTRIBUTION_ID } from "./ui.js";

export const WORKSPACE_PLUGIN_ID = "io.molis.work.workspace";
/** What the project database stores for this Plugin. */
export const WORKSPACE_PROJECT_PLUGIN_ID = "workspace";
export const WORKSPACE_OUTPUT_PORT = "workspace";

/**
 * The source every workspace-shaped Plugin binds to.
 *
 * It has **no input ports on purpose**: it is the head of the graph. Everything
 * it publishes comes from the project catalog the Host already owns, so it
 * consumes one Capability and produces one Artifact type.
 */
export const workspaceManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: WORKSPACE_PLUGIN_ID,
  version: "1.0.0",
  name: "Workspace",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-workspace-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    {
      permission: "artifact:write",
      required: true,
      reason: "把当前项目的工作目录作为 Artifact 发布，供 Files、Git、Coding 连线",
    },
  ],
  capabilities: {
    provides: [],
    consumes: [projectsCapabilities.readWorkspace.capability_id],
  },
  artifacts: {
    produces: [{ artifact_type_id: WORKSPACE_REF_TYPE, schema_version: WORKSPACE_REF_SCHEMA_VERSION }],
    consumes: [],
  },
  ports: {
    inputs: [],
    outputs: [
      {
        port: WORKSPACE_OUTPUT_PORT,
        artifact_type_id: WORKSPACE_REF_TYPE,
        schema_version: WORKSPACE_REF_SCHEMA_VERSION,
      },
    ],
  },
  events: {
    publishes: [{ event_type_id: WORKSPACE_SELECTED_EVENT, type_version: 1 }],
    subscribes: [],
  },
  ui: {
    contributions: [WORKSPACE_UI_CONTRIBUTION_ID],
    commands: [
      {
        command_id: "workspace.reveal",
        title: "定位当前工作目录",
        input_kinds: ["current"],
        opens_view_id: "source",
      },
    ],
    views: [
      {
        view_id: "source",
        slot: "navigator",
        title: "Workspace",
        contribution_id: WORKSPACE_UI_CONTRIBUTION_ID,
        icon: "folder",
        order: 10,
      },
    ],
  },
};
