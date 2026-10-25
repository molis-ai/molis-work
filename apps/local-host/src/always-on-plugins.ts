import path from "node:path";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginInstanceRecord, PluginLifecycleState } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { alwaysOnAgreed, readPluginRuntimeRecords, SqlitePluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";

// 常开插件 from records (ac-trust T3, specs/repository-anti-corruption/slices/ac-trust-install.md §3.4). A built-in plugin is on in every
// project while its Manifest declares `always_on`, the Home's consent ledger holds a standing agreement for it, and it is installed and on.
// Nothing here is a list of names: the answer is worked out from the catalog's Manifests, the install records and the ledger each time.

/** The states of an installation that is on or will be (a crash is recovered, not a switch-off). */
const ON: ReadonlySet<PluginLifecycleState> = new Set(["installed", "running", "crashed"]);

/**
 * A plugin of the Host's own build is installed by the Host, in the project that starts it or in the Home. Until the Host has installed it
 * here there is no record to read, and the build stands for it; once there is a record, only its state does: switched off, quarantined
 * or uninstalled, it is no longer on.
 */
function installedAndOn(records: readonly PluginInstanceRecord[], entry: PluginRegistration): boolean {
  const own = records.filter(record => record.plugin_id === entry.manifest.plugin_id && record.publisher_signature === entry.manifest.publisher.signature);
  return own.length === 0 || own.some(record => ON.has(record.state));
}

/**
 * The Home plugin store, read-only; undefined while there is none, or while this build refuses it (another version, a schema that is not
 * the baseline). A refused store is left as it is and reported by the Home Runtime itself (W3-06-F-05); until it can be read, the build
 * stands for its plugins as it does before the Host first records them, so a broken Home Runtime does not take Goals out of the projects.
 */
function readableHomePluginStore(home: string) {
  try { return openReadOnlyHomePluginStore(path.resolve(home)); }
  catch (error) {
    if (error instanceof SqliteSchemaVersionError || (error instanceof ActionError && error.code === "actions.execution_failed")) return undefined;
    throw error;
  }
}

/**
 * The 常开 plugins of this Home's own build. Until the Host records a plugin's agreement at startup, the build stands for it without
 * writing anything. An existing row, revoked or not, replaces that default. The catalog here is the Host's build composition, never
 * an installed plugin's claim; no third-party installation receives this default.
 */
export function alwaysOnCatalogEntries(home: string): PluginRegistration[] {
  const declared = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.always_on === true);
  if (declared.length === 0) return [];
  const db = readableHomePluginStore(home);
  if (!db) return declared;
  try {
    const ledger = new SqlitePluginConsentLedger(db);
    const records = readPluginRuntimeRecords(db);
    return declared.filter(entry => {
      const { plugin_id: pluginId, publisher: { signature } } = entry.manifest;
      const recorded = ledger.consents(pluginId).some(row => row.kind === "always_on" && row.publisher_signature === signature);
      return (!recorded || alwaysOnAgreed(ledger, pluginId, signature)) && installedAndOn(records, entry);
    });
  } finally { db.close(); }
}

/** The keys the projects of this Home use for their 常开 plugins (`ProjectPluginRegistry.alwaysOn`). */
export const alwaysOnProjectPlugins = (home: string): ProjectPluginId[] => alwaysOnCatalogEntries(home).map(entry => entry.project_plugin_id);
