import { join } from "node:path";
import { PLATFORM_PLUGIN_REGISTRATIONS, BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { ProjectsModule, projectDatabasePath, listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { inspectPluginProjectDatabaseSet, type PluginProjectSchemaInspector } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { invalidRestore } from "./home-restore-input.js";

const inspector: PluginProjectSchemaInspector = {
  scratch: () => new LocalSqliteStorage(":memory:").db,
  objects: db => listSqliteObjects(db), shape: db => describeSqliteSchema(db),
};

function platformTables(): string[] {
  const scratch = inspector.scratch();
  try {
    scratch.exec(PROJECT_DATABASE_BASELINE.schema);
    return inspector.objects(scratch).filter(object => object.type === "table").map(object => object.name);
  } finally { scratch.close(); }
}

/** No project provisioning or Plugin Runtime activation: all readers use the already validated archive connection. */
export function inspectRestoreProjectDatabase(db: SqliteDatabase, file: string, projectId: string): Readonly<Record<string, string | number>> {
  const roots = listProjectRoots(db);
  if (roots.length !== 1 || roots[0]!.project_id !== projectId) throw invalidRestore();
  const records = inspectPluginProjectDatabaseSet(db, {
    manifests: PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest),
    platformTables: platformTables(),
  }, inspector, file);
  return Object.fromEntries(records.flatMap(entry => [
    ["plugin:" + entry.plugin_id, entry.version], ["store:" + entry.plugin_id, entry.store_name], ["publisher:" + entry.plugin_id, entry.publisher_signature],
  ]));
}

/** Catalog identities are absolute references to this original Home, never destinations chosen by manifest text. */
export function inspectRestoreProjectReferences(db: SqliteDatabase, home: string, incomingPaths: ReadonlySet<string>): ReadonlySet<string> {
  const projects = new ProjectsModule({ db, projects_directory: join(home, "projects"), plugins: BUILTIN_PLUGIN_REGISTRY }).query.listProjects();
  const ids = new Set<string>();
  for (const project of projects) {
    const id = project.project_id;
    if (typeof id !== "string" || !id.length || id.includes("/") || id.includes("\\") || id === "." || id === ".." || ids.has(id)) throw invalidRestore();
    const file = "projects/" + id + "/molis-work.db";
    if (projectDatabasePath(join(home, "projects"), id) !== join(home, file) || !incomingPaths.has(file)) throw invalidRestore();
    ids.add(id);
  }
  for (const file of incomingPaths) {
    const match = /^projects\/([^/]+)\/molis-work\.db$/u.exec(file);
    if (match && !ids.has(match[1]!)) throw invalidRestore();
  }
  return ids;
}
