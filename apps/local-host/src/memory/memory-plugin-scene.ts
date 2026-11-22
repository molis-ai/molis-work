import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryPluginScene } from "@molis-ai/molis-work-contracts/services/memory";
import { isPluginSceneName } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { builtinPluginByManifestId, PLATFORM_PLUGIN_REGISTRATIONS } from "../plugin-registry.js";
import { BUNDLE_FILE } from "../sandbox-package-store.js";

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

/** Who reads Skills in a plugin's workspace rounds: its declared scene (Coding's `coding`), or `agent` when it declares none. */
export function skillConsumerOf(pluginId: string, projectId?: string | null): string {
  const scene = pluginMemoryScene(pluginId, undefined, projectId);
  return isPluginSceneName(scene) ? scene : "agent";
}

/** The scenes the packages kept in this Home declare, each with its package's name, read from their bundles without verifying them, as `SandboxPackageStore.scopeOf` reads. */
function keptPackageScenes(home: string): Array<{ scene: string; name: string }> {
  const root = join(home, "plugin-packages");
  if (!existsSync(root)) return [];
  const scenes: Array<{ scene: string; name: string }> = [];
  for (const entry of readdirSync(root)) {
    try {
      const manifest = (JSON.parse(readFileSync(join(root, entry, BUNDLE_FILE), "utf8")) as { payload?: { manifest?: { memory_scene?: unknown; name?: unknown } } }).payload?.manifest;
      if (isPluginSceneName(manifest?.memory_scene)) scenes.push({ scene: manifest.memory_scene, name: typeof manifest.name === "string" ? manifest.name : manifest.memory_scene });
    } catch { /* not a package directory */ }
  }
  return scenes;
}

/** The scene list from built-in plugins alone: what a policy built without a Home uses (its tests and tools). */
export function builtinMemoryScenes(): readonly string[] {
  return sceneList(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.memory_scene));
}

const sceneList = (declared: readonly unknown[]): readonly string[] =>
  Object.freeze([...[...new Set(declared.filter(isPluginSceneName))].sort(), "assistant", "common"]);

const taxonomies = new Map<string, readonly string[]>();

/**
 * The memory scenes this Home's memory runtime knows (BL-b44-coding-scene-enum; the user chose 2026-11-21 that they are read when the
 * Host starts): every scene a built-in plugin declares and every one a package kept in this Home declares, then the platform's
 * `assistant` and `common`. Prologue takes its scene list once and refuses a memory in a scene it does not list, stored ones too, so
 * the list may never lose a name: kept packages are never removed, so a scene once listed stays. Read once per Home and process; a
 * package installed later that declares a scene not on it keeps memories in it after the next start (its install preview says so).
 */
export function memorySceneTaxonomy(home: string): readonly string[] {
  const known = taxonomies.get(home);
  if (known) return known;
  const list = sceneList([...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.memory_scene), ...keptPackageScenes(home).map(kept => kept.scene)]);
  taxonomies.set(home, list);
  return list;
}

/** A declared scene this running Home's memory does not list yet: it takes effect after the next start. */
export const sceneAfterRestart = (home: string, scene: unknown): boolean => isPluginSceneName(scene) && !memorySceneTaxonomy(home).includes(scene);

/**
 * The plugin scenes the built-in plugins declare, each with the declaring plugin's name and summary: what a Skill's 「给谁用」 and a
 * replay's entry say for that scene. A scene two plugins declare takes the first one's words.
 */
export function builtinScenePlugins(): ReadonlyMap<string, { name: string; summary: string }> {
  const scenes = new Map<string, { name: string; summary: string }>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
    const scene = entry.manifest.memory_scene;
    if (isPluginSceneName(scene) && !scenes.has(scene)) scenes.set(scene, { name: entry.manifest.name, summary: entry.manifest.summary ?? "" });
  }
  return scenes;
}

/**
 * The plugin scenes this running Home's memory lists, each named by the first plugin that declares it (built-in, then kept packages):
 * what the memory settings page offers and how it names a scene. The platform's own `assistant` and `common` are the page's words.
 */
export function memorySceneChoices(home: string): Array<{ scene: string; name: string }> {
  const names = new Map<string, string>();
  for (const [scene, plugin] of builtinScenePlugins()) names.set(scene, plugin.name);
  for (const kept of keptPackageScenes(home)) if (!names.has(kept.scene)) names.set(kept.scene, kept.name);
  return memorySceneTaxonomy(home).filter(isPluginSceneName).map(scene => ({ scene, name: names.get(scene) ?? scene }));
}

/**
 * Whether `applies_to` names someone this Home can hand a Skill to: the Assistant, everyone (`both`), or a scene a built-in plugin
 * declares, or a package kept in this Home now, or `own` (the declaring package's own `memory_scene`). The SDK checks only the name's
 * form; a well-formed name no plugin declares is refused here (BL-b44-coding-scene-enum).
 */
export function skillAudienceDeclared(appliesTo: unknown, home?: string, own?: unknown): boolean {
  if (appliesTo === "assistant" || appliesTo === "both") return true;
  if (!isPluginSceneName(appliesTo)) return false;
  return appliesTo === own || builtinScenePlugins().has(appliesTo) || (home !== undefined && keptPackageScenes(home).some(kept => kept.scene === appliesTo));
}
