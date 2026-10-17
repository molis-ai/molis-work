import path from "node:path";
import type { AgentDefinitionRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentDefinitionsFor, declaredMethods } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * Per Home and owner: the installations whose registration this module has up, how many running instances hold each, and the
 * version registered. Several projects run one installation and the last instance out withdraws it; two installations of one plugin
 * (two publisher signatures) register side by side. What the register holds for an owner beyond these is not this module's.
 */
const holders = new Map<string, Map<string, { held: number; version: string }>>();

/**
 * Registers what a definition carries for Agents for as long as the installation runs: its instructions
 * (`PluginDefinition.instructions`), so the person sees and edits them in “Prompt 与 Character” like every other, and the methods
 * its Manifest declares with their bodies (`PluginDefinition.methods`), so other Agents use them as they use a built-in Plugin's
 * (decision #18, W4-02); a definition that carries neither registers nothing. Only for a plugin the Host runs itself on a platform that reaches a Home: instructions exist for
 * `services.model`, which no other plugin has, and a method's body goes into another Agent's round. Returns what withdraws them, once.
 * An upgraded version that starts while another project still runs the earlier one replaces the registration: the register shows the
 * installation's newest version, and the last instance out withdraws it.
 *
 * An owner has its Agent definitions in one place. The register shows one row per owner, and a definition's row would take the place
 * of the catalog's: the roles and methods the catalog registers for an owner (Schedule's and the assistant's roles, Issues' method)
 * would be gone from the person's settings and from other Agents while the definition runs. So a definition that carries instructions
 * or methods for an owner the catalog registers anything for (instructions, Agent prompts, roles or methods) is refused, as is one
 * that names an owner other than itself; a plugin with a catalog entry declares them on the entry.
 */
export function registerPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string): (() => void) | undefined {
  // What the definition itself carries: a catalog plugin's Manifest declares methods too, and the catalog registers them.
  const instructions = definition.instructions ?? [], bodies = definition.methods ?? [];
  if ((instructions.length === 0 && bodies.length === 0) || !home || definition.execution === "sandbox") return undefined;
  const { plugin_id: owner, version, name } = definition.manifest;
  for (const item of instructions) {
    if (item.owner_id !== owner) throw new Error(`插件 ${owner} 登记的指令 ${item.prompt_id} 属于 ${item.owner_id}：一个插件只能登记自己的指令`);
  }
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  const ownerKey = `${path.resolve(home.directory)}\0${owner}`;
  const installs = holders.get(ownerKey) ?? new Map<string, { held: number; version: string }>();
  const holder = installs.get(installId);
  if (!holder && installs.size === 0 && registry.registrations().some(row => row.owner_id === owner)) {
    throw new Error(`插件 ${owner} 在目录里已经登记了 Agent 定义（指令、角色或方法）：一个主人的定义只在一处，不能再由 PluginDefinition 登记第二个来源；有目录条目的插件把指令和方法声明在条目上`);
  }
  if (!holder || holder.version !== version) {
    const { methods, notes } = declaredMethods(definition.manifest.methods ?? [], bodies);
    const registration: AgentDefinitionRegistration = { owner_id: owner, source: { kind: "plugin", plugin_id: owner, plugin_version: version, title: name, state: "enabled" },
      prompts: instructions.map(item => ({ prompt_id: item.prompt_id, version: item.version, kind: "instruction" as const, title: item.title, purpose: item.purpose,
        used_by: [...item.used_by], body: item.body })), roles: [], ...(methods.length ? { methods } : {}), ...(notes.length ? { notes } : {}) };
    registry.register(registration, installId);
  }
  installs.set(installId, { held: (holder?.held ?? 0) + 1, version });
  holders.set(ownerKey, installs);
  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    const running = holders.get(ownerKey), current = running?.get(installId);
    if (current && current.held > 1) { current.held -= 1; return; }
    running?.delete(installId);
    if (running?.size === 0) holders.delete(ownerKey);
    registry.unregister(owner, installId);
  };
}
