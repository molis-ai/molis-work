import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { MemoryPluginScene } from "@molis-ai/molis-work-contracts/services/memory";
import { isPluginSceneName } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillSceneChoice } from "@molis-ai/molis-work-contracts/services/skills";
import { matchLocale } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { projectDirectoryWords, type PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { builtinPluginByManifestId, SHIPPED_PARTS } from "../plugin-registry.js";
import { BUNDLE_FILE } from "../sandbox-package-store.js";
import { directoryWordResolver, hasHostUiText, registeredBuiltinText } from "../ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE } from "../web-locale.js";

/**
 * The scenes installed (signed, sandboxed) plugins declare, per project or per Home, set by the installed-plugin host when an
 * installation runs and cleared when it stops, is disabled, is revoked, or leaves; built-in plugins are read from the generated registry instead.
 */
const installedScenes = new Map<string, MemoryPluginScene>();
const homeInstalledScenes = new Map<string, Map<string, MemoryPluginScene>>();
const installedKey = (projectId: string, pluginId: string) => `${projectId}\u0000${pluginId}`;

/** The installed-plugin host records the scene an installation declares (`memory_scene`), the same declaration a built-in carries. */
export function rememberInstalledMemoryScene(projectId: string, pluginId: string, scene: MemoryPluginScene | undefined): void {
  if (scene) installedScenes.set(installedKey(projectId, pluginId), scene);
  else installedScenes.delete(installedKey(projectId, pluginId));
}

export function forgetInstalledMemoryScene(projectId: string, pluginId: string): void {
  installedScenes.delete(installedKey(projectId, pluginId));
}

export function forgetProjectInstalledMemoryScenes(projectId: string): void {
  const prefix = `${projectId}\u0000`;
  for (const key of installedScenes.keys()) if (key.startsWith(prefix)) installedScenes.delete(key);
}

/** The Home installed-plugin host records the scene a Home-scoped installation declares while running and clears it on stop/disable/revoke/uninstall. */
export function rememberHomeInstalledMemoryScene(home: string, pluginId: string, scene: MemoryPluginScene | undefined): void {
  if (scene) {
    let entries = homeInstalledScenes.get(home);
    if (!entries) homeInstalledScenes.set(home, entries = new Map());
    entries.set(pluginId, scene);
  } else {
    forgetHomeInstalledMemoryScene(home, pluginId);
  }
}

export function forgetHomeInstalledMemoryScene(home: string, pluginId: string): void {
  const entries = homeInstalledScenes.get(home);
  if (!entries) return;
  entries.delete(pluginId);
  if (!entries.size) homeInstalledScenes.delete(home);
}

export function forgetHomeInstalledMemoryScenes(home: string): void {
  homeInstalledScenes.delete(home);
}

function activeHomeSceneFor(pluginId: string): MemoryPluginScene | undefined {
  for (const entries of homeInstalledScenes.values()) {
    const found = entries.get(pluginId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A plugin's declared memory scene from its Manifest (`memory_scene`, PEQ-09): a built-in's from the registry, an installed plugin's as
 * its project's or Home's host recorded it (equal standing); undeclared plugins are `"common"`. `explicit` is a declaration the caller already holds.
 */
export function pluginMemoryScene(pluginId: string | null | undefined, explicit?: MemoryPluginScene, projectId?: string | null): MemoryPluginScene {
  if (explicit) return explicit;
  if (!pluginId) return "common";
  const builtin = builtinPluginByManifestId(pluginId);
  if (builtin) return builtin.manifest.memory_scene || "common";
  return (projectId && installedScenes.get(installedKey(projectId, pluginId))) || activeHomeSceneFor(pluginId) || "common";
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
  return sceneList(SHIPPED_PARTS.map(entry => entry.manifest.memory_scene));
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
  const list = sceneList([...SHIPPED_PARTS.map(entry => entry.manifest.memory_scene), ...keptPackageScenes(home).map(kept => kept.scene)]);
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
  for (const entry of SHIPPED_PARTS) {
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

/** One active plugin scene registered for Skill settings, authoring, import and replay in the current runtime scope. */
export interface ActiveSkillScene {
  readonly name: string;
  readonly summary: string;
  readonly scope: "home" | "project";
}

export interface ActiveSceneInstallation {
  readonly record: { readonly install_id: string; readonly plugin_id: string; readonly publisher_trust: string; readonly publisher_signature: string; readonly state: string };
  readonly manifest?: PluginManifest;
  readonly scope: "home" | "project";
  readonly recoveryCode?: string;
  readonly readLocalePacks?: () => PluginTextReader | null;
}

/** Baseline active scenes from built-in plugins alone (used when no runtime installations snapshot is provided). */
export function builtinActiveSkillScenes(): ReadonlyMap<string, ActiveSkillScene> {
  const scenes = new Map<string, ActiveSkillScene>();
  for (const [scene, plugin] of builtinScenePlugins()) scenes.set(scene, { name: plugin.name, summary: plugin.summary, scope: "home" });
  return scenes;
}

/**
 * Active plugin scenes in a caller's scope (BL-skill-settings-installed-plugin-scenes): built-in plugins plus currently running,
 * healthy, non-revoked installed third-party plugins in the caller's scope (`home` or `home + project`). Disabled, uninstalled,
 * recovery-failed and publisher-revoked plugins are excluded immediately; built-in and Home declarations take precedence in naming.
 */
export function activeSkillScenePlugins(
  installations: readonly ActiveSceneInstallation[],
  pins: ReadonlyMap<string, PluginPublisherPin>,
  locale?: string,
): ReadonlyMap<string, ActiveSkillScene> {
  const scenes = new Map<string, ActiveSkillScene>();
  const wordsOf = (manifest: PluginManifest, reader: PluginTextReader | null) => {
    if (!reader || !hasHostUiText()) return { name: manifest.name, summary: manifest.summary ?? "" };
    const matched = matchLocale(locale ?? activeLocale(), manifest.ui.locales?.available ?? [], reader.default || DEFAULT_WEB_LOCALE);
    const words = projectDirectoryWords({ ...manifest, ui: {} }, directoryWordResolver(reader, matched));
    return { name: words.name, summary: words.summary ?? manifest.summary ?? "" };
  };
  for (const entry of SHIPPED_PARTS) {
    const scene = entry.manifest.memory_scene;
    if (!isPluginSceneName(scene) || scenes.has(scene)) continue;
    const live = installations.find(item => item.record.publisher_trust === "host" && item.record.plugin_id === entry.manifest.plugin_id
      && item.record.state === "running" && !item.recoveryCode && item.manifest);
    const manifest = live?.manifest ?? entry.manifest;
    const reader = live?.readLocalePacks?.() ?? registeredBuiltinText(entry.manifest);
    scenes.set(scene, { ...wordsOf(manifest, reader), scope: "home" });
  }
  const activeThirdParty = installations
    .filter((item): item is ActiveSceneInstallation & { manifest: PluginManifest & { memory_scene: string } } => {
      const { record, manifest, recoveryCode } = item;
      if (record.publisher_trust !== "pinned" || record.state !== "running" || recoveryCode) return false;
      if (!manifest || !isPluginSceneName(manifest.memory_scene)) return false;
      const pin = pins.get(record.publisher_signature);
      return Boolean(pin && !pin.revoked_at);
    })
    .sort((left, right) =>
      left.manifest.memory_scene.localeCompare(right.manifest.memory_scene)
      || (left.scope === "home" ? 0 : 1) - (right.scope === "home" ? 0 : 1)
      || left.record.plugin_id.localeCompare(right.record.plugin_id)
      || left.record.install_id.localeCompare(right.record.install_id));
  for (const item of activeThirdParty) {
    const scene = item.manifest.memory_scene;
    if (scenes.has(scene)) continue;
    scenes.set(scene, { ...wordsOf(item.manifest, item.readLocalePacks?.() ?? null), scope: item.scope });
  }
  return scenes;
}

/** Upper bound matching the closed output schemas for `scenes` / `skill_scenes`. */
export const SKILL_SCENES_MAX = 200;
const SKILL_SCENE_NAME_MAX = 200;

/** Serialized active scenes for Skill settings, capability pack reports, and install/import previews. */
export function skillSceneChoicesOf(scenes: ReadonlyMap<string, ActiveSkillScene>): SkillSceneChoice[] {
  return [...scenes.entries()].slice(0, SKILL_SCENES_MAX).map(([scene, info]) => ({
    scene,
    name: cutHead(info.name.trim(), SKILL_SCENE_NAME_MAX) || scene,
    scope: info.scope,
  }));
}

/** Whether `applies_to` targets the Assistant, everyone (`both`), an active plugin scene in scope, or the declaring package's own `memory_scene`. */
export function skillAudienceActive(appliesTo: unknown, scenes: ReadonlyMap<string, ActiveSkillScene>, own?: unknown): boolean {
  if (appliesTo === "assistant" || appliesTo === "both") return true;
  if (!isPluginSceneName(appliesTo)) return false;
  return appliesTo === own || scenes.has(appliesTo);
}
