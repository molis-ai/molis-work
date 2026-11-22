import type { SkillSceneChoice, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { joined, readText, skillUi } from "./common.js";

/**
 * The active plugin scenes a Skill can be bound to in the current scope, updated from the Host runtime's `kit.catalog.list` answer
 * (covering built-in plugins and currently running, trusted third-party plugins). `assistant` and `agent` are the platform's own words.
 */
let active: ReadonlyArray<SkillSceneChoice> = [];

export function setSkillScenes(scenes: readonly SkillSceneChoice[]): void {
  active = scenes.slice();
  skillUi()?.setScenes?.(active);
}

export function skillScenes(scope?: SkillScope): ReadonlyArray<SkillSceneChoice> {
  return scope === "home" ? active.filter(row => row.scope !== "project") : active;
}

/** Who one entry is: the Assistant, plugin work in general, or the plugin that declares the scene. */
export const sceneWord = (consumer: string) => consumer === "assistant" ? readText("workbench.common.assistant")
  : consumer === "agent" ? readText("workbench.settings-skills.agent") : active.find(row => row.scene === consumer)?.name ?? consumer;

/** `both`: the Assistant and every active plugin scene in scope. */
export const bothWord = (scope?: SkillScope) => readText("workbench.settings-skills.assistant-and-plugins", { list: joined(skillScenes(scope).map(row => row.name)) });
