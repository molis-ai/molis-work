import { PLUGIN_LOCAL_TOOLS_PERMISSION, type PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_ATTENTION_READ_PERMISSION, PLUGIN_ATTENTION_WRITE_PERMISSION, PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-attention";
import { PLUGIN_CONNECTIONS_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { PLUGIN_EVIDENCE_READ_PERMISSION, PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { PLUGIN_SCENES_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-scenes";
import { PLUGIN_JUDGMENTS_READ_PERMISSION, PLUGIN_JUDGMENTS_WRITE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-judgments";
import { ACTIONS_DELEGATE_PERMISSION } from "./plugin-action-delegation.js";
import { DIRECTORY_READ_PERMISSION } from "./plugin-directory-service.js";

// The Manifest permissions that make the Host build a service for a plugin's activation, in one place: each service's builder takes its
// names from here, and the sandbox's refusals (`NOT_GIVEN` in plugin-sandbox) are held to this table by tests/security-invariants-sandbox-services.test.ts
// (S-60), so a permission added to a service without a line for the sandbox turns that test red.

export const MODEL_PERMISSIONS: readonly string[] = ["model:read", "model:invoke"];
export const MATERIAL_PERMISSIONS: readonly string[] = ["materials:read", "materials:fetch", "materials:fetch_local", "materials:original"];
export const AGENT_RUN_PERMISSION = "agent:run";
export const SCHEDULE_READ_PERMISSION = "schedule:read";
export const SCHEDULE_WRITE_PERMISSION = "schedule:write";
export const NOTIFICATIONS_WRITE_PERMISSION = "notifications:write";
export const PLUGINS_READ_PERMISSION = "plugins:read";
export const STORAGE_PRIVATE_PERMISSION = "storage:private";

/** A service of `PluginHostServices` and the Manifest permissions it is built for. Services built from a declaration or an entry, not a permission, are not here. */
export const HOST_SERVICE_PERMISSIONS: { readonly [Service in keyof PluginHostServices]?: readonly string[] } = Object.freeze({
  storage: [STORAGE_PRIVATE_PERMISSION],
  model: MODEL_PERMISSIONS,
  materials: MATERIAL_PERMISSIONS,
  connections: [PLUGIN_CONNECTIONS_PERMISSION],
  sourcePull: [PLUGIN_SOURCE_PULL_FEED_PERMISSION, PLUGIN_SOURCE_PULL_QUERY_PERMISSION, PLUGIN_EVIDENCE_READ_PERMISSION],
  directory: [DIRECTORY_READ_PERMISSION],
  localTools: [PLUGIN_LOCAL_TOOLS_PERMISSION],
  scheduler: [SCHEDULE_READ_PERMISSION, SCHEDULE_WRITE_PERMISSION],
  agents: [AGENT_RUN_PERMISSION],
  notifications: [NOTIFICATIONS_WRITE_PERMISSION],
  installations: [PLUGINS_READ_PERMISSION],
  attention: [PLUGIN_ATTENTION_READ_PERMISSION, PLUGIN_ATTENTION_WRITE_PERMISSION],
  contextLedger: [PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION],
  actions: [ACTIONS_DELEGATE_PERMISSION],
  scenes: [PLUGIN_SCENES_PERMISSION],
  judgments: [PLUGIN_JUDGMENTS_READ_PERMISSION, PLUGIN_JUDGMENTS_WRITE_PERMISSION],
  // Checked by the ports and artifact services of plugin-runtime (`services.ts`), which keeps its own copy of these two names.
  artifacts: ["artifact:read", "artifact:write"],
});
