import { PLATFORM_PLUGIN_REGISTRATIONS, runsInHome } from "./plugin-registry.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openPluginProjectDatabase, type PluginProjectDatabaseRecord, type PluginProjectSchemaInspector, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";

// Plugins' own tables in a project's library (PG-020, specs/plugin-project-database L1b). When the Host opens a library, every
// built-in project plugin whose Manifest declares `databases.project` gets its tables there through the platform's one open
// function: made and recorded the first time, checked against the ledger after. A refusal (another publisher, another version, a
// changed shape) stops only that plugin: the library and the other plugins open as usual, and the plugin's own paths throw the
// refusal before they touch its tables. Any plugin the platform starts with `services.project_database` has its tables opened
// again when it starts (`openPluginTables`), so a plugin installed into a project gets them then.

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

/** The built-in project plugins that declare tables in the project's library, from the one catalog, in its order. A dual-instance plugin's Home entry is also its project half. */
function projectDatabasePlugins(): PluginManifest[] {
  return PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => (!runsInHome(entry) || entry.runtime?.dual_instance === true) && entry.manifest.databases?.project).map(entry => entry.manifest);
}

/** Open one plugin's tables in the library at `path` (made and recorded the first time), or throw its refusal. */
export function openPluginTables(db: PluginRuntimeDatabase, path: string, manifest: PluginManifest): PluginProjectDatabaseRecord {
  const declaration = manifest.databases?.project;
  if (!declaration) throw new Error(`插件 ${manifest.plugin_id} 的 Manifest 没有声明项目库`);
  return openPluginProjectDatabase(db, { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration }, inspector, { path }).record;
}

/** Open each plugin's tables in the library at `path`; what happened to each is kept with the connection. */
export function openProjectPluginDatabases(db: PluginRuntimeDatabase, path: string,
  manifests: readonly PluginManifest[] = projectDatabasePlugins(),
  open: typeof openPluginTables = openPluginTables): ReadonlyMap<string, ProjectPluginDatabaseOutcome> {
  const opened = new Map<string, ProjectPluginDatabaseOutcome>();
  for (const manifest of manifests) {
    if (!manifest.databases?.project) continue;
    for (let attempt = 1; ; attempt += 1) {
      try {
        opened.set(manifest.plugin_id, { plugin_id: manifest.plugin_id, record: open(db, path, manifest) });
        break;
      } catch (error) {
        // SQLITE_BUSY/LOCKED while another writer holds the library is not the declaration's answer: try again a bounded
        // number of times before surfacing it, so a moment of contention does not refuse a plugin or hide the error.
        if (attempt < 3 && isTransientProjectDatabaseError(error)) continue;
        if (!isProjectPluginDatabaseRefusal(error)) {
          hostLog.error("project_database", "plugin_database_failed", error, { plugin_id: manifest.plugin_id });
          throw error;
        }
        hostLog.warn("project_database", "plugin_database_refused", error, { plugin_id: manifest.plugin_id });
        opened.set(manifest.plugin_id, { plugin_id: manifest.plugin_id, error });
        break;
      }
    }
  }
  outcomes.set(db, opened);
  return opened;
}

// The platform's one open function names its own refusals `plugin.project_database.<reason>`; everything else (SQLITE_BUSY while
// another writer holds the library, a broken connection) is not a refusal: it must surface as an error, never be recorded as one.
const PROJECT_DATABASE_REFUSAL_PREFIX = "plugin.project_database.";

/** Whether this is the declaration's own refusal, the only kind that stops one plugin and lets the library open. */
export function isProjectPluginDatabaseRefusal(error: unknown): error is ActionError {
  return error instanceof ActionError && error.code.startsWith(PROJECT_DATABASE_REFUSAL_PREFIX);
}

/** Whether SQLite asked us to try again later (another writer, a lock), rather than answering the declaration. */
const TRANSIENT_DATABASE_ERROR = /SQLITE_BUSY|SQLITE_LOCKED|database (?:table )?is locked/i;
export function isTransientProjectDatabaseError(error: unknown): boolean {
  return error instanceof Error && TRANSIENT_DATABASE_ERROR.test(error.message);
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
