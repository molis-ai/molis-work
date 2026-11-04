import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginManifestDigest } from "./identity.js";
import { inspectPluginProjectDatabase, listPluginProjectDatabases, pluginProjectDatabaseErrors, type PluginProjectDatabaseRecord, type PluginProjectSchemaInspector } from "./project-database.js";
import { readPluginRuntimeRecords, type PluginRuntimeDatabase } from "./repository.js";
import { readPluginReleaseManifest } from "./release-artifacts.js";

const fold = (name: string) => name.replace(/[A-Z]/gu, letter => letter.toLowerCase());

function installedManifest(connection: PluginRuntimeDatabase, entry: PluginProjectDatabaseRecord): PluginManifest {
  const records = readPluginRuntimeRecords(connection).filter(row => row.plugin_id === entry.plugin_id);
  if (records.length !== 1) throw pluginProjectDatabaseErrors.shape_mismatch("归档项目插件缺少唯一的原安装记录，不能以账本自述代替现行声明");
  const instance = records[0]!;
  if (instance.publisher_signature !== entry.publisher_signature || typeof instance.version !== "string" || typeof instance.manifest_digest !== "string") {
    throw pluginProjectDatabaseErrors.publisher_mismatch("归档项目插件的安装身份与库 owner 不一致");
  }
  const original = readPluginReleaseManifest(connection, instance);
  if (!original) throw pluginProjectDatabaseErrors.shape_mismatch("归档项目插件缺少原安装对应的发行声明，未运行或重建任何插件");
  const manifest = parsePluginManifest(original);
  if (manifest.plugin_id !== instance.plugin_id || manifest.publisher.signature !== instance.publisher_signature || manifest.version !== instance.version
    || pluginManifestDigest(manifest) !== instance.manifest_digest) throw pluginProjectDatabaseErrors.shape_mismatch("归档项目插件的发行声明身份不符");
  return manifest;
}

/** All recorded plugin tables use current declarations; unknown tables or executable SQLite objects are refused. */
export function inspectPluginProjectDatabaseSet(connection: PluginRuntimeDatabase,
  options: { readonly manifests: readonly PluginManifest[]; readonly platformTables: readonly string[] },
  inspector: PluginProjectSchemaInspector, path: string): readonly PluginProjectDatabaseRecord[] {
  const records = listPluginProjectDatabases(connection), declared = new Map(options.manifests.map(manifest => [manifest.plugin_id, manifest]));
  const allowed = new Set(options.platformTables.map(fold));
  for (const entry of records) {
    const manifest = declared.get(entry.plugin_id) ?? installedManifest(connection, entry), declaration = manifest.databases?.project;
    if (!declaration) throw pluginProjectDatabaseErrors.shape_mismatch(`归档插件 ${entry.plugin_id} 的现行 Manifest 没有项目库声明`);
    inspectPluginProjectDatabase(connection, { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration }, inspector, path);
    for (const name of entry.objects) allowed.add(fold(name));
  }
  for (const object of inspector.objects(connection)) {
    if (object.type !== "table" && object.type !== "index" || !allowed.has(fold(object.table))) {
      throw pluginProjectDatabaseErrors.shape_mismatch("归档项目库含未由平台基线或插件现行声明拥有的表、视图或触发器");
    }
  }
  return records;
}
