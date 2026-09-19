import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import {
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
} from "./artifacts.js";
import { CODING_FILE_CHANGED_EVENT, CODING_PREFERENCE_EVENT, CODING_WORKSPACE_INVALIDATED_EVENT } from "./events.js";
import { codingAgentManifest } from "./roles.js";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, CODING_UI_CONTRIBUTION_ID } from "./ui.js";

export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const CODING_PROJECT_PLUGIN_ID = "coding";

/**
 * Coding's declarations.
 *
 * `app`, and that is now true: the Host starts this Plugin through Plugin
 * Runtime and renders its directory from the contribution it returns
 * (`apps/local-host/src/coding-surface.ts`). It was `native` until that path
 * existed, because a Manifest claiming `app` while the shell drew the Plugin
 * itself would have been a lie.
 *
 * The other six built-ins stay `native`: they are still composed at build time.
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
  kind: "app",
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
  events: {
    // What Coding tells the project: a file under the workspace changed, and a
    // prepared change set no longer matches what is on disk.
    publishes: [
      { event_type_id: CODING_FILE_CHANGED_EVENT, type_version: 1 },
      { event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT, type_version: 1 },
      { event_type_id: CODING_PREFERENCE_EVENT, type_version: 1 },
    ],
    subscribes: [],
  },
  agent: codingAgentManifest,
  ui: {
    contributions: [CODING_UI_CONTRIBUTION_ID, CODING_SETTINGS_UI_CONTRIBUTION_ID],
    /**
     * Entries the command menu and content actions offer.
     *
     * Each names the object it acts on rather than assuming the current one, so
     * "open this report" works from anywhere the report is visible instead of
     * only from inside the session that made it.
     */
    commands: [
      {
        command_id: "coding.new-session",
        title: "开一条编码会话",
        input_kinds: ["current"],
        opens_view_id: "directory",
      },
      {
        command_id: "coding.open-changeset",
        title: "查看这一轮的变更",
        input_kinds: ["agent-session"],
        opens_view_id: "directory",
      },
      {
        command_id: "coding.open-report",
        title: "打开报告",
        input_kinds: ["artifacts"],
        opens_view_id: "directory",
      },
    ],
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
