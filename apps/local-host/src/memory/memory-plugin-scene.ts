import type { MemoryPluginScene } from "@molis-ai/molis-work-contracts/services/memory";
import { builtinPluginByManifestId } from "../plugin-registry.js";

/**
 * The scenes installed (signed, sandboxed) plugins declare, per project, set by the project's installed-plugin host when it reads the
 * installation's declaration and cleared when the plugin leaves; built-in plugins are read from the generated registry instead.
 */
const installedScenes = new Map<string, MemoryPluginScene>();
const installedKey = (projectId: string, pluginId: string) => `${projectId}\u0000${pluginId}`;

/** The installed-plugin host records the scene an installation declares (`memory_scene`), the same declaration a built-in carries. */
export function rememberInstalledMemoryScene(projectId: string, pluginId: string, scene: MemoryPluginScene | undefined): void {
  if (scene) installedScenes.set(installedKey(projectId, pluginId), scene);
  else installedScenes.delete(installedKey(projectId, pluginId));
}

export function forgetInstalledMemoryScene(projectId: string, pluginId: string): void {
  installedScenes.delete(installedKey(projectId, pluginId));
}

/**
 * A plugin's declared memory scene from its Manifest (`memory_scene`, PEQ-09): a built-in's from the registry, an installed plugin's as
 * its project's host recorded it (equal standing); undeclared plugins are `"common"`. `explicit` is a declaration the caller already holds.
 */
export function pluginMemoryScene(pluginId: string | null | undefined, explicit?: MemoryPluginScene, projectId?: string | null): MemoryPluginScene {
  if (explicit) return explicit;
  if (!pluginId) return "common";
  const builtin = builtinPluginByManifestId(pluginId);
  if (builtin) return builtin.manifest.memory_scene || "common";
  return (projectId && installedScenes.get(installedKey(projectId, pluginId))) || "common";
}
