import path from "node:path";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginInstanceRecord, PluginLifecycleState } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { alwaysOnAgreed, consentSubject, pluginManifestDigest, SqlitePluginConsentLedger, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { openHomePluginStore } from "./home-plugin-store.js";

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
 * The 常开 plugins of this Home, as the catalog names them. The Host agrees for the plugins of its own build the first time it is asked
 * (the same row the plugin's first start would write; one a person has revoked stays revoked), so a Home with no Host started yet
 * answers the way a started one does.
 */
export function alwaysOnCatalogEntries(home: string, catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): PluginRegistration[] {
  const declared = catalog.filter(entry => entry.manifest.always_on === true);
  if (declared.length === 0) return [];
  const { db } = openHomePluginStore(path.resolve(home));
  try {
    const ledger = new SqlitePluginConsentLedger(db);
    const records = new SqlitePluginRuntimeRepository(db).list();
    return declared.filter(entry => {
      const { plugin_id: pluginId, publisher: { signature } } = entry.manifest;
      if (!ledger.consents(pluginId).some(row => row.kind === "always_on" && row.publisher_signature === signature)) {
        ledger.record({ plugin_id: pluginId, publisher_signature: signature, manifest_digest: pluginManifestDigest(entry.manifest), granted_by: "host_build",
          grants: [{ kind: "always_on", subject: consentSubject.alwaysOn() }], at: new Date().toISOString() });
      }
      return alwaysOnAgreed(ledger, pluginId, signature) && installedAndOn(records, entry);
    });
  } finally { db.close(); }
}

/** The keys the projects of this Home use for their 常开 plugins (`ProjectPluginRegistry.alwaysOn`). */
export const alwaysOnProjectPlugins = (home: string): ProjectPluginId[] => alwaysOnCatalogEntries(home).map(entry => entry.project_plugin_id);
