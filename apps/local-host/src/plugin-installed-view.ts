import type { PluginInstanceRecord, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { platformPermissionMeaning, type PluginInstalledPermissionView, type PluginInstalledView, type PluginJobView, type PluginPermissionView } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import type { PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';

/** One installation of a project or of the Home, the Manifest it was installed with (undefined when that cannot be read), and why it is not running when its plugin host knows. */
export interface InstalledPluginEntry { record: PluginInstanceRecord; manifest: PluginManifest | undefined; recoveryError?: string }

/** What a Manifest asks for, each with the plugin's reason and what the platform says the permission is. */
export const permissionViews = (manifest: PluginManifest): PluginPermissionView[] =>
  manifest.permissions.map(item => ({ permission: item.permission, required: item.required, reason: item.reason, meaning: platformPermissionMeaning(item.permission) }));

/** What an installation asked for and holds: the Manifest's permissions, each with whether this installation's grants include it (PG-002). */
export const installedPermissionViews = (manifest: PluginManifest, grants: readonly string[]): PluginInstalledPermissionView[] =>
  permissionViews(manifest).map(view => ({ ...view, granted: grants.includes(view.permission) }));

/** The background jobs a Manifest declares. */
export const jobViews = (manifest: PluginManifest): PluginJobView[] =>
  (manifest.background?.jobs ?? []).map(job => ({ job_id: job.job_id, reason: job.reason, permissions: [...job.permissions] }));

/** The plugin detail page's rows (ac-trust T7): the trust the install carries, what it asked for and runs, and the agreements the person gave it. */
export function installedPluginViews(entries: readonly InstalledPluginEntry[], ledger: PluginConsentLedger): PluginInstalledView[] {
  const pins = new Map(ledger.publishers().map(pin => [pin.key_id, pin]));
  return entries.map(({ record, manifest, recoveryError }) => ({
    install_id: record.install_id, plugin_id: record.plugin_id, name: manifest?.name ?? record.plugin_id, version: record.version, state: record.state,
    trust: record.publisher_trust, publisher_signature: record.publisher_signature, publisher_label: pins.get(record.publisher_signature)?.label ?? null,
    manifest_available: manifest !== undefined, permissions: manifest ? installedPermissionViews(manifest, record.grants) : [], jobs: manifest ? jobViews(manifest) : [],
    consents: ledger.consents(record.plugin_id), recovery_error: recoveryError ?? null,
  }));
}
