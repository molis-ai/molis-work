import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_SURFACE_REGISTRATIONS, type HostSurface } from "./host-surface-list.js";
import { PLATFORM_PLUGIN_REGISTRATIONS, builtinPluginByManifestId, catalogProblems } from "./plugin-registry.js";

export { HOST_SURFACE_REGISTRATIONS };

const SURFACE_PROBLEMS = catalogProblems([...PLATFORM_PLUGIN_REGISTRATIONS, ...HOST_SURFACE_REGISTRATIONS]);
if (SURFACE_PROBLEMS.length > 0) throw new Error(`Platform surfaces beside the plugin catalog: ${SURFACE_PROBLEMS.join("; ")}`);

export function hostSurfaceByManifestId(pluginId: string): HostSurface | undefined {
  return HOST_SURFACE_REGISTRATIONS.find(surface => surface.manifest.plugin_id === pluginId);
}

export function hostSurfaceByProjectKey(key: string): HostSurface | undefined {
  return HOST_SURFACE_REGISTRATIONS.find(surface => surface.project_plugin_id === key);
}

/** The shipped declaration an owner id names: a built-in plugin's, or one of the platform's own surfaces'. */
export function shippedOwnerManifest(ownerId: string): PluginManifest | undefined {
  return builtinPluginByManifestId(ownerId)?.manifest ?? hostSurfaceByManifestId(ownerId)?.manifest;
}
