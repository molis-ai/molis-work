import { join } from "node:path";
import { readStorageSpace } from "@molis-ai/molis-work-storage";
import { installedSnapshotOptions } from "./installed-library-snapshot.js";
import { NATIVE_SESSION_FILE } from "./personal-native-session.js";
import { pluginSyncDatabaseDeclaration } from './plugin-sync-database.js';
import { ARTIFACTS_HOME_STORE } from "@molis-ai/molis-work-module-artifacts";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { CHARACTERS_HOME_STORE } from "@molis-ai/molis-work-module-characters";
import { FUNCTIONS_HOME_STORE } from "@molis-ai/molis-work-module-judgment-rules";
import { KNOWLEDGE_CARDS_HOME_STORE, MEMORY_LEDGER_HOME_STORE, TEXT_SEARCH_HOME_STORE, homeStoreRegistry, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { AGENT_DEFINITIONS_HOME_STORE } from "./agent-definitions/agent-definitions.js";
import { AGENT_DECLARATIONS_HOME_STORE } from "./agent-definitions/agent-declarations.js";
import { ALCHEMIST_HOME_STORE } from "./alchemist-paths.js";
import { UPGRADE_DIRECTORY } from "./home-upgrade-ledger.js";
import { ASSISTANT_HOME_STORE } from "./assistant/assistant-store.js";
import { CONNECTOR_TOOLS_HOME_STORE } from "./connector-tool-download.js";
import { CONNECTORS_HOME_STORE } from "./connectors-store.js";
import { CONTEXT_ONBOARDING_HOME_STORE } from "./context-onboarding-store.js";
import { HOME_PLUGIN_RUNTIME_HOME_STORE } from "./home-plugin-store.js";
import { INSTALLED_LIBRARIES_HOME_STORE, installedLibrarySnapshots, installedLibrarySnapshotsFile } from "./installed-plugin-libraries.js";
import { lstatSync } from "node:fs";
import { inspectSnapshotSqlite } from "@molis-ai/molis-work-storage";
import { ORIGINAL_FILES_HOME_STORE } from "./material-original-files.js";
import { DIRECTORY_GRANTS_HOME_STORE } from "./plugin-directory-store.js";
import { DISCUSSION_HOME_STORE } from "./im-server.js";
import { PLACEMENT_HOME_STORE } from "./placement-actions.js";
import { ordinarySnapshot, omittedSnapshot, projectSnapshot, agentSnapshot, feedSnapshot, managedToolsSnapshot, alchemistSnapshot, builderSnapshot,
  browserSnapshot, directoryAccessSnapshot, runtimeBackupSnapshot, excluded, type HomeStoreSnapshotPolicy, type HomeSnapshotStore, type HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";

type Declaration = HomeStoreDeclaration & { readonly snapshot?: HomeStoreSnapshotPolicy };
const owned = (owner: string, ...stores: readonly Declaration[]): HomeSnapshotStore[] => stores.map(store => ({ ...store, owner, snapshot: store.snapshot ?? ordinarySnapshot }));
const at = (...paths: string[]): HomeStoreDeclaration[] => paths.map(path => ({ path }));

import {SYNC_HOME_STORE} from '@molis-ai/molis-work-module-sync-replication';

/**
 * Every store of a Home (W4-11, docs/system/HOME-DATA.md): the Host's own, those of the modules and services it composes,
 * and the shipped plugins' (each declared by its plugin and carried by its catalog entry, and the library its Manifest
 * declares, `databases.home`). `uninstall --purge-user-data` removes all of them (decision #20); a plugin may be given a library only if the
 * library is registered here as its own. Built on first use: the stores are declared in modules that may import this one.
 */
/** Where the plugins this build ships keep their model choice (`model_configuration.preference`), for the upgrade process. */
export const platformModelPreferences = (): readonly { readonly owner: string; readonly path: string }[] => PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }) => {
  const preference = manifest.model_configuration?.preference;
  return preference ? [{ owner: manifest.plugin_id, path: join(preference.store_name, preference.file_name) }] : [];
});

