import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openPluginProjectDatabase, type PluginProjectDatabaseRecord, type PluginProjectSchemaInspector, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";

// Plugins' own tables in a project's library (PG-020, specs/plugin-project-database L1b). When the Host opens a library, every
// built-in project plugin whose Manifest declares `databases.project` gets its tables there through the platform's one open
// function: made and recorded the first time, checked against the ledger after. A refusal (another publisher, another version, a
// changed shape) stops only that plugin: the library and the other plugins open as usual, and the plugin's own paths throw the
// refusal before they touch its tables. Plugins installed into a project get theirs with the service (L2).

export type ProjectPluginDatabaseOutcome =
  | { readonly plugin_id: string; readonly record: PluginProjectDatabaseRecord }
  | { readonly plugin_id: string; readonly error: Error };

/** What the Host lends the open function: an empty in-memory database on the same SQLite as the library, and storage's descriptions. */
const inspector: PluginProjectSchemaInspector = {
  scratch: () => new LocalSqliteStorage(":memory:").db,
  objects: db => listSqliteObjects(db),
  shape: db => describeSqliteSchema(db),
};

const outcomes = new WeakMap<object, ReadonlyMap<string, ProjectPluginDatabaseOutcome>>();

/** The built-in project plugins that declare tables in the project's library, from the one catalog, in its order. */
export function projectDatabasePlugins(): PluginManifest[] {
  return BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope !== "home" && entry.manifest.databases?.project).map(entry => entry.manifest);
}

/** Open each plugin's tables in the library at `path`; what happened to each is kept with the connection. */
export function openProjectPluginDatabases(db: PluginRuntimeDatabase, path: string,
  manifests: readonly PluginManifest[] = projectDatabasePlugins()): ReadonlyMap<string, ProjectPluginDatabaseOutcome> {
  const opened = new Map<string, ProjectPluginDatabaseOutcome>();
  for (const manifest of manifests) {
    const declaration = manifest.databases?.project;
    if (!declaration) continue;
    const owner = { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration };
    try {
      opened.set(manifest.plugin_id, { plugin_id: manifest.plugin_id, record: openPluginProjectDatabase(db, owner, inspector, { path }).record });
    } catch (error) {
      hostLog.warn("project_database", "plugin_database_refused", error, { plugin_id: manifest.plugin_id });
      opened.set(manifest.plugin_id, { plugin_id: manifest.plugin_id, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
  outcomes.set(db, opened);
  return opened;
}

/** The refusal recorded for this plugin when the library opened, if any. */
export function projectPluginDatabaseRefusal(db: object, pluginId: string): Error | null {
  const outcome = outcomes.get(db)?.get(pluginId);
  return outcome && "error" in outcome ? outcome.error : null;
}

/** What the Host starts or registers for this library, less whatever belongs to a refused plugin: only that plugin stops. */
export function withoutRefusedPlugins<Entry>(db: object, entries: readonly Entry[], pluginOf: (entry: Entry) => string | undefined): Entry[] {
  return entries.filter(entry => {
    const pluginId = pluginOf(entry);
    return !pluginId || !projectPluginDatabaseRefusal(db, pluginId);
  });
}

/** Before a plugin's Host path touches its tables: throws the refusal recorded when the library opened, so only that plugin stops. */
export function assertProjectPluginDatabase(db: object, pluginId: string): void {
  const refusal = projectPluginDatabaseRefusal(db, pluginId);
  if (refusal) throw refusal;
}
