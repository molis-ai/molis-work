import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition, PluginInstanceRecord, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";


/** Every activation owns a fresh grant snapshot and revocation cell, including Home activations. */
export function createActivationContext(record: PluginInstanceRecord, definition: PluginDefinition, providerId: string) {
  let active = true;
  const grants = Object.freeze([...record.grants]);
  const context: PluginStartContext = Object.freeze({
    install_id: record.install_id,
    installation_generation: record.installation_generation,
    provider_id: providerId,
    plugin_id: record.plugin_id,
    // Authenticate the running implementation; the stored version changes only on explicit upgrade.
    version: definition.manifest.version,
    deployment: record.deployment,
    grants,
    requireGrant(permission: string) {
      if (!active || !grants.includes(permission)) {
        throw pluginErrors.grant_denied(`Plugin 没有 ${permission} grant`);
      }
    },
  });
  return { context, revoke() { active = false; }, revoked() { return !active; } };
}
