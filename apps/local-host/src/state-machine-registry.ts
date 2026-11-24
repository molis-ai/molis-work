import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { stateMachineActionProvider } from "@molis-ai/molis-work-plugin-runtime";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { loadVerifiedManifest, type PluginDataExportPorts } from "./plugin-data-export.js";
import { isRetiredStudioInstallation } from "./plugin-install-records.js";
import { shippedParts } from "./plugin-registry.js";
import { LocalProjectDatabase } from "./project-database.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";

/**
 * `system.state-machines` for this host. The registry reads the built-in Manifests and, read-only, the Home's installation library plus
 * the named project's; opening them starts nothing. Without a Home the provider stays registered and answers an empty list.
 */
export function stateMachineRegistryProvider(ports?: PluginDataExportPorts): ActionProviderRegistration {
  if (!ports) return stateMachineActionProvider();
  const packages = new SandboxPackageStore(ports.homeDirectory);
  return stateMachineActionProvider({
    builtin: () => shippedParts().map(entry => entry.manifest),
    includes: record => !isRetiredStudioInstallation(record),
    async open(projectId) {
      const project = projectId ? await ports.resolveProject(projectId) : null;
      const home = openReadOnlyHomePluginStore(ports.homeDirectory);
      let projectStore: LocalProjectDatabase | undefined;
      try {
        projectStore = project ? new LocalProjectDatabase(project.storage_key, { existingOnly: true }) : undefined;
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
