import type { PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginModelConfigurationDeclaration, PluginImageGenerationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definitionOrigin, isHostTrust } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginProjectCleanup } from "./plugin-project-cleanup.js";
import type { PluginOwnerFilesEntry, PluginOwnerFilesBinding } from "./plugin-owner-files-entries.js";

/**
 * Only the Host's actual definition objects may inherit the provider of its own build (`host` trust) or a declared library. The
 * Runtime hands back its view of such an object (`platformDefinition`: the same object with the platform's frozen Manifest copy), so
 * each lookup asks about the object that view was made from; any other object, a copy included, is not one of the Host's.
 */
export function pluginEntryIdentity() {
  const hostBuilt = new WeakSet<PluginDefinition>();
  const listed = new WeakSet<PluginDefinition>();
  const ownerFiles = new WeakMap<PluginDefinition, PluginOwnerFilesBinding>();
  const configurations = new WeakMap<PluginDefinition, PluginModelConfigurationDeclaration>();
  const images = new WeakMap<PluginDefinition, PluginImageGenerationDeclaration>();
  const locales = new WeakMap<PluginDefinition, (definition: PluginDefinition) => PluginTextReader | null>();
  const projectData = new WeakMap<PluginDefinition, PluginProjectCleanup>();
  const dual = new WeakSet<PluginDefinition>();
  const dualIds = new Set<string>();
  return {
    providerFor: (definition: PluginDefinition, installId: string) => hostBuilt.has(definitionOrigin(definition)) ? definition.manifest.plugin_id : installId,
    /** The library its Manifest declares, for a definition object the Host's start list holds; none for any other. */
    databaseFor: (definition: PluginDefinition): HomePluginDatabaseDeclaration | undefined => listed.has(definitionOrigin(definition)) ? definition.manifest.databases?.home : undefined,
    ownerFilesFor: (definition: PluginDefinition) => ownerFiles.get(definitionOrigin(definition)),
    modelConfigurationFor: (definition: PluginDefinition) => configurations.get(definitionOrigin(definition)),
    imageGenerationFor: (definition: PluginDefinition) => images.get(definitionOrigin(definition)),
    localePacks: (definition: PluginDefinition) => locales.get(definitionOrigin(definition))?.(definition) ?? null,
    projectDataFor: (definition: PluginDefinition) => projectData.get(definitionOrigin(definition)),
    /** Whether the Host's start list said this definition is one half of a dual-instance plugin; nothing the plugin declares does. */
    dualInstance: (definition: PluginDefinition) => dual.has(definitionOrigin(definition)),
    dualInstanceId: (pluginId: string) => dualIds.has(pluginId),
    /** The files its Manifest declares, for a definition object the Host's start list holds. */
    remember(entries: readonly (PluginOwnerFilesEntry & { trust?: PluginTrust;
      project_data?: PluginProjectCleanup; localePacks?: (definition: PluginDefinition) => PluginTextReader | null })[]) {
      for (const entry of entries) {
        if (entry.trust && isHostTrust(entry.trust)) hostBuilt.add(entry.definition);
        if (entry.localePacks) locales.set(entry.definition, entry.localePacks);
        if (entry.dual_instance) { dual.add(entry.definition); dualIds.add(entry.definition.manifest.plugin_id); }
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
        const owner = entry.project_data;
        if (owner) projectData.set(entry.definition, Object.freeze({ owner_id: owner.owner_id }));
      }
    },
  };
}
