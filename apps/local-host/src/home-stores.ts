import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { CHARACTERS_HOME_STORE } from "@molis-ai/molis-work-module-characters";
import { FUNCTIONS_HOME_STORE } from "@molis-ai/molis-work-module-functions";
import { KNOWLEDGE_CARDS_HOME_STORE, MEMORY_LEDGER_HOME_STORE, TEXT_SEARCH_HOME_STORE, homeStoreRegistry, type HomeStore, type HomeStoreDeclaration, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import { AGENT_DEFINITIONS_HOME_STORE } from "./agent-definitions/agent-definitions.js";
import { AGENT_DECLARATIONS_HOME_STORE } from "./agent-definitions/agent-declarations.js";
import { ALCHEMIST_HOME_STORE } from "./alchemist-paths.js";
import { ASSISTANT_HOME_STORE } from "./assistant/assistant-store.js";
import { CONNECTOR_TOOLS_HOME_STORE } from "./connector-tool-download.js";
import { CONNECTORS_HOME_STORE } from "./connectors-store.js";
import { CONTEXT_ONBOARDING_HOME_STORE } from "./context-onboarding-store.js";
import { HOME_PLUGIN_RUNTIME_HOME_STORE } from "./home-plugin-store.js";
import { INSTALLED_LIBRARIES_HOME_STORE } from "./installed-plugin-libraries.js";
import { ORIGINAL_FILES_HOME_STORE } from "./material-original-files.js";
import { DISCUSSION_HOME_STORE } from "./im-server.js";
import { PLACEMENT_HOME_STORE } from "./placement-actions.js";

const owned = (owner: string, ...stores: readonly HomeStoreDeclaration[]): HomeStore[] => stores.map(store => ({ ...store, owner }));
const at = (...paths: string[]): HomeStoreDeclaration[] => paths.map(path => ({ path }));

/**
 * Every store of a Home (W4-11, docs/system/HOME-DATA.md): the Host's own, those of the modules and services it composes,
 * and the shipped plugins' (each declared by its plugin and carried by its catalog entry, and the library its Manifest
 * declares, `databases.home`). `uninstall --purge-user-data` removes all of them (decision #20); a plugin may be given a library only if the
 * library is registered here as its own. Built on first use: the stores are declared in modules that may import this one.
 */
export function homeStores(): HomeStoreRegistry {
  return registry ??= homeStoreRegistry([
    ...owned("apps/local-host", ...at("projects", "logs")),
    // Retired in SC-4 (slices/sc-4-sessions-offline.md §1): no code opens it; backup and `uninstall --purge-user-data` still know the directory.
    ...owned("apps/local-host", ...at("sessions")),
    ...owned("apps/local-host/src/installer", ...at("backups")),
    ...owned("apps/local-host", HOME_PLUGIN_RUNTIME_HOME_STORE, INSTALLED_LIBRARIES_HOME_STORE, ASSISTANT_HOME_STORE, PLACEMENT_HOME_STORE, AGENT_DEFINITIONS_HOME_STORE, AGENT_DECLARATIONS_HOME_STORE,
      CONNECTORS_HOME_STORE, CONNECTOR_TOOLS_HOME_STORE, CONTEXT_ONBOARDING_HOME_STORE, ALCHEMIST_HOME_STORE, ORIGINAL_FILES_HOME_STORE),
    ...owned("modules/functions", FUNCTIONS_HOME_STORE),
    ...owned("modules/characters", CHARACTERS_HOME_STORE),
    ...owned("packages/storage", MEMORY_LEDGER_HOME_STORE, TEXT_SEARCH_HOME_STORE, KNOWLEDGE_CARDS_HOME_STORE, ...at("feed")),
    ...owned("server", DISCUSSION_HOME_STORE),
    ...BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
      const library = entry.manifest.databases?.home;
      return [
        ...entry.home_store ? [{ ...entry.home_store, owner: entry.manifest.plugin_id }] : [],
        ...library ? [{ path: library.store_name, owner: entry.manifest.plugin_id,
          library: { baseline: { version: library.version, schema: library.schema }, ...library.partition ? { partition: library.partition } : {} } }] : [],
      ];
    }),
    ...owned("horizontal/agent-host", ...at("agent-runtime")),
    ...owned("apps/local-host/src/installer", ...at("runtime-config-backups", "runtime-integrations", "runtime-integration-attempts")),
    ...owned("apps/local-host", ...at("browser", "plugin-builder", "plugin-files", "cache", "git-operation-details.json", "config/onboarding.json",
      "config/project-arrival.json", "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json")),
    ...owned("apps/desktop", ...at("directory-access")),
  ]);
}
let registry: HomeStoreRegistry | undefined;
