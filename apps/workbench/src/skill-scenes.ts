import { isPluginSceneName } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/**
 * Who a Skill can be for besides the Assistant: the scenes built-in plugins declare on their Manifest (`memory_scene`), each named by
 * the first plugin that declares it (BL-b44-coding-scene-enum). The Host reads the same list (`builtinScenePlugins`) for a Skill's
 * 「给谁用」 and its replays; the platform names no plugin's scene itself.
 */
export const SKILL_SCENES: ReadonlyArray<{ scene: string; name: string }> = (() => {
  const scenes = new Map<string, string>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    const scene = entry.manifest.memory_scene;
    if (isPluginSceneName(scene) && !scenes.has(scene)) scenes.set(scene, entry.manifest.name);
  }
  return Object.freeze([...scenes].map(([scene, name]) => Object.freeze({ scene, name })));
})();
