/**
 * The switches a sandboxed installation has beyond its signed Manifest's rows (BL-701, user decision 2026-11-09 A). The Host works them
 * out once, from the verified release it builds the definition from (`sandboxProjectedPermissions`), and holds them beside that definition:
 * the Runtime counts them in every grant ceiling (install, the person's switch, start, recovery, upgrade, rollback), the settings pages list
 * them, and the sandbox is given only the effects whose switch is on. Nothing a plugin or an install request sends reaches this.
 */
import { ActionError, type ActionAvailability } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginDefinition, PluginInstanceRecord, PluginPermissionDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { effectsFromContract, sandboxOperationEffects, sandboxOperationSwitches, sandboxProjectedPermissions } from '@molis-ai/molis-work-plugin-sdk';

/**
 * By release identity (plugin, publisher signature, version): the Runtime holds one implementation per identity (`register` refuses a
 * second), and the same verified release always projects the same rows, so a stopped installation's settings list finds them too.
 */
const byRelease = new Map<string, readonly PluginPermissionDeclaration[]>();
const releaseKey = (pluginId: string, signature: string, version: string) => JSON.stringify([pluginId, signature, version]);

/** What the Host's sandboxed definition builders call on the definition they return: the rows its release's operations ask for. */
export function projectInstalledPermissions(definition: PluginDefinition, release: { design: { contract: SandboxPluginContract } }): void {
  const { plugin_id, publisher, version } = definition.manifest;
  byRelease.set(releaseKey(plugin_id, publisher.signature, version),
    Object.freeze(sandboxProjectedPermissions(definition.manifest, effectsFromContract(release.design.contract)).map(row => Object.freeze(row))));
}

/** The Runtime's `permissionDeclarations` port: only for a sandboxed definition, the only kind the Host projects rows for. */
export const projectedPermissionDeclarations = (definition: PluginDefinition): readonly PluginPermissionDeclaration[] | undefined =>
  definition.execution === 'sandbox' ? byRelease.get(releaseKey(definition.manifest.plugin_id, definition.manifest.publisher.signature, definition.manifest.version)) : undefined;

/** The rows a settings list shows for an installation beyond its Manifest's; none when its release was not built in this process. */
export const projectedPermissionsOf = (record: Pick<PluginInstanceRecord, 'execution' | 'plugin_id' | 'publisher_signature' | 'version'>): readonly PluginPermissionDeclaration[] =>
  record.execution === 'sandbox' ? byRelease.get(releaseKey(record.plugin_id, record.publisher_signature, record.version)) ?? [] : [];

/**
 * Which approved effect each new switch lets through; with the switch off the sandbox's broker is not given that effect at all. `connections:use`
 * is not here: an app's Manifest has that row and the Host's connection client checks it at each request, and an integration's source
 * connection is refused where the Host hands it out (`sandbox-integration.ts`).
 */
const SWITCHED: ReadonlyArray<readonly [keyof SandboxEffects, string]> = [
  ['networkDomains', 'network:request'], ['secretRefs', 'secret:use'], ['capabilities', 'capabilities:call'], ['background', 'background:start'],
];

/**
 * The installation's approval as this activation may use it: an effect whose switch is off is taken out, so the broker refuses it
 * (`sandbox.not_authorized`) whichever path reaches it. A permission switch restarts the activation, so this holds for its whole life.
 */
export function grantedEffects(approved: SandboxEffects, grants: readonly string[]): SandboxEffects {
  const effects: Record<string, unknown> = { ...approved };
  for (const [key, permission] of SWITCHED) if (!grants.includes(permission)) delete effects[key];
  return effects as SandboxEffects;
}

/** The switches an operation (with its background targets' effects) needs that this activation does not hold. */
export const missingOperationGrants = (effects: SandboxEffects, grants: readonly string[]): string[] =>
  sandboxOperationSwitches(effects).filter(permission => !grants.includes(permission));

/**
 * Refuses an operation before its code runs when the installation does not hold a switch it needs (BL-701): the same answer from a part of
 * its page, a directory action, a background start and a scheduled run. An operation that uses none of them runs as before, and the
 * Manifest's own rows are still checked by each service's Host client at each call.
 */
export function assertOperationGranted(effects: SandboxEffects, grants: readonly string[]): void {
  const missing = missingOperationGrants(effects, grants);
  if (missing.length) throw new ActionError('actions.forbidden', '这个插件的这项功能需要的权限没有开启：' + missing.join('、') + '。可以在插件设置里打开', { details: { permissions: missing } });
}

/** A directory action of an operation the installation does not hold the grants for: unavailable for that reason, apart from the caller's own permissions. */
export function operationGrantAvailability(contract: SandboxPluginContract, operationId: string, grants: readonly string[]): ActionAvailability | undefined {
  const operation = contract.operations.find(item => item.id === operationId);
  const missing = operation ? missingOperationGrants(sandboxOperationEffects(contract, operation), grants) : [];
  return missing.length ? { available: false, code: 'actions.plugin_permission', reason: '插件这项功能需要的权限没有开启：' + missing.join('、') } : undefined;
}
