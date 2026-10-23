import path from "node:path";
import type { AgentDefinitionRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentDeclarationsFor, agentDefinitionsFor, agentRegistration, declaredMethods } from "./agent-definitions/agent-definitions.js";
import { notRunning } from "./agent-definitions/agent-declarations.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * Per Home and owner: the installations whose registration this module has up, how many running instances hold each, and the
 * version registered. Several projects run one installation and the last instance out withdraws it; two installations of one plugin
 * (two publisher signatures) register side by side. What the register holds for an owner beyond these is not this module's.
 */
const holders = new Map<string, Map<string, { held: number; version: string; registration: AgentDefinitionRegistration }>>();
let catalogOwners: ReadonlySet<string> | undefined;

/**
 * Registers what a definition carries for Agents for as long as the installation runs: the roles and Agent prompts of its Manifest's
 * `agent` block (with `PluginDefinition.agent_prompts`, so the person sees and edits them and a run uses the edit, PG-051), its instructions
 * (`PluginDefinition.instructions`), so the person sees and edits them in “Prompt 与 Character” like every other, and the methods
 * its Manifest declares with their bodies (`PluginDefinition.methods`), so other Agents use them as they use a built-in Plugin's
 * (decision #18, W4-02); a definition that carries none of these registers nothing. Only for a plugin the Host runs itself on a platform that reaches a Home: instructions exist for
 * `services.model`, which no other plugin has, and a method's body goes into another Agent's round. Returns what withdraws them, once.
 * An upgraded version that starts while another project still runs the earlier one replaces the registration: the register shows the
 * installation's newest version. The last instance out leaves it as not running: the Home remembers it whole, the person still sees and
 * edits it, it offers other Agents no method; uninstalling forgets it (`forgetPluginAgentDefinitions`, PG-051 Q1 b).
 *
 * An owner has its Agent definitions in one place. The register shows one row per owner, and a definition's row would take the place
 * of the catalog's: the roles and methods the catalog registers for an owner (Schedule's and the assistant's roles, Issues' method)
 * would be gone from the person's settings and from other Agents while the definition runs. So a definition that carries instructions
 * or methods for an owner the catalog registers anything for (instructions, Agent prompts, roles or methods) is refused, as is one
 * that names an owner other than itself; a plugin with a catalog entry declares them on the entry.
 */
export function registerPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string): (() => void) | undefined {
  // What the definition itself carries: a catalog plugin's Manifest declares methods too, and the catalog registers them.
  const instructions = definition.instructions ?? [], bodies = definition.methods ?? [], agent = definition.manifest.agent;
  if ((instructions.length === 0 && bodies.length === 0 && !agent) || !home || definition.execution === "sandbox") return undefined;
  const { plugin_id: owner, version, name } = definition.manifest;
  for (const item of instructions) {
    if (item.owner_id !== owner) throw new Error(`插件 ${owner} 登记的指令 ${item.prompt_id} 属于 ${item.owner_id}：一个插件只能登记自己的指令`);
  }
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  const ownerKey = `${path.resolve(home.directory)}\0${owner}`;
  const installs = holders.get(ownerKey) ?? new Map<string, { held: number; version: string; registration: AgentDefinitionRegistration }>();
  const holder = installs.get(installId);
  // The catalog's owners, not the register's: a remembered declaration of this plugin is in the register too (PG-051 Q1 b).
  catalogOwners ??= new Set(builtinRegistrations().map(row => row.owner_id));
  if (!holder && installs.size === 0 && catalogOwners.has(owner)) {
    // Until PG-051 P2 a catalog plugin's `agent` block is registered by the catalog, from the same package: nothing to add here.
    if (instructions.length === 0 && bodies.length === 0) return undefined;
    throw new Error(`插件 ${owner} 在目录里已经登记了 Agent 定义（指令、角色或方法）：一个主人的定义只在一处，不能再由 PluginDefinition 登记第二个来源；有目录条目的插件把指令和方法声明在条目上`);
  }
  let registration = holder?.registration;
  if (!holder || holder.version !== version) {
    const { methods, notes } = declaredMethods(definition.manifest.methods ?? [], bodies);
    const source = { kind: "plugin" as const, plugin_id: owner, plugin_version: version, title: name, state: "enabled" as const };
    const declared = agent ? agentRegistration(owner, source, agent, definition.agent_prompts ?? []) : { prompts: [], roles: [] };
    registration = { owner_id: owner, source, prompts: [...declared.prompts, ...instructions.map(item => ({ prompt_id: item.prompt_id, version: item.version,
      kind: "instruction" as const, title: item.title, purpose: item.purpose, used_by: [...item.used_by], body: item.body }))], roles: declared.roles,
      ...(methods.length ? { methods } : {}), ...(notes.length ? { notes } : {}) };
    registry.register(registration, installId);
    agentDeclarationsFor(home.directory).remember(installId, registration);
  }
  const kept = registration!;
  installs.set(installId, { held: (holder?.held ?? 0) + 1, version, registration: kept });
  holders.set(ownerKey, installs);
  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    const running = holders.get(ownerKey), current = running?.get(installId);
    if (current && current.held > 1) { current.held -= 1; return; }
    running?.delete(installId);
    if (running?.size === 0) holders.delete(ownerKey);
    // Kept as not running: the person still sees and edits its prompts; uninstalling forgets it.
    registry.register(notRunning(kept), installId);
    agentDeclarationsFor(home.directory).remember(installId, kept);
  };
}

/** An uninstalled installation's declarations leave the register and the Home (PG-051 Q1 b), unless it still runs somewhere. */
export function forgetPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, installId: string): void {
  if (!home) return;
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  for (const owner of agentDeclarationsFor(home.directory).forget(installId)) {
    if (!holders.get(`${path.resolve(home.directory)}\0${owner}`)?.has(installId)) registry.unregister(owner, installId);
  }
}
