import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstallationClient, PluginInstanceRecord, PluginManifest, PluginRuntimeRepository, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGINS_READ_PERMISSION } from "./plugin-service-permissions.js";

type ManifestReader = (pluginId: string) => PluginManifest | undefined;
const readers = new WeakMap<object, Set<ManifestReader>>();

/** Platforms sharing one project library contribute names; the Runtime repository remains the installation owner. */
export function openPluginInstallationDirectory(db: PluginRuntimeDatabase, records: PluginRuntimeRepository, manifest: ManifestReader) {
  const sources = readers.get(db) ?? new Set<ManifestReader>(); readers.set(db, sources); sources.add(manifest);
  const releases = new SqlitePluginRuntimeReleaseArtifactRepository(db);
  let active = true;
  const view = (record: PluginInstanceRecord) => {
    let declared: PluginManifest | undefined;
    for (const read of sources) { const candidate = read(record.plugin_id); if (candidate?.version === record.version) { declared = candidate; break; } }
    declared ??= releases.get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest)?.manifest;
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
