import { pluginErrors, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_ARTIFACT_PRODUCERS } from "./artifact-type-registry.js";
import { heldInstalls, type InstallScope } from "./plugin-holders.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

const sameScope = (a: InstallScope, b: InstallScope) => a.kind === b.kind && (a.kind === "home" || (b.kind === "project" && a.project_id === b.project_id));

const versionOf = (manifest: PluginManifest | undefined, version: string) => manifest?.version === version ? manifest : undefined;

type Owner = { plugin_id: string; artifacts: PluginManifest["artifacts"] };

/** The plugins this build ships and the Host's own producers: their names are reserved on every Home. */
const shippedOwners = (): Owner[] => [...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ plugin_id: entry.manifest.plugin_id, artifacts: entry.manifest.artifacts })),
  ...HOST_ARTIFACT_PRODUCERS.map(host => ({ plugin_id: host.plugin_id, artifacts: { produces: host.produces, consumes: [] } }))];

/**
 * The owners for the isolated plugin-development run (`molis-work plugin dev`): its state directory is a private Home of its own with
 * no installation but the plugin under development (earlier runs' retained rows are the same developer's, not other owners), so the
 * only names it can collide with are the ones this build reserves. The plugin then learns here what its real install would refuse (S-82).
 */
export function developmentDeclarationOwners() {
  const shipped = shippedOwners();
  return (): readonly Owner[] => shipped;
}

/**
 * Who owns the 成果 type ids and link kinds on this Home, for the Plugin Runtime to refuse an install, a version change or an enable
 * that would give a name a second owner (S-82). One namespace for the whole Home: the owners are the plugins this build ships (their
 * names stay reserved), the Host's own producers, and every installation the Home still holds, in the Home's plugin store and in
 * each project's, by the Manifest it was started with. A disabled installation still holds its names; the last one to be
 * uninstalled without its data lets them go. What cannot be read refuses, with two exceptions that read nothing less: the plugin being
 * checked is not held back by its own record (its names are the candidate Manifest's), and an installation put in from a directory
 * (`molis-work plugin dev`) keeps no release row, so the Manifest the supervisor of this very scope is running for it stands in.
 */
export function declarationOwnersFor(home: string | null, current: NonNullable<Parameters<typeof heldInstalls>[1]>, running: (pluginId: string) => PluginManifest | undefined = () => undefined) {
  const shipped = shippedOwners();
  const shippedIds = new Set(shipped.map(owner => owner.plugin_id));
  return (manifest: PluginManifest): readonly Owner[] => {
    // A plugin this build ships has its names from the build, so its own start asks nothing of the disks.
    if (shippedIds.has(manifest.plugin_id)) return shipped;
    try {
      const held = heldInstalls(home, current).filter(item => !shippedIds.has(item.record.plugin_id) && item.record.plugin_id !== manifest.plugin_id).map(item => {
        // Only this scope's supervisor can say what a development installation in this scope declares; another scope's stays unreadable.
        const readable = item.manifest ?? (sameScope(item.scope, current.scope) ? versionOf(running(item.record.plugin_id), item.record.version) : undefined);
        if (!readable) throw new Error(`读不到已装插件 ${item.record.plugin_id} 的 Manifest`);
        return { plugin_id: item.record.plugin_id, artifacts: readable.artifacts };
      });
      return [...shipped, ...held];
    } catch (error) {
      throw pluginErrors.definition_conflict(`${manifest.plugin_id} 声明的成果类型和链接种类，现在核不了有没有被别的插件占着（${error instanceof Error ? error.message : String(error)}）`);
    }
  };
}
