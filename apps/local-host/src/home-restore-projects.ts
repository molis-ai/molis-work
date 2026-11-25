import { projectReplicationTriggers } from "./project-replication-triggers.js";
import { projectPluginPlatformExtension } from "./project-plugin-databases.js";
import { join, relative, sep } from "node:path";
import { PLATFORM_PLUGIN_REGISTRATIONS, BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { ProjectsModule, listProjectRoots, matchesPartitionPattern, PARTITION_PATTERN, partitionDatabasePath, partitionOfRelativePath, PERSONAL_SPACE_DIRECTORY } from "@molis-ai/molis-work-module-projects";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
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
/**
 * The personal space's main database (`personal-space/molis-work.db`) gets the same check as a project's: one root, its own id, and only the
 * registered plugins' tables. Its store is not `projects`, so the caller asks here; `null` for any other file of the store.
 */
export function restorePersonalSpaceDatabase(storePath: string, relativePath: string): string | null {
  return storePath === PERSONAL_SPACE_DIRECTORY && relativePath === "molis-work.db" ? PERSONAL_SPACE_PROJECT_ID : null;
}

export function inspectRestoreProjectDatabase(db: SqliteDatabase, file: string, projectId: string): Readonly<Record<string, string | number>> {
  const roots = listProjectRoots(db);
  if (roots.length !== 1 || roots[0]!.project_id !== projectId) throw invalidRestore();
  const records = inspectPluginProjectDatabaseSet(db, {
    manifests: PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest),
    platformTables: platformTables(), platformTriggers: projectReplicationTriggers(db), platformExtension: projectPluginPlatformExtension,
  }, inspector, file);
  return Object.fromEntries(records.flatMap(entry => [
    ["plugin:" + entry.plugin_id, entry.version], ["store:" + entry.plugin_id, entry.store_name], ["publisher:" + entry.plugin_id, entry.publisher_signature],
  ]));
}

/** Catalog identities are absolute references to this original Home, never destinations chosen by manifest text. */
export function inspectRestoreProjectReferences(db: SqliteDatabase, home: string, incomingPaths: ReadonlySet<string>): ReadonlySet<string> {
  const projects = new ProjectsModule({ db, projects_directory: join(home, "projects"), outputs_directory: join(home, "outputs"), plugins: BUILTIN_PLUGIN_REGISTRY }).query.listPartitions();
  const ids = new Set<string>();
  for (const project of projects) {
    const id = project.project_id;
    if (typeof id !== "string" || !id.length || id.includes("/") || id.includes("\\") || id === "." || id === ".." || ids.has(id)) throw invalidRestore();
    const file = relative(home, partitionDatabasePath(home, id)).split(sep).join("/");
    if (!incomingPaths.has(file)) throw invalidRestore();
    ids.add(id);
  }
  for (const file of incomingPaths) {
    const partition = matchesPartitionPattern(`${PARTITION_PATTERN}/molis-work.db`, file) ? partitionOfRelativePath(file) : null;
    if (partition !== null && !ids.has(partition)) throw invalidRestore();
  }
  return ids;
}
