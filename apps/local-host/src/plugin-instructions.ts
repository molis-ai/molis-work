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
type Hold = { pendingGeneration?: string };
type HeldVersion = { version: string; holds: Set<Hold>; registration: AgentDefinitionRegistration | null };
type Installation = { owner: string; versions: Map<string, HeldVersion>; remembered?: HeldVersion };
const holders = new Map<string, Installation>();
const installationKey = (home: PluginPlatformHome, installId: string) => `${path.resolve(home.directory)}\0${installId}`;
let hostOwners: ReadonlySet<string> | undefined;

function newerThan(row: HeldVersion, previous: HeldVersion | undefined): boolean {
  return !previous || comparePluginVersions(row.version, previous.version) > 0;
}

function newestHeld(installation: Installation): HeldVersion | undefined {
  let newest: HeldVersion | undefined;
  for (const row of installation.versions.values()) {
    const running = [...row.holds].some(hold => hold.pendingGeneration === undefined);
    if (running && newerThan(row, newest)) newest = row;
  }
  return newest;
}

function showDeclaration(home: PluginPlatformHome, owner: string, installId: string, registration: AgentDefinitionRegistration | null): void {
  const registry = homeAgentDefinitions(home.directory);
  if (registration) registry.register(registration, installId);
  else registry.unregister(owner, installId);
}

function rememberDeclaration(home: PluginPlatformHome, owner: string, installId: string, registration: AgentDefinitionRegistration | null): void {
  const declarations = agentDeclarationsFor(home.directory);
  if (registration) declarations.remember(installId, registration);
  else if (declarations.has(installId, owner)) declarations.forgetOwner(installId, owner);
}

function rememberHeld(home: PluginPlatformHome, installId: string, installation: Installation, row: HeldVersion): void {
  if (installation.remembered === row) return;
  rememberDeclaration(home, installation.owner, installId, row.registration);
  installation.remembered = row;
}

/** Validate the incoming registration before remembering it. A rejected start returns the register to its previous view. */
function activateHeld(home: PluginPlatformHome, installId: string, installation: Installation, row: HeldVersion): void {
  if (!row.registration && !installation.remembered && !agentDeclarationsFor(home.directory).has(installId, installation.owner)) {
    installation.remembered = row;
    return;
  }
  const previous = homeAgentDefinitions(home.directory).installation(installation.owner, installId);
  showDeclaration(home, installation.owner, installId, row.registration);
  try { rememberHeld(home, installId, installation, row); }
  catch (error) { showDeclaration(home, installation.owner, installId, previous ?? null); throw error; }
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
  // A disabled project package stays invisible until its own installation generation finishes enabling.
  const hold: Hold = definition.execution === "sandbox" && projectRecord?.publisher_trust === "pinned" && projectRecord.state === "disabled"
    ? { pendingGeneration: projectRecord.installation_generation } : {};
  const { plugin_id: owner, version } = definition.manifest;
  const registration = pluginAgentRegistration(definition);
  hostOwners ??= new Set(builtinRegistrations().map(row => row.owner_id));
  if (hostOwners.has(owner)) {
    if (!registration) return undefined;
    throw new Error(`${owner} 的 Agent 定义由平台自己登记，插件定义不能再登记第二个来源`);
  }

  const key = installationKey(home, installId);
  const installation = holders.get(key) ?? { owner, versions: new Map<string, HeldVersion>() };
  const previous = newestHeld(installation);
  const row = installation.versions.get(version) ?? { version, holds: new Set<Hold>(), registration };
  if (hold.pendingGeneration === undefined && newerThan(row, previous)) activateHeld(home, installId, installation, row);
  row.holds.add(hold);
  installation.versions.set(version, row);
  holders.set(key, installation);

  return () => {
    const before = newestHeld(installation);
    if (!row.holds.delete(hold)) return;
    if (!row.holds.size) installation.versions.delete(version);
    if (!installation.versions.size) holders.delete(key);
    const remaining = newestHeld(installation);
    if (before !== row || remaining === before) return;
    // The departing instance has stopped even when the durable write fails. Uninstall retries the surviving declaration.
    if (remaining) showDeclaration(home, owner, installId, remaining.registration);
    else if (row.registration) showDeclaration(home, owner, installId, notRunning(row.registration));
    rememberHeld(home, installId, installation, remaining ?? row);
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
export function updatePluginAgentDefinitions(home: PluginPlatformHome, definition: PluginDefinition, installId: string, state: "enabled" | "disabled", generation?: string): void {
  const { plugin_id: owner, version } = definition.manifest;
  const installation = holders.get(installationKey(home, installId));
  if (installation) {
    const row = installation.versions.get(version);
    if (!row || state !== "enabled") return;
    const before = newestHeld(installation);
    const pending = generation ? [...row.holds].filter(hold => hold.pendingGeneration === generation) : [];
    if (pending.length && newerThan(row, before)) activateHeld(home, installId, installation, row);
    for (const hold of pending) delete hold.pendingGeneration;
    if (before === row) rememberHeld(home, installId, installation, row);
  } else {
    const registration = pluginAgentRegistration(definition);
    showDeclaration(home, owner, installId, registration && state === "disabled" ? notRunning(registration) : registration);
    rememberDeclaration(home, owner, installId, registration);
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
      if (acquired) held.set(pluginId, { version, installId, release: acquired });
      else held.delete(pluginId);
      current?.release();
    },
    release,
    releaseAll(): void { for (const pluginId of [...held.keys()]) release(pluginId); },
  };
}

/** An uninstalled installation's declarations leave the register and the Home (PG-051 Q1 b), unless it still runs somewhere. */
export function forgetPluginAgentDefinitions(home: PluginPlatformHome | null | undefined, installId: string): void {
  if (!home) return;
  const installation = holders.get(installationKey(home, installId));
  if (installation) {
    const remaining = newestHeld(installation);
    if (remaining) rememberHeld(home, installId, installation, remaining);
    return;
  }
  const registry = homeAgentDefinitions(home.directory);
  for (const owner of agentDeclarationsFor(home.directory).forget(installId)) {
    registry.unregister(owner, installId);
  }
}
