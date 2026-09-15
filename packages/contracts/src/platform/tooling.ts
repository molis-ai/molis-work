/** Generated as the F2 contract-only workspace boundary. */
import type { ContractDescriptor } from "./package.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { PluginInstanceRecord } from "./plugin.js";
import type { ArtifactVersionRecord } from "../modules/artifacts.js";
import type { ConnectorHealth, ConnectorPollResult } from "../services/connector-host.js";

export interface PluginDevelopmentInput {
  directory: string;
  board_id: string;
  actor_id: string;
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
export const pluginDevelopmentCapability = {
  capability_id: "io.molis.work.local-host.plugin.development",
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<PluginDevelopmentInput, PluginDevelopmentResult>;

export const platformToolingContract = {
  contractId: "io.molis.work.platform.tooling.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/platform/CONTRACTS-AND-OPERATIONS.md",
} as const satisfies ContractDescriptor;
