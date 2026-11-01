import path from "node:path";
import type { AgentDefinitionRegistration, AgentDefinitionSource } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-plugin-sdk";
import { agentDeclarationsFor, agentDefinitionsFor, agentRegistration, declaredMethods } from "./agent-definitions/agent-definitions.js";
import { notRunning } from "./agent-definitions/agent-declarations.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * Per Home and owner: the installations this module holds for, how many running instances hold each, and the newest version among
 * them with what it declares (`null`: that version declares nothing). Several projects run one installation and the last instance
 * out leaves the newest declaration as not running; two installations of one plugin (two publisher signatures) register side by side.
 * What the register holds for an owner beyond these is not this module's.
 */
type Holder = { held: number; version: string; registration: AgentDefinitionRegistration | null };
const holders = new Map<string, Map<string, Holder>>();
let hostOwners: ReadonlySet<string> | undefined;

/**
 * Registers what a definition carries for Agents for as long as the installation runs: the roles and Agent prompts of its Manifest's
 * `agent` block (with `PluginDefinition.agent_prompts`, so the person sees and edits them and a run uses the edit, PG-051), its instructions
 * (`PluginDefinition.instructions`), so the person sees and edits them in “Prompt 与 Character” like every other, and the methods
 * its Manifest declares with their bodies (`PluginDefinition.methods`), so other Agents use them as they use a built-in Plugin's
 * (decision #18, W4-02). Only on a platform that reaches a Home. A sandboxed package registers its instructions the same way
 * (PG-017 P1, V-20). Signed text-only roles and methods are data for another Agent, never execution authority.
 * Returns what withdraws them, once.
 *
 * The register shows an installation's newest running version, whole: one that starts while another project still runs an earlier
 * version replaces the registration, an earlier one starting later does not. A version that declares none of these replaces it with
 * nothing: what the Home remembered for the installation is forgotten. The last instance out leaves the newest declaration as not
 * running: the Home remembers it whole, the person still sees and edits it, it offers other Agents no method; uninstalling forgets it
 * (`forgetPluginAgentDefinitions`, PG-051 Q1 b).
 *
 * This is the one way a plugin's Agent definitions reach the register (PG-051): built-in or installed, a plugin's come with its
 * definition. A definition for an owner the Host registers itself (the assistant, Plugin Builder, Alchemist) is refused, as is one
 * that names an owner other than itself.
 */
export function registerPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string): (() => void) | undefined {
  if (!home) return undefined;
  const instructions = definition.instructions ?? [], bodies = definition.methods ?? [], agent = definition.manifest.agent;
  const carries = instructions.length > 0 || bodies.length > 0 || agent !== undefined;
  const { plugin_id: owner, version } = definition.manifest;
  for (const item of instructions) {
    if (item.owner_id !== owner) throw new Error(`插件 ${owner} 登记的指令 ${item.prompt_id} 属于 ${item.owner_id}：一个插件只能登记自己的指令`);
  }
  const ownerKey = `${path.resolve(home.directory)}\0${owner}`;
  const installs = holders.get(ownerKey) ?? new Map<string, Holder>();
  const holder = installs.get(installId), declarations = agentDeclarationsFor(home.directory);
  // A version that declares nothing and has nothing to replace: no instance of the installation runs, nothing is remembered.
  if (!carries && !holder && !declarations.has(installId, owner)) return undefined;
  // The Host's own owners, not the register's: a remembered declaration of this plugin is in the register too (PG-051 Q1 b).
  hostOwners ??= new Set(builtinRegistrations().map(row => row.owner_id));
  if (hostOwners.has(owner)) throw new Error(`${owner} 的 Agent 定义由平台自己登记，插件定义不能再登记第二个来源`);
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  // Only a newer version replaces what the running instances registered.
  const replaces = !holder || comparePluginVersions(version, holder.version) > 0;
  let current: Holder = holder ? { ...holder, held: holder.held + 1 } : { held: 1, version, registration: null };
  if (replaces) {
    const registration = pluginAgentRegistration(definition);
    if (registration) {
      registry.register(registration, installId);
      declarations.remember(installId, registration);
    } else {
      registry.unregister(owner, installId);
      declarations.forgetOwner(installId, owner);
    }
    current = { ...current, version, registration };
  }
  installs.set(installId, current);
  holders.set(ownerKey, installs);
  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    // What the installation's running instances hold now, not what this one registered: a newer version may have replaced it since.
    const running = holders.get(ownerKey), now = running?.get(installId);
    if (!now) return;
    if (now.held > 1) { running!.set(installId, { ...now, held: now.held - 1 }); return; }
    running!.delete(installId);
    if (running!.size === 0) holders.delete(ownerKey);
    if (!now.registration) return;
    // Kept as not running: the person still sees and edits its prompts; uninstalling forgets it.
    registry.register(notRunning(now.registration), installId);
    declarations.remember(installId, now.registration);
  };
}

