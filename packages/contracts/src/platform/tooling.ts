/** Generated as the F2 contract-only workspace boundary. */
import type { ContractDescriptor } from "./package.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { PluginInstanceRecord } from "./plugin.js";
import type { ArtifactVersionRecord } from "../modules/artifacts.js";
import type { ConnectorHealth, ConnectorPollResult } from "../services/connector-host.js";

/** What the Host's plugin development run takes. It names no one: the Host records the actor it fixes for this door, and refuses an `actor_id` in the arguments. */
export interface PluginDevelopmentInput {
  directory: string;
  project_id: string;
  grants: string[];
  allow_unsigned_development: true;
}
export interface PluginDevelopmentResult {
  installation: PluginInstanceRecord;
  health: ConnectorHealth;
  poll: ConnectorPollResult;
  artifacts: ArtifactVersionRecord[];
  rendered_ui: Array<{ contribution_id: string; surface: string; html: string }>;
}
/**
 * Host-only: it installs and runs unsigned local code with the grants it is given, and records the actor the Host fixes for
 * this door, so a plugin that lists it under capabilities.consumes is refused (`actions.host_only`).
 */
export const pluginDevelopmentCapability = {
  capability_id: "io.molis.work.local-host.plugin.development",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<PluginDevelopmentInput, PluginDevelopmentResult>;

export const platformToolingContract = {
  contractId: "io.molis.work.platform.tooling.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/platform/CONTRACTS-AND-OPERATIONS.md",
} as const satisfies ContractDescriptor;
