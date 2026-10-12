import path from "node:path";
import type { AgentDefinitionRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import type { PluginPlatformHome } from "./home-side.js";

/** How many running instances hold each installation's instructions: several projects run one installation, and the last one out withdraws them. */
const holders = new Map<string, number>();

/**
 * Registers the instructions a definition carries (`PluginDefinition.instructions`) for as long as the installation runs, so the
 * person sees and edits them in “Prompt 与 Character” like every other. Only for a plugin the Host runs itself on a platform that
 * reaches a Home: they exist for `services.model`, which no other plugin has. Returns what withdraws them, once.
 *
 * An owner has its instructions in one place. A plugin with a catalog entry declares them there; a definition that carries them
 * for an owner the catalog already registers for is refused, as is one that names an owner other than itself.
 */
export function registerPluginInstructions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string): (() => void) | undefined {
  const instructions = definition.instructions ?? [];
  if (instructions.length === 0 || !home || definition.execution === "sandbox") return undefined;
  const { plugin_id: owner, version, name } = definition.manifest;
  for (const item of instructions) {
    if (item.owner_id !== owner) throw new Error(`插件 ${owner} 登记的指令 ${item.prompt_id} 属于 ${item.owner_id}：一个插件只能登记自己的指令`);
  }
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  const key = `${path.resolve(home.directory)}\0${installId}`;
  const held = holders.get(key) ?? 0;
  if (held === 0) {
    if (registry.registrations().some(row => row.owner_id === owner && row.prompts.some(prompt => prompt.kind === "instruction"))) {
      throw new Error(`插件 ${owner} 的指令已经由目录条目登记，不能再由 PluginDefinition.instructions 登记第二次：一个主人的指令只在一处`);
    }
    const registration: AgentDefinitionRegistration = { owner_id: owner, source: { kind: "plugin", plugin_id: owner, plugin_version: version, title: name, state: "enabled" },
      prompts: instructions.map(item => ({ prompt_id: item.prompt_id, version: item.version, kind: "instruction" as const, title: item.title, purpose: item.purpose,
        used_by: [...item.used_by], body: item.body })), roles: [] };
    registry.register(registration, installId);
  }
  holders.set(key, held + 1);
  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    const left = (holders.get(key) ?? 1) - 1;
    if (left > 0) { holders.set(key, left); return; }
    holders.delete(key);
    registry.unregister(owner, installId);
  };
}
