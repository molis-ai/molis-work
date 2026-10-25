import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { CHARACTERS_HOME_STORE } from "@molis-ai/molis-work-module-characters";
import { FUNCTIONS_HOME_STORE } from "@molis-ai/molis-work-module-functions";
import { KNOWLEDGE_CARDS_HOME_STORE, MEMORY_LEDGER_HOME_STORE, TEXT_SEARCH_HOME_STORE, homeStoreRegistry, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { AGENT_DEFINITIONS_HOME_STORE } from "./agent-definitions/agent-definitions.js";
import { AGENT_DECLARATIONS_HOME_STORE } from "./agent-definitions/agent-declarations.js";
import { ALCHEMIST_HOME_STORE } from "./alchemist-paths.js";
import { ASSISTANT_HOME_STORE } from "./assistant/assistant-store.js";
import { CONNECTOR_TOOLS_HOME_STORE } from "./connector-tool-download.js";
import { CONNECTORS_HOME_STORE } from "./connectors-store.js";
import { CONTEXT_ONBOARDING_HOME_STORE } from "./context-onboarding-store.js";
import { HOME_PLUGIN_RUNTIME_HOME_STORE } from "./home-plugin-store.js";
import { INSTALLED_LIBRARIES_HOME_STORE, installedLibrarySnapshots } from "./installed-plugin-libraries.js";
import { ORIGINAL_FILES_HOME_STORE } from "./material-original-files.js";
import { DIRECTORY_GRANTS_HOME_STORE } from "./plugin-directory-store.js";
import { DISCUSSION_HOME_STORE } from "./im-server.js";
import { PLACEMENT_HOME_STORE } from "./placement-actions.js";
import { ordinarySnapshot, omittedSnapshot, projectSnapshot, agentSnapshot, feedSnapshot, managedToolsSnapshot, alchemistSnapshot, builderSnapshot,
  browserSnapshot, directoryAccessSnapshot, runtimeBackupSnapshot, excluded, type HomeStoreSnapshotPolicy, type HomeSnapshotStore, type HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";

type Declaration = HomeStoreDeclaration & { readonly snapshot?: HomeStoreSnapshotPolicy };
const owned = (owner: string, ...stores: readonly Declaration[]): HomeSnapshotStore[] => stores.map(store => ({ ...store, owner, snapshot: store.snapshot ?? ordinarySnapshot }));
const at = (...paths: string[]): HomeStoreDeclaration[] => paths.map(path => ({ path }));

/**
 * Every store of a Home (W4-11, docs/system/HOME-DATA.md): the Host's own, those of the modules and services it composes,
 * and the shipped plugins' (each declared by its plugin and carried by its catalog entry, and the library its Manifest
 * declares, `databases.home`). `uninstall --purge-user-data` removes all of them (decision #20); a plugin may be given a library only if the
 * library is registered here as its own. Built on first use: the stores are declared in modules that may import this one.
 */
export function homeStores(homeDirectory?: string): HomeSnapshotStoreRegistry {
  const registered = registry ??= Object.assign(homeStoreRegistry([
    ...owned("apps/local-host", { path: "projects", snapshot: projectSnapshot }, { path: "logs", snapshot: omittedSnapshot("Diagnostic logs") }),
    // SC-4: no business reader; only the leased offline backup consumes this literal metadata, and purge keeps its directory.
    ...owned("apps/local-host", { path: "sessions", snapshot: { retained: {
      database: { file: "sessions.db", metadata: { table: "session_meta", owner: "molis-work-session-registry-v1", version: 7 } },
      content: { directory: "content/blobs", dependency: "content/content.key" },
    } } }),
    ...owned("apps/local-host/src/installer", { path: "backups", snapshot: { emptyOnly: true } }),
    ...owned("apps/local-host", HOME_PLUGIN_RUNTIME_HOME_STORE, INSTALLED_LIBRARIES_HOME_STORE, ASSISTANT_HOME_STORE, PLACEMENT_HOME_STORE, AGENT_DEFINITIONS_HOME_STORE, AGENT_DECLARATIONS_HOME_STORE,
      CONNECTORS_HOME_STORE, { ...CONNECTOR_TOOLS_HOME_STORE, snapshot: managedToolsSnapshot }, CONTEXT_ONBOARDING_HOME_STORE,
      { ...ALCHEMIST_HOME_STORE, snapshot: alchemistSnapshot }, ORIGINAL_FILES_HOME_STORE, DIRECTORY_GRANTS_HOME_STORE),
    ...owned("modules/functions", FUNCTIONS_HOME_STORE),
    ...owned("modules/characters", CHARACTERS_HOME_STORE),
    ...owned("packages/storage", MEMORY_LEDGER_HOME_STORE, { ...TEXT_SEARCH_HOME_STORE, snapshot: omittedSnapshot("Rebuildable full-text index") },
      KNOWLEDGE_CARDS_HOME_STORE, { path: "feed", snapshot: feedSnapshot }),
    ...owned("server", DISCUSSION_HOME_STORE),
    ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
      const library = entry.manifest.databases?.home;
      const storeName = entry.home_store?.path ?? library?.store_name;
      const snapshot: HomeStoreSnapshotPolicy = storeName === "images" ? {
        entry: (_home, file) => /^runners(?:\/|$)/u.test(file) ? excluded("Image runner ownership locks") : { kind: "keep" },
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
      { path: "cache", snapshot: omittedSnapshot("Rebuildable cache") }, ...at("plugin-files", "git-operation-details.json", "config/onboarding.json",
      "config/project-arrival.json", "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json")),
    ...owned("apps/desktop", { path: "directory-access", snapshot: directoryAccessSnapshot }),
  ]), { snapshotExclusions: [
    { path: "bin", reason: "Reinstallable launchers" }, { path: "releases", reason: "Reinstallable application releases" },
    { path: "config/installation.json", reason: "Installation receipt belongs to this running installation" },
    { path: "config/web-control-token", reason: "Host control token is regenerated; never exported" },
    { path: "config/web-service.json", reason: "Machine service receipt" }, { path: "config/uninstall.json", reason: "Uninstall progress receipt" },
  ] });
  if (homeDirectory === undefined) return registered;
  return Object.assign(homeStoreRegistry([...registered.stores, ...installedLibrarySnapshots(homeDirectory, registered).map(row => ({
    path: row.store_name, owner: row.plugin_id,
    snapshot: { database: (file: string) => file === row.store_name + ".db" ? { version: row.version,
      inspect: () => ({ publisher_signature: row.publisher_signature, declaration_sha256: row.schema_digest }) } : undefined },
  }))]), { snapshotExclusions: registered.snapshotExclusions });
}
let registry: HomeSnapshotStoreRegistry | undefined;
