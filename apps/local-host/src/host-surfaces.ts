import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { studioSurface } from "@molis-ai/molis-work-plugin-studio/surface";
import { PLATFORM_PLUGIN_REGISTRATIONS, builtinPluginByManifestId, catalogProblems } from "./plugin-registry.js";

/**
 * The platform's own surfaces the shell frames like a plugin's page (47-1 C, user 2026-11-22): the plugin studio. The Host decides from
 * this list, as it does from the plugin registry, and the shell draws from its copy (apps/workbench/src/host-surfaces.ts). Not plugins:
 * no catalog, settings, market, project membership or install row; their declaration only gives their page its requests and words,
 * their prompts their owner, and their drafts the sync collection they always had.
 */
export const HOST_SURFACE_REGISTRATIONS: readonly (HostSurfaceRegistration & { readonly package_name: string })[] = [
  { ...studioSurface, package_name: "@molis-ai/molis-work-plugin-studio" },
];

const SURFACE_PROBLEMS = catalogProblems([...PLATFORM_PLUGIN_REGISTRATIONS, ...HOST_SURFACE_REGISTRATIONS]);
if (SURFACE_PROBLEMS.length > 0) throw new Error(`Platform surfaces beside the plugin catalog: ${SURFACE_PROBLEMS.join("; ")}`);

export function hostSurfaceByManifestId(pluginId: string): (HostSurfaceRegistration & { readonly package_name: string }) | undefined {
  return HOST_SURFACE_REGISTRATIONS.find(surface => surface.manifest.plugin_id === pluginId);
}

export function hostSurfaceByProjectKey(key: string): (HostSurfaceRegistration & { readonly package_name: string }) | undefined {
  return HOST_SURFACE_REGISTRATIONS.find(surface => surface.project_plugin_id === key);
}

/** The shipped declaration an owner id names: a built-in plugin's, or one of the platform's own surfaces'. */
export function shippedOwnerManifest(ownerId: string): PluginManifest | undefined {
  return builtinPluginByManifestId(ownerId)?.manifest ?? hostSurfaceByManifestId(ownerId)?.manifest;
}
