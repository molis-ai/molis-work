import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { scheduleAgentManifest } from "./roles.js";
import { SCHEDULE_UI_CONTRIBUTION_ID } from "./ui.js";

export const SCHEDULE_PLUGIN_ID = "io.molis.work.schedule";
/** What the project database stores for this Plugin. */
export const SCHEDULE_PROJECT_PLUGIN_ID = "schedule";
export const SCHEDULE_TASK_WAKEUP_CAPABILITY = "schedule.task.wakeup";

export const scheduleManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: SCHEDULE_PLUGIN_ID,
  version: "1.0.0",
  name: "Schedule",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-schedule-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: {
    provides: [],
    consumes: Object.values(agentHostCapabilities).map((entry) => entry.capability_id),
  },
  artifacts: { produces: [], consumes: [] },
  agent: scheduleAgentManifest,
  ui: {
    contributions: [SCHEDULE_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Schedule", contribution_id: SCHEDULE_UI_CONTRIBUTION_ID, icon: "timer", order: 35 },
    ],
  },
};