/** The one complete projection used by the executor and installed lifecycle callbacks. */
export function pluginAgentRegistration(definition: PluginDefinition, source: AgentDefinitionSource = pluginDefinitionSource(definition)): AgentDefinitionRegistration | null {
  const { plugin_id: owner, agent } = definition.manifest;
  const instructions = definition.instructions ?? [], bodies = definition.methods ?? [];
  if (!agent && !instructions.length && !bodies.length) return null;
  for (const item of instructions) if (item.owner_id !== owner) throw new Error(`插件 ${owner} 不能登记别人的指令`);
  const { methods, notes } = declaredMethods(definition.manifest.methods ?? [], bodies);
  const declared = agent ? agentRegistration(owner, source, agent, definition.agent_prompts ?? [], { prompts: definition.agent_prompt_names }) : { prompts: [], roles: [] };
  if (source.kind === "plugin" && source.publisher_signature) {
    const signedSource = { kind: "plugin" as const, plugin_id: source.plugin_id, plugin_version: source.plugin_version, publisher_signature: source.publisher_signature };
    for (const role of declared.roles) for (const id of role.prompt_ids) {
      const prompt = declared.prompts.find(item => item.prompt_id === id);
      if (prompt) { prompt.default_ref = { source: signedSource, kind: "role", entry_id: role.role_id }; role.purpose = prompt.purpose; }
    }
  }
  return { owner_id: owner, source, prompts: [...declared.prompts, ...instructions.map(item => ({ prompt_id: item.prompt_id, version: item.version,
    kind: "instruction" as const, title: item.title, purpose: item.purpose, used_by: [...item.used_by], body: item.body }))], roles: declared.roles,
    ...(methods.length ? { methods } : {}), ...(notes.length ? { notes } : {}) };
}

/** Provenance comes from the verified definition, never from body text or a consumer's request. */
function pluginDefinitionSource(definition: PluginDefinition): AgentDefinitionSource {
  const { plugin_id, version, name, publisher } = definition.manifest;
  return { kind: "plugin", plugin_id, plugin_version: version, title: name, state: "enabled",
    ...(definition.execution === "sandbox" && publisher.signature.startsWith("ed25519:sha256:") ? { publisher_signature: publisher.signature } : {}) };
}

/** Lifecycle refreshes do not acquire another running instance. Only a verified rollback may replace a newer holder. */
export function updatePluginAgentDefinitions(home: PluginPlatformHome, definition: PluginDefinition, installId: string, state: "enabled" | "disabled", restored = false): void {
  const { plugin_id: owner, version } = definition.manifest, ownerKey = `${path.resolve(home.directory)}\0${owner}`;
  const holder = holders.get(ownerKey)?.get(installId);
  if (holder && comparePluginVersions(version, holder.version) < 0 && !restored) return;
  const registration = pluginAgentRegistration(definition), registry = agentDefinitionsFor(home.directory, builtinRegistrations), declarations = agentDeclarationsFor(home.directory);
  if (holder) { holder.version = version; holder.registration = registration; }
  if (!registration) { registry.unregister(owner, installId); declarations.forgetOwner(installId, owner); return; }
  registry.register(state === "disabled" && !holder?.held ? notRunning(registration) : registration, installId);
  declarations.remember(installId, registration);
}

/** An uninstalled installation's declarations leave the register and the Home (PG-051 Q1 b), unless it still runs somewhere. */
export function forgetPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, installId: string): void {
  if (!home) return;
  const registry = agentDefinitionsFor(home.directory, builtinRegistrations);
  for (const owner of agentDeclarationsFor(home.directory).forget(installId)) {
    if (!holders.get(`${path.resolve(home.directory)}\0${owner}`)?.has(installId)) registry.unregister(owner, installId);
  }
}
