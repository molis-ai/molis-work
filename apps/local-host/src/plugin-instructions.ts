import path from "node:path";
import type { AgentDefinitionRegistration, AgentDefinitionSource } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-plugin-sdk";
import { definitionOrigin } from "@molis-ai/molis-work-plugin-runtime";
import { agentDeclarationsFor, agentDefinitionsFor, agentRegistration, assertInstructionRoles, declaredMethods, instructionRegistration } from "./agent-definitions/agent-definitions.js";
import { notRunning } from "./agent-definitions/agent-declarations.js";
import { builtinRegistrations } from "./agent-definitions/builtin-agents.js";
import type { PluginPlatformHome } from "./home-side.js";
import { registeredBuiltinText } from "./ui-text-provider.js";
import { bindAgentDisplayWords } from "./agent-definitions/display-words.js";

/** An installId identifies a plugin and publisher. Even a version declaring nothing can become the newest one still running. */
type HeldVersion = { version: string; held: number; registration: AgentDefinitionRegistration | null; remember: boolean };
const holders = new Map<string, Map<string, HeldVersion>>();
const installationKey = (home: PluginPlatformHome, installId: string) => `${path.resolve(home.directory)}\0${installId}`;
let hostOwners: ReadonlySet<string> | undefined;

function newestHeld(versions: ReadonlyMap<string, HeldVersion>): HeldVersion | undefined {
  let newest: HeldVersion | undefined;
  for (const row of versions.values()) if (!newest || comparePluginVersions(row.version, newest.version) > 0) newest = row;
  return newest;
}

function publishDeclaration(home: PluginPlatformHome, owner: string, installId: string, registration: AgentDefinitionRegistration | null,
  state: "enabled" | "disabled", remember: boolean): void {
  const registry = homeAgentDefinitions(home.directory);
  if (registration) {
    registry.register(state === "disabled" ? notRunning(registration) : registration, installId);
    if (remember) agentDeclarationsFor(home.directory).remember(installId, registration);
  } else {
    registry.unregister(owner, installId);
    if (remember) agentDeclarationsFor(home.directory).forgetOwner(installId, owner);
  }
}

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
 * definition. A definition for an owner the Host registers itself (the assistant, Plugin Builder) is refused, as is one
 * that names an owner other than itself.
 */
export function registerPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, installId: string,
  projectRecord?: PluginInstanceRecord | null): (() => void) | undefined {
  if (!home) return undefined;
  // A stopped project package is still starting. Its successful enable owns the durable registration.
  const remember = !(definition.execution === "sandbox" && projectRecord?.publisher_trust === "pinned" && projectRecord.state === "disabled");
  const { plugin_id: owner, version } = definition.manifest;
  const registration = pluginAgentRegistration(definition);
  hostOwners ??= new Set(builtinRegistrations().map(row => row.owner_id));
  if (hostOwners.has(owner)) {
    if (!registration) return undefined;
    throw new Error(`${owner} 的 Agent 定义由平台自己登记，插件定义不能再登记第二个来源`);
  }

  const key = installationKey(home, installId);
  const versions = holders.get(key) ?? new Map<string, HeldVersion>();
  const previous = newestHeld(versions);
  const row = versions.get(version) ?? { version, held: 0, registration, remember };
  const takesOver = !previous || comparePluginVersions(version, previous.version) > 0;
  if (takesOver || (previous === row && remember && !row.remember)) {
    // A first, empty declaration needs a projection only when the Home remembers a previous one.
    if (registration || previous || agentDeclarationsFor(home.directory).has(installId, owner)) {
      publishDeclaration(home, owner, installId, row.registration, "enabled", remember);
    }
  }
  row.held++;
  row.remember ||= remember;
  versions.set(version, row);
  holders.set(key, versions);

  let withdrawn = false;
  return () => {
    if (withdrawn) return;
    withdrawn = true;
    if (--row.held > 0) return;
    const wasNewest = newestHeld(versions) === row;
    versions.delete(version);
    if (!versions.size) holders.delete(key);
    if (!wasNewest) return;
    const remaining = newestHeld(versions);
    if (remaining) publishDeclaration(home, owner, installId, remaining.registration, "enabled", remaining.remember);
    else if (row.registration) publishDeclaration(home, owner, installId, row.registration, "disabled", row.remember);
  };
}