export function homeStores(homeDirectory?: string): HomeSnapshotStoreRegistry {
  const registered = registry ??= Object.assign(homeStoreRegistry([
    ...owned("apps/local-host", { path: "projects", snapshot: projectSnapshot }, { path: "logs", snapshot: omittedSnapshot("Diagnostic logs", "preserve") }),
    // Each project's default output directory, `outputs/<project_id>/` (specs/shared-sources-and-surfaces §3): the person's own files, made
    // the first time something writes or runs there. A snapshot carries none of it and a restore leaves it as it is (SSC-23); purge clears it.
    ...owned("modules/projects", { path: "outputs", snapshot: omittedSnapshot("Files in each project's default output directory stay where they are", "preserve") }),
    ...owned("apps/local-host", { path: UPGRADE_DIRECTORY, snapshot: omittedSnapshot("Upgrade snapshots and progress", "reset") }),
    ...owned("apps/local-host",
      { path: "spaces", snapshot: omittedSnapshot("Each account space has its own Home and storage authority", "preserve") },
      { path: "storage-space.json", snapshot: omittedSnapshot("The original Home owns its immutable space identity", "preserve") },
      { path: "plugin-packages", snapshot: omittedSnapshot("Verified installed software stays with its original Home", "preserve") },
      { path: NATIVE_SESSION_FILE, snapshot: omittedSnapshot("The native account bridge credential belongs to this Home", "preserve") }),
    ...owned("modules/sync-replication", { ...SYNC_HOME_STORE, snapshot: omittedSnapshot("Device consent, transfer queues and cursors belong to this Home", "preserve") }),
    ...owned("apps/local-host/src/installer", { path: "backups", snapshot: { emptyOnly: true } }),
    ...owned("apps/local-host", HOME_PLUGIN_RUNTIME_HOME_STORE, INSTALLED_LIBRARIES_HOME_STORE, ASSISTANT_HOME_STORE, PLACEMENT_HOME_STORE, AGENT_DEFINITIONS_HOME_STORE, AGENT_DECLARATIONS_HOME_STORE,
      CONNECTORS_HOME_STORE, { ...CONNECTOR_TOOLS_HOME_STORE, snapshot: managedToolsSnapshot }, CONTEXT_ONBOARDING_HOME_STORE,
      { ...ALCHEMIST_HOME_STORE, snapshot: alchemistSnapshot }, ORIGINAL_FILES_HOME_STORE, DIRECTORY_GRANTS_HOME_STORE),
    ...owned("modules/functions", FUNCTIONS_HOME_STORE),
    ...owned("modules/artifacts", ARTIFACTS_HOME_STORE),
    ...owned("modules/characters", CHARACTERS_HOME_STORE),
    ...owned("packages/storage", MEMORY_LEDGER_HOME_STORE, { ...TEXT_SEARCH_HOME_STORE, snapshot: omittedSnapshot("Rebuildable full-text index", "reset") },
      KNOWLEDGE_CARDS_HOME_STORE, { path: "feed", snapshot: feedSnapshot }),
    ...owned("server", DISCUSSION_HOME_STORE),
    ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
      const declared = entry.manifest.databases?.home;
      const library = declared && pluginSyncDatabaseDeclaration(entry.manifest, declared);
      const storeName = entry.home_store?.path ?? library?.store_name;
      const snapshot: HomeStoreSnapshotPolicy = storeName === "images" ? {
        entry: (_home, file) => /^runners(?:\/|$)/u.test(file) ? excluded("Image runner ownership locks", "preserve") : { kind: "keep" },
      } : storeName === "lingguang" ? {
        entry: (_home, file) => /^models(?:\/|$)/u.test(file) ? excluded("Re-downloadable transcription model cache") : { kind: "keep" },
      } : ordinarySnapshot;
      return [
        ...entry.home_store ? [{ ...entry.home_store, owner: entry.manifest.plugin_id, snapshot }] : [],
        ...library ? [{ path: library.store_name, owner: entry.manifest.plugin_id, snapshot,
          library: { baseline: { version: library.version, schema: library.schema }, ...library.partition ? { partition: library.partition } : {} } }] : [],
      ];
    }),
    ...owned("horizontal/agent-host", { path: "agent-runtime", snapshot: agentSnapshot }),
    ...owned("apps/local-host/src/installer", { path: "runtime-config-backups", snapshot: runtimeBackupSnapshot }, ...at("runtime-integrations", "runtime-integration-attempts")),
    ...owned("apps/local-host", { path: "browser", snapshot: browserSnapshot }, { path: "plugin-builder", snapshot: builderSnapshot },
      { path: "cache", snapshot: omittedSnapshot("Rebuildable cache", "reset") }, ...at("computer", "plugin-files", "git-operation-details.json", "config/onboarding.json",
      "config/project-arrival.json", "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json", "config/external-mcp-actions.json", "config/connector-mcp-actions.json", "config/plugin-publisher.json")),
    ...owned("apps/desktop", { path: "directory-access", snapshot: directoryAccessSnapshot }),
  ]), { snapshotExclusions: [
    { path: "bin", reason: "Reinstallable launchers" }, { path: "releases", reason: "Reinstallable application releases" },
    { path: "config/installation.json", reason: "Installation receipt belongs to this running installation" },
    { path: "config/web-control-token", reason: "Host control token is regenerated; never exported" },
    { path: "config/web-service.json", reason: "Machine service receipt" }, { path: "config/uninstall.json", reason: "Uninstall progress receipt" },
  ] });
  if (homeDirectory === undefined) return registered;
  return extendLibraryRegistry(homeDirectory, registered, installedLibrarySnapshots(homeDirectory, registered));
}

export function homeStoresFromLibraryLedger(file: string, home: string): HomeSnapshotStoreRegistry {
  const registered = homeStores();
  if (lstatSync(file, { throwIfNoEntry: false })) inspectSnapshotSqlite(file, { baseline: INSTALLED_LIBRARIES_HOME_STORE.library!.baseline, requireSpace: true, space: readStorageSpace(home) ?? undefined });
  return extendLibraryRegistry(home, registered, installedLibrarySnapshotsFile(file, registered, home));
}

function extendLibraryRegistry(home:string, registered: HomeSnapshotStoreRegistry, snapshots: ReturnType<typeof installedLibrarySnapshots>): HomeSnapshotStoreRegistry {
  return Object.assign(homeStoreRegistry([...registered.stores, ...snapshots.map(row => ({
    path: row.store_name, owner: row.plugin_id,
    snapshot: { database: (file: string) => file === row.store_name + ".db" ? installedSnapshotOptions(home,row) : undefined },
  }))]), { snapshotExclusions: registered.snapshotExclusions });
}
let registry: HomeSnapshotStoreRegistry | undefined;
