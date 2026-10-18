import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { qualifyBuiltinPluginCaller } from "./builtin-plugin-callers.js";
import type { PluginDatabaseDeclaration, PluginFilesDeclaration, PluginDefinition, PluginManifest, PluginModelConfigurationDeclaration, PluginImageGenerationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginProjectCleanup } from "./plugin-project-cleanup.js";

/** Only the Host's actual definition objects may inherit a bundled provider or a declared library. */
export function pluginEntryIdentity() {
  const bundled = new WeakSet<PluginDefinition>();
  const bundledManifests = new WeakSet<PluginManifest>();
  const databases = new WeakMap<PluginDefinition, PluginDatabaseDeclaration>();
  const files = new WeakMap<PluginDefinition, PluginFilesDeclaration>();
  const configurations = new WeakMap<PluginDefinition, PluginModelConfigurationDeclaration>();
  const images = new WeakMap<PluginDefinition, PluginImageGenerationDeclaration>();
  const projectData = new WeakMap<PluginDefinition, PluginProjectCleanup>();
  return {
    providerFor: (definition: PluginDefinition, installId: string) => bundled.has(definition) ? definition.manifest.plugin_id : installId,
    qualifyCaller: (definition: PluginDefinition, caller: HostPluginCaller) => bundled.has(definition) ? qualifyBuiltinPluginCaller(caller) : undefined,
    databaseFor: (definition: PluginDefinition) => databases.get(definition),
    filesFor: (definition: PluginDefinition) => files.get(definition),
    modelConfigurationFor: (definition: PluginDefinition) => configurations.get(definition),
    imageGenerationFor: (definition: PluginDefinition) => images.get(definition),
    projectDataFor: (definition: PluginDefinition) => projectData.get(definition),
    /** Whether this Manifest object is the one a bundled definition on the Host's start list carries. */
    shipsWithHost: (manifest: PluginManifest | undefined) => manifest !== undefined && bundledManifests.has(manifest),
    remember(entries: readonly { definition: PluginDefinition; bundled?: boolean; database?: PluginDatabaseDeclaration; files?: PluginFilesDeclaration;
      model_configuration?: PluginModelConfigurationDeclaration; image_generation?: PluginImageGenerationDeclaration; project_data?: PluginProjectCleanup }[]) {
      for (const entry of entries) {
        if (entry.bundled) { bundled.add(entry.definition); bundledManifests.add(entry.definition.manifest); }
        if (entry.database) databases.set(entry.definition, entry.database);
        if (entry.files) files.set(entry.definition, Object.freeze({ ...entry.files }));
        const config = entry.model_configuration;
        if (config) configurations.set(entry.definition, Object.freeze({
          preference: Object.freeze({ ...config.preference }), custom_provider: Object.freeze({ ...config.custom_provider }),
          actions: Object.freeze({ read: Object.freeze({ ...config.actions.read }), save: Object.freeze({ ...config.actions.save }) }),
        }));
        if (entry.image_generation) images.set(entry.definition, Object.freeze({ ...entry.image_generation }));
        if (entry.project_data) projectData.set(entry.definition, Object.freeze({ owner_id: entry.project_data.owner_id,
          declaration: Object.freeze({ ...entry.project_data.declaration }) }));
      }
    },
  };
}