/** The Home's register with what ships in the Host already in it: the one plugins register into. */
export const homeAgentDefinitions = (homeDirectory: string) => agentDefinitionsFor(homeDirectory, builtinRegistrations);

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
  const registration: AgentDefinitionRegistration = { owner_id: owner, source, prompts: [...declared.prompts, ...instructions.map(instructionRegistration)], roles: declared.roles,
    ...(methods.length ? { methods } : {}), ...(notes.length ? { notes } : {}) };
  assertInstructionRoles(registration);
  const reader = definition.execution !== "sandbox" && registeredBuiltinText(definitionOrigin(definition).manifest);
  return reader ? bindAgentDisplayWords(registration, reader) : registration;
}

/** Provenance comes from the verified definition, never from body text or a consumer's request. */
function pluginDefinitionSource(definition: PluginDefinition): AgentDefinitionSource {
  const { plugin_id, version, name, publisher } = definition.manifest;
  return { kind: "plugin", plugin_id, plugin_version: version, title: name, state: "enabled",
    ...(definition.execution === "sandbox" && publisher.signature.startsWith("ed25519:sha256:") ? { publisher_signature: publisher.signature } : {}) };
}

/** A lifecycle refresh confirms this version without acquiring a hold. Other projects keep their running versions, even during rollback. */
export function updatePluginAgentDefinitions(home: PluginPlatformHome, definition: PluginDefinition, installId: string, state: "enabled" | "disabled"): void {
  const { plugin_id: owner, version } = definition.manifest;
  const versions = holders.get(installationKey(home, installId));
  if (versions) {
    const row = versions.get(version);
    if (!row) return;
    row.remember = true;
    if (newestHeld(versions) === row) publishDeclaration(home, owner, installId, row.registration, "enabled", true);
  } else {
    publishDeclaration(home, owner, installId, pluginAgentRegistration(definition), state, true);
  }
}

/**
 * A plugin with only declarations (`kind: "content"`) runs no instance whose start and stop hold its Agent definitions (specs/skill-packs/
 * contract-design.md §3): while it is enabled on a Host, the Host holds them in the instance's place (`set`), and lets go when it is switched
 * off, taken off (`release`, before `forgetPluginAgentDefinitions`) or the Host closes (`releaseAll`). As with running instances, the
 * last hold let go leaves its Skills not running, so they are offered only while some Host has the plugin enabled and its package verified.
 */
export function declaredOnlyHolds(home: PluginPlatformHome | null | undefined) {
  const held = new Map<string, { version: string; installId: string; release: () => void }>();
  const release = (pluginId: string) => { const hold = held.get(pluginId); held.delete(pluginId); hold?.release(); };
  return {
    set(definition: PluginDefinition, installId: string, state: "enabled" | "disabled"): void {
      const { plugin_id: pluginId, version, kind } = definition.manifest, holds = state === "enabled" && kind === "content";
      const current = held.get(pluginId);
      if (holds && current?.version === version && current.installId === installId) return;
      // A new version is held before the earlier one is let go, so the Skills are not left not running in between.
      const acquired = holds ? registerPluginAgentDefinitions(home, definition, installId) : undefined;
      release(pluginId);
      if (acquired) held.set(pluginId, { version, installId, release: acquired });
    },
    release,
    releaseAll(): void { for (const pluginId of [...held.keys()]) release(pluginId); },
  };
}

/** An uninstalled installation's declarations leave the register and the Home (PG-051 Q1 b), unless it still runs somewhere. */
export function forgetPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, installId: string): void {
  if (!home || holders.has(installationKey(home, installId))) return;
  const registry = homeAgentDefinitions(home.directory);
  for (const owner of agentDeclarationsFor(home.directory).forget(installId)) {
    registry.unregister(owner, installId);
  }
}
