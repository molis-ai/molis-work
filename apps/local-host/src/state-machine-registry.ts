import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { partitionDatabasePath, partitionOfDatabasePath } from "@molis-ai/molis-work-module-projects";
import { stateMachineActionProvider } from "@molis-ai/molis-work-plugin-runtime";
import {
  assertSqliteLibraryReady, bindDatabaseSpace, LocalSqliteStorage, readDatabaseSpace, readStorageSpace,
} from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { loadVerifiedManifest, type PluginDataExportPorts } from "./plugin-data-export.js";
import { shippedParts } from "./plugin-registry.js";
import { catalogErrors } from "./project-catalog-contract.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";

/** Open an existing project database strictly read-only without mutating journal mode, space binding, or mtime. */
function openReadOnlyProjectDatabase(databasePath: string): LocalSqliteStorage {
  const partition = partitionOfDatabasePath(path.resolve(databasePath));
  const home = partition && existsSync(path.join(partition.homeDirectory, "storage-space.json")) ? partition.homeDirectory : undefined;
  let target = databasePath;
  if (home && partition) {
    target = partitionDatabasePath(realpathSync(home), partition.partitionId);
    assertSqliteLibraryReady(target);
  }
  const store = new LocalSqliteStorage(target, { readonly: true });
  try {
    if (home) {
      const expected = readStorageSpace(home);
      if (expected && readDatabaseSpace(store.db)) bindDatabaseSpace(store.db, expected);
    }
    const { user_version: version } = store.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version !== PROJECT_DATABASE_BASELINE.version) {
      throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
    }
    return store;
  } catch (error) {
    store.close();
    throw error;
  }
}

/**
 * `system.state-machines` for this host. The registry reads the built-in Manifests and, read-only, the Home's installation library plus
 * the named project's; opening them starts nothing. Without a Home the provider stays registered and answers an empty list.
 */
export function stateMachineRegistryProvider(ports?: PluginDataExportPorts): ActionProviderRegistration {
  if (!ports) return stateMachineActionProvider();
  const packages = new SandboxPackageStore(ports.homeDirectory);
  return stateMachineActionProvider({
    builtin: () => shippedParts().map(entry => entry.manifest),
    async open(projectId) {
      const project = projectId ? await ports.resolveProject(projectId) : null;
      const home = openReadOnlyHomePluginStore(ports.homeDirectory);
      let projectStore: LocalSqliteStorage | undefined;
      try {
        projectStore = project ? openReadOnlyProjectDatabase(project.storage_key) : undefined;
      } catch (error) {
        home?.close();
        throw error;
      }
      return {
        stores: [...(projectStore ? [{ scope: "project" as const, db: projectStore.db }] : []), ...(home ? [{ scope: "home" as const, db: home }] : [])],
        close() {
          projectStore?.close();
          home?.close();
        },
      };
    },
    manifest: (store, record) => loadVerifiedManifest(store.db, packages, record),
  });
}
