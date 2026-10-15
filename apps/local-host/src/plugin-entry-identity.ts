import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { qualifyBuiltinPluginCaller } from "./builtin-plugin-callers.js";
import type { PluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Only the Host's actual definition objects may inherit a bundled provider or a declared library. */
export function pluginEntryIdentity() {
  const bundled = new WeakSet<PluginDefinition>();
  const databases = new WeakMap<PluginDefinition, PluginDatabaseDeclaration>();
  return {
    providerFor: (definition: PluginDefinition, installId: string) => bundled.has(definition) ? definition.manifest.plugin_id : installId,
    qualifyCaller: (definition: PluginDefinition, caller: HostPluginCaller) => bundled.has(definition) ? qualifyBuiltinPluginCaller(caller) : undefined,
    databaseFor: (definition: PluginDefinition) => databases.get(definition),
    remember(entries: readonly { definition: PluginDefinition; bundled?: boolean; database?: PluginDatabaseDeclaration }[]) {
      for (const entry of entries) {
        if (entry.bundled) bundled.add(entry.definition);
        if (entry.database) databases.set(entry.definition, entry.database);
      }
    },
  };
}
