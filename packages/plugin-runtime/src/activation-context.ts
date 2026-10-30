import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition, PluginExecutor, PluginInstanceRecord, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { outsidePluginAction } from "./action-scope.js";


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
  return { context, definition, revoke() { active = false; }, revoked() { return !active; } };
}

/**
 * A stop that finds no installation record (deleted under the Runtime) still lets go of the instance this process activated: authority
 * withdrawn first, then the executor's stop with the definition and context it started with. Nothing can be recorded, so the missing
 * record is the stop's failure, also when the stop hook throws (T-124).
 */
export async function releaseUnrecorded(activation: { context: PluginStartContext; definition: PluginDefinition } | undefined, executor: PluginExecutor, revoke: () => void): Promise<never> {
  revoke();
  // A failing stop hook has nothing left to mark crashed: the missing record is the failure reported either way.
  if (activation) await Promise.allSettled([outsidePluginAction(() => executor.stop(activation.definition, activation.context))]);
  throw pluginErrors.definition_missing("Plugin installation 不存在");
}
