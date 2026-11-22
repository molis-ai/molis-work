import { joined, readText } from "./common.js";

/**
 * The plugin scenes a Skill can be for, as the 「能力包」 page was drawn with them (`data-skill-scenes`, from the built-in plugins'
 * Manifests): each scene's name is its plugin's. `assistant` and `agent` are the platform's own words (BL-b44-coding-scene-enum).
 */
let read: ReadonlyArray<{ scene: string; name: string }> | undefined;
export function skillScenes(): ReadonlyArray<{ scene: string; name: string }> {
  if (read) return read;
  try { read = JSON.parse(document.querySelector<HTMLElement>("[data-kit-settings]")?.dataset.skillScenes ?? "[]") as Array<{ scene: string; name: string }>; }
  catch { read = []; }
  return read;
}
/** Who one entry is: the Assistant, plugin work in general, or the plugin that declares the scene. */
export const sceneWord = (consumer: string) => consumer === "assistant" ? readText("workbench.common.assistant")
  : consumer === "agent" ? readText("workbench.settings-skills.agent") : skillScenes().find(row => row.scene === consumer)?.name ?? consumer;
/** `both`: the Assistant and every plugin scene. */
export const bothWord = () => readText("workbench.settings-skills.assistant-and-plugins", { list: joined(skillScenes().map(row => row.name)) });
