import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_CONNECTIONS_PERMISSION, type PluginConnectionsClient } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { createPluginConnectionsClient } from "@molis-ai/molis-work-plugin-runtime";
import { createPluginConnectionsPort } from "./connector-plugin-requests.js";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * `services.connections` (S0b-2, S-57): only when the Manifest declares `connections:use` with its slots, on a platform that reaches a Home.
 * A sandboxed plugin gets the same client and reaches it through the broker (S-60). The grant is read again on every request (`context.requireGrant`).
 */
export function pluginConnectionsFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void): PluginConnectionsClient | undefined {
  const { manifest } = definition;
  if (!home || !manifest.connections?.slots.length
    || !manifest.permissions.some(item => item.permission === PLUGIN_CONNECTIONS_PERMISSION)) return undefined;
  return createPluginConnectionsClient(manifest, createPluginConnectionsPort(home.directory), {
    install_id: context.install_id, installation_generation: context.installation_generation, ...(context.project_id ? { project_id: context.project_id } : {}), assertActive, requireGrant: permission => context.requireGrant(permission),
  });
}
