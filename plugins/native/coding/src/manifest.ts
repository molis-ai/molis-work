import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import {
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
} from "./artifacts.js";
import { codingAgentManifest } from "./roles.js";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, CODING_UI_CONTRIBUTION_ID } from "./ui.js";

export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const CODING_PROJECT_PLUGIN_ID = "coding";

/**
 * Coding's declarations.
 *
 * `native` rather than `app` for the same reason as the other six: the shell
 * derives navigation from this Manifest, but the Plugin is still composed at
 * build time instead of being started and isolated by Plugin Runtime. Calling
 * it `app` would make the Manifest say something untrue.
 *
 * **No input ports yet.** Coding wants Shelf materials and Goal context, but
 * neither Shelf nor Goals produces an Artifact type today — every built-in
 * Plugin still declares `produces: []`. An input port for a type nothing can
 * publish would be a connection that can never be bound, so it is left out
 * until there is a producer. Goal facts reach Coding through the 16 already
 * registered Goals Capabilities in the meantime.
 */
export const codingManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: CODING_PLUGIN_ID,
  version: "1.0.0",
  name: "Coding",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-coding-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    {
      permission: "artifact:write",
      required: true,
      reason: "把变更集、报告与图作为 Artifact 发布，带来源与版本",
    },
  ],
  capabilities: {
    provides: [],
    consumes: [
      ...Object.values(agentHostCapabilities).map((entry) => entry.capability_id),
      projectsCapabilities.readWorkspace.capability_id,
    ],
  },
  artifacts: {
    produces: [
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_DIAGRAM_TYPE, schema_version: 1 },
    ],
    consumes: [],
  },
  ports: {
    inputs: [],
    outputs: [
      { port: "changeset", artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
      { port: "report", artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 },
      { port: "diagram", artifact_type_id: CODING_DIAGRAM_TYPE, schema_version: 1 },
    ],
  },
  agent: codingAgentManifest,
  ui: {
    contributions: [CODING_UI_CONTRIBUTION_ID, CODING_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      {
        view_id: "directory",
        slot: "navigator",
        title: "Coding",
        contribution_id: CODING_UI_CONTRIBUTION_ID,
        icon: "code",
        order: 55,
      },
      {
        view_id: "settings",
        slot: "settings",
        title: "Coding",
        contribution_id: CODING_SETTINGS_UI_CONTRIBUTION_ID,
      },
    ],
  },
};
