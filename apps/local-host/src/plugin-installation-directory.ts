import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstallationClient, PluginInstanceRecord, PluginManifest, PluginRuntimeRepository, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { PLUGINS_READ_PERMISSION } from "./plugin-service-permissions.js";

type ManifestReader = (pluginId: string) => PluginManifest | undefined;
const readers = new WeakMap<object, Set<ManifestReader>>();

/** Platforms sharing one project library contribute names; the Runtime repository remains the installation owner. */
export function openPluginInstallationDirectory(db: PluginRuntimeDatabase, records: PluginRuntimeRepository, manifest: ManifestReader) {
  const sources = readers.get(db) ?? new Set<ManifestReader>(); readers.set(db, sources); sources.add(manifest);
  let active = true;
  const view = (record: PluginInstanceRecord) => {
    const declared = declaredManifest(db, record);
    return { install_id: record.install_id, installation_generation: record.installation_generation, plugin_id: record.plugin_id,
      version: record.version, publisher_id: record.publisher_id, name: declared?.name ?? record.plugin_id, state: record.state };
  };
  const current = () => { if (!active) throw new ActionError("actions.forbidden", "插件安装目录已关闭"); };
  const client: PluginInstallationClient = Object.freeze({
    list: () => { current(); return records.list().filter(record => record.state !== "uninstalled").map(view); },
    get: (installId: string) => { current(); const record = records.get(installId); return record ? view(record) : null; },
  });
  return { client, dispose() { active = false; sources.delete(manifest); if (!sources.size) readers.delete(db); } };
}

/** The Manifest an installation was installed with: a running platform's, else its stored release. */
function declaredManifest(db: PluginRuntimeDatabase, record: PluginInstanceRecord): PluginManifest | undefined {
  for (const read of readers.get(db) ?? []) { const candidate = read(record.plugin_id); if (candidate?.version === record.version) return candidate; }
  return new SqlitePluginRuntimeReleaseArtifactRepository(db).get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest)?.manifest;
}

/** Every installation of a project that has not been uninstalled, each with the Manifest it was installed with (undefined when that cannot be read). */
export function installedPluginEntries(db: PluginRuntimeDatabase): Array<{ record: PluginInstanceRecord; manifest: PluginManifest | undefined }> {
  return pluginInstallRecords(db).list().filter(record => record.state !== "uninstalled").map(record => ({ record, manifest: declaredManifest(db, record) }));
}

/** A project's installation and its Manifest, for a check that needs what it declares; `null` when it is not installed there. */
export function installedPluginManifest(db: PluginRuntimeDatabase, install_id: string): { record: PluginInstanceRecord; manifest: PluginManifest } | null {
  const record = pluginInstallRecords(db).get(install_id);
  const manifest = record && record.state !== "uninstalled" ? declaredManifest(db, record) : undefined;
  return record && manifest ? { record, manifest } : null;
}

/**
 * The connection slots an installation declares, for binding a `per_record` slot (S-71 provisional): the caller's project's installation
 * of that plugin, else the Home's; `null` when neither has it.
 */
export async function installedConnectionSlots<Reference>(install_id: string, plugin_id: string,
  home: { installation(id: string): PluginInstanceRecord | null; manifest(id: string): PluginManifest | undefined } | undefined,
  inProject: (reference: Reference) => Promise<{ record: PluginInstanceRecord; manifest: PluginManifest } | null>, reference: Reference | undefined) {
  const installed = reference === undefined ? null : await inProject(reference);
  const homeRecord = installed ? null : home?.installation(install_id);
  const manifest = installed ? installed.record.plugin_id === plugin_id ? installed.manifest : undefined
    : homeRecord?.install_id === install_id && homeRecord.plugin_id === plugin_id ? home?.manifest(plugin_id) : undefined;
  return manifest ? manifest.connections?.slots ?? [] : null;
}

export function pluginInstallationsFor(manifest: PluginManifest, context: PluginStartContext, projectId: string | null,
  source: PluginInstallationClient | undefined, assertActive: () => void): PluginInstallationClient | undefined {
  if (!source || !manifest.permissions.some(item => item.permission === PLUGINS_READ_PERMISSION)) return undefined;
  const check = () => {
    assertActive(); context.requireGrant(PLUGINS_READ_PERMISSION);
    const scope = currentPluginInvocation();
    assertCapturedPluginActionCurrent(scope, context);
    if (scope && scope.caller.project_id !== projectId) throw new ActionError("actions.forbidden", "安装查询不属于这个项目");
  };
  return Object.freeze({ list: () => { check(); return source.list(); }, get: (id: string) => { check(); return source.get(id); } });
}
