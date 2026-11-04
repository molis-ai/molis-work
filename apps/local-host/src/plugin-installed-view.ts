import { pluginErrors, type PluginInstanceRecord, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { platformPermissionMeaning, type PluginInstalledPermissionView, type PluginInstalledView, type PluginJobView, type PluginPermissionView } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import type { PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';

/** One installation of a project or of the Home, the Manifest it was installed with (undefined when that cannot be read), and why it is not running when its plugin host knows. */
export interface InstalledPluginEntry { record: PluginInstanceRecord; manifest: PluginManifest | undefined; recoveryError?: string;
  /** Recomputed from a validated saved package, never a second persisted grant list. Ordinary plugins request every declared row. */
  requestedPermissions?: readonly string[] }

export type PermissionSwitchTarget = Pick<PluginInstanceRecord, 'installation_generation' | 'manifest_digest' | 'plugin_id' | 'publisher_signature' | 'version'>;
/** A switch checked against a saved package cannot cross an asynchronous change to the installation or its published declaration. */
export function assertPermissionSwitchTarget(record: PluginInstanceRecord, expected?: PermissionSwitchTarget): void {
  if (expected && (record.installation_generation !== expected.installation_generation || record.manifest_digest !== expected.manifest_digest
    || record.plugin_id !== expected.plugin_id || record.publisher_signature !== expected.publisher_signature || record.version !== expected.version)) {
    throw pluginErrors.definition_conflict('插件的安装或版本已变化，请重新查看权限');
  }
}

/** What a Manifest asks for, each with the plugin's reason and what the platform says the permission is. */
export const permissionViews = (manifest: PluginManifest, requested?: readonly string[]): PluginPermissionView[] =>
  manifest.permissions.map(item => ({ permission: item.permission, required: item.required, requested: requested === undefined || requested.includes(item.permission), reason: item.reason, meaning: platformPermissionMeaning(item.permission) }));

/** What an installation asked for and holds: the Manifest's permissions, each with whether this installation's grants include it (PG-002). */
export const installedPermissionViews = (manifest: PluginManifest, grants: readonly string[], requested?: readonly string[]): PluginInstalledPermissionView[] =>
  permissionViews(manifest, requested).map(view => ({ ...view, granted: grants.includes(view.permission) }));

/** The background jobs a Manifest declares. */
export const jobViews = (manifest: PluginManifest): PluginJobView[] =>
  (manifest.background?.jobs ?? []).map(job => ({ job_id: job.job_id, reason: job.reason, permissions: [...job.permissions] }));

/** The plugin detail page's rows (ac-trust T7): the trust the install carries, what it asked for and runs, and the agreements the person gave it. */
export function installedPluginViews(entries: readonly InstalledPluginEntry[], ledger: PluginConsentLedger): PluginInstalledView[] {
  const pins = new Map(ledger.publishers().map(pin => [pin.key_id, pin]));
  return entries.map(({ record, manifest, recoveryError, requestedPermissions }) => ({
    install_id: record.install_id, plugin_id: record.plugin_id, name: manifest?.name ?? record.plugin_id, version: record.version, state: record.state,
    trust: record.publisher_trust, publisher_signature: record.publisher_signature, publisher_label: pins.get(record.publisher_signature)?.label ?? null,
    manifest_available: manifest !== undefined, permissions: manifest ? installedPermissionViews(manifest, record.grants, requestedPermissions) : [], jobs: manifest ? jobViews(manifest) : [],
    consents: ledger.consents(record.plugin_id), recovery_error: recoveryError ?? null,
  }));
}
