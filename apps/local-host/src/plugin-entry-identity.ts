import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginModelConfigurationDeclaration, PluginImageGenerationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isHostTrust } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginProjectCleanup } from "./plugin-project-cleanup.js";
import type { PluginOwnerFilesEntry, PluginOwnerFilesBinding } from "./plugin-owner-files-entries.js";

/** Only the Host's actual definition objects may inherit the provider of its own build (`host` trust) or a declared library. */
export function pluginEntryIdentity() {
  const hostBuilt = new WeakSet<PluginDefinition>();
  const listed = new WeakSet<PluginDefinition>();
  const ownerFiles = new WeakMap<PluginDefinition, PluginOwnerFilesBinding>();
  const configurations = new WeakMap<PluginDefinition, PluginModelConfigurationDeclaration>();
  const images = new WeakMap<PluginDefinition, PluginImageGenerationDeclaration>();
  const projectData = new WeakMap<PluginDefinition, PluginProjectCleanup>();
  const dual = new WeakSet<PluginDefinition>();
  return {
    providerFor: (definition: PluginDefinition, installId: string) => hostBuilt.has(definition) ? definition.manifest.plugin_id : installId,
    /** The library its Manifest declares, for a definition object the Host's start list holds; none for any other. */
    databaseFor: (definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined => listed.has(definition) ? definition.manifest.databases?.home : undefined,
    ownerFilesFor: (definition: PluginDefinition) => ownerFiles.get(definition),
    modelConfigurationFor: (definition: PluginDefinition) => configurations.get(definition),
    imageGenerationFor: (definition: PluginDefinition) => images.get(definition),
    projectDataFor: (definition: PluginDefinition) => projectData.get(definition),
    /** Whether the Host's start list said this definition is one half of a dual-instance plugin; nothing the plugin declares does. */
    dualInstance: (definition: PluginDefinition) => dual.has(definition),
    /** The files its Manifest declares, for a definition object the Host's start list holds. */
    remember(entries: readonly (PluginOwnerFilesEntry & { trust?: PluginTrust;
      project_data?: PluginProjectCleanup })[]) {
      for (const entry of entries) {
        if (entry.trust && isHostTrust(entry.trust)) hostBuilt.add(entry.definition);
        if (entry.dual_instance) dual.add(entry.definition);
        listed.add(entry.definition);
        const owned = entry.definition.manifest.owner_files;
        if (owned) ownerFiles.set(entry.definition, Object.freeze({
          declaration: Object.freeze({ ...owned, entries: Object.freeze(owned.entries.map(item => Object.freeze({ ...item }))) }),
        }));
        const config = entry.definition.manifest.model_configuration;
        if (config) configurations.set(entry.definition, Object.freeze({
          preference: Object.freeze({ ...config.preference }), custom_provider: Object.freeze({ ...config.custom_provider }),
          actions: Object.freeze({ read: Object.freeze({ ...config.actions.read }), save: Object.freeze({ ...config.actions.save }) }),
        }));
        if (entry.definition.manifest.image_generation) images.set(entry.definition, Object.freeze({ ...entry.definition.manifest.image_generation }));
        if (entry.project_data) projectData.set(entry.definition, Object.freeze({ owner_id: entry.project_data.owner_id,
          declaration: Object.freeze({ ...entry.project_data.declaration }) }));
      }
    },
  };
}
