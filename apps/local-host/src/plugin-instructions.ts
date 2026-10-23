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
let hostOwners: ReadonlySet<string> | undefined;

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
 * This is the one way a plugin's Agent definitions reach the register (PG-051): built-in or installed, a plugin's come with its
 * definition. A definition for an owner the Host registers itself (the assistant, Plugin Builder, Alchemist) is refused, as is one
 * that names an owner other than itself.
 */
export function registerPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string): (() => void) | undefined {
  const instructions = definition.instructions ?? [], bodies = definition.methods ?? [], agent = definition.manifest.agent;
  if (!home || definition.execution === "sandbox") return undefined;
  // A version that carries nothing still replaces what an earlier one left remembered: the record is replaced whole (PG-051 RAC-196).
  if (instructions.length === 0 && bodies.length === 0 && !agent) { forgetPluginAgentDefinitions(home, installId); return undefined; }
  const { plugin_id: owner, version, name } = definition.manifest;
  for (const item of instructions) {
    if (item.owner_id !== owner) throw new Error(`插件 ${owner} 登记的指令 ${item.prompt_id} 属于 ${item.owner_id}：一个插件只能登记自己的指令`);
  }
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  const ownerKey = `${path.resolve(home.directory)}\0${owner}`;
  const installs = holders.get(ownerKey) ?? new Map<string, { held: number; version: string; registration: AgentDefinitionRegistration }>();
  const holder = installs.get(installId);
  hostOwners ??= new Set(builtinRegistrations().map(row => row.owner_id));
  if (hostOwners.has(owner)) throw new Error(`${owner} 的 Agent 定义由平台自己登记，插件定义不能再登记第二个来源`);
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
