import { bindActionHandler, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction, type KitReport, type KitReportedEntry, type KitRoleRef, type KitSource, type KitUsage } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentDefinitionRegistration, AgentPromptRegistration, AgentRoleRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { KIT_AGENT_DEFINITIONS_PROVIDER_ID, KIT_READ_PERMISSION } from "@molis-ai/molis-work-contracts/services/kit";
import { ASSISTANT_AGENT, ASSISTANT_ROLE_ID } from "../assistant/assistant-agent.js";
import { HomeConsentLedger } from "../home-plugin-store.js";
import { localPublisherKeyId } from "../plugin-builder/publisher-identity.js";
import { PRODUCT_VERSION } from "../product-version.js";
import type { ProjectPluginHost } from "../project-plugin-ports.js";
import { kitPluginSource, kitPluginWords, scopeInstallations } from "../scope-installations.js";
import { PROMPT_USES_KEPT, type AgentDefinitions } from "./agent-definitions.js";
import { BUILTIN_INLINE_AGENT_ROLES } from "./builtin-instructions.js";
import { promptOverrideActions, promptOverrideHandlers } from "./prompt-overrides.js";
import { builtinRegistrations } from "./builtin-agents.js";
import { homeAgentDefinitions } from "./builtin-registrations.js";
import { agentDisplayModel } from "./display-words.js";
import { textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchDisplayReader, workbenchPlatformText } from "../ui-text-provider.js";

// Prompts and roles as AI kit entries (specs/capability-pack/contract-design.md §4.2, §4.8): each plugin installation's in its own pack,
// the Host's own owners' in Molis Work's, the personal assistant one role there. Read from the register; no body ever leaves it.

export const agentDefinitionsKitReport = defineKitReportAction("agent-definitions.kit.report", /* @version action.agent-definitions.kit.report */ 1,
  "提示词与角色的能力包条目", [KIT_READ_PERMISSION]);

type Common = Pick<KitReportedEntry, "declares" | "scope" | "availability" | "source" | "pack">;
type Placed = { pack: string; source: KitSource; scope: "home" | "project"; available: boolean; tools: (role: AgentRoleRegistration) => string[] };
const ASSISTANT: KitRoleRef = { kind: "assistant" };
function words(locale = workbenchPlatformText.default) {
  const { owner } = workbenchPlatformText, { text } = workbenchDisplayReader(locale);
  return { version: (n: number) => text({ owner, key: "workbench.kit.report-version", args: textArgs({ n }) }),
    assistant: text({ owner, key: "workbench.kit.report-assistant" }), assistantAbout: text({ owner, key: "workbench.kit.report-assistant-about" }),
    prompts: text({ owner, key: "workbench.kit.report-prompts" }), characters: text({ owner, key: "workbench.kit.report-characters" }) };
}

/** The tool names a manifest's role or child role declares (`host_tools`). */
const manifestTools = (agent: AgentManifest | undefined) => (role: AgentRoleRegistration) =>
  [...[...agent?.roles ?? [], ...agent?.subagents?.roles ?? []].find(row => row.role_id === role.role_id)?.host_tools ?? []];

/** One owner's prompts and roles in one pack (ids carry the pack: one plugin may be installed in the Home and the project): a role points at its prompts; an instruction at its `role_id`; the rest are the assistant's. */
function ownerEntries(definitions: AgentDefinitions, owner: AgentDefinitionRegistration, placed: Placed, counts: ReadonlyMap<string, { count: number; last_at: string }>, say: ReturnType<typeof words>, locale?: string): KitReportedEntry[] {
  const display = agentDisplayModel([owner], locale)[owner.owner_id];
  const usage = (keys: string[]): KitUsage => {
    const used = keys.map(key => counts.get(key)).filter(row => row !== undefined).sort((a, b) => b.count - a.count || b.last_at.localeCompare(a.last_at))[0];
    return used ? { kind: "recent", count: used.count, last_at: used.last_at, kept: { rows_per_key: PROMPT_USES_KEPT } } : { kind: "none" };
  };
  const availability = placed.available ? { available: true as const } : { available: false as const, reason: "plugin_disabled" };
  const common: Common = { declares: { tools: [], permissions: [], connector_categories: [] }, scope: placed.scope, availability, source: placed.source, pack: placed.pack };
  const roleRef = (role: AgentRoleRegistration): KitRoleRef => ({ kind: "plugin", owner_id: owner.owner_id, role_id: role.role_id });
  const rolesOf = (prompt: AgentPromptRegistration): KitRoleRef[] => prompt.kind === "instruction"
    ? prompt.role_id ? [{ kind: "plugin", owner_id: owner.owner_id, role_id: prompt.role_id }] : []
    : owner.roles.filter(role => role.prompt_ids.includes(prompt.prompt_id)).map(roleRef);
  const prompts = owner.prompts.map((prompt): KitReportedEntry => {
    const view = definitions.prompt(`${owner.owner_id}/${prompt.prompt_id}`);
    const copy = display?.prompts[prompt.prompt_id];
    return { ...common, kind: "prompt", entry_id: `${placed.pack}/${view.key}`, name: (copy?.title ?? prompt.title).slice(0, 200), description: (copy?.purpose ?? prompt.purpose).slice(0, 2000),
      version: { label: say.version(prompt.version), ...(view.default_updated && view.user ? { change: { kind: "default_updated" as const, base_version: view.user.base_version, default_version: prompt.version } } : {}) },
      where: prompt.used_by.slice(0, 20).map(text => text.slice(0, 200)), usage: usage([view.key]), manage: { href: "/settings/prompts", label: say.prompts },
      export: view.effective === "user" ? "user_data" : "none", ref: { owner_id: owner.owner_id, prompt_id: prompt.prompt_id },
      prompt: { use: prompt.kind, edited: view.effective === "user", roles: owner.owner_id === ASSISTANT_PLUGIN_ID ? [] : rolesOf(prompt) } };
  });
  // The assistant's own roles are one: the personal assistant every role-less prompt hangs under (§4.2).
  const roles = owner.owner_id === ASSISTANT_PLUGIN_ID ? [assistantEntry(owner, common, usage, say)] : owner.roles.map((role): KitReportedEntry => {
    const tools = placed.tools(role).slice(0, 64);
    const copy = display?.roles[role.role_id];
    return { ...common, kind: "role", entry_id: `${placed.pack}/${owner.owner_id}/role:${role.role_id}`, name: (copy?.name ?? role.name).slice(0, 200), description: (copy?.purpose ?? role.purpose).slice(0, 2000),
      version: { label: say.version(role.version) }, declares: { ...common.declares, tools }, where: [], usage: usage(role.prompt_ids.map(id => `${owner.owner_id}/${id}`)),
      manage: { href: "/settings/characters", label: say.characters }, export: "reference", ref: roleRef(role),
      role: { subagent: Boolean(role.subagent), execution: role.execution, host_tools: tools } };
  });
  return [...roles, ...prompts];
}

function assistantEntry(owner: AgentDefinitionRegistration, common: Common, usage: (keys: string[]) => KitUsage, say: ReturnType<typeof words>): KitReportedEntry {
  const tools = [...new Set(ASSISTANT_AGENT.roles.flatMap(role => role.host_tools ?? []))].slice(0, 64);
  return { ...common, kind: "role", entry_id: "assistant", name: say.assistant, description: say.assistantAbout, version: { label: PRODUCT_VERSION },
    declares: { ...common.declares, tools }, where: [], usage: usage(owner.prompts.map(prompt => `${owner.owner_id}/${prompt.prompt_id}`)),
    manage: { href: "/settings/assistant", label: say.assistant }, export: "reference", ref: ASSISTANT,
    role: { subagent: false, execution: ASSISTANT_AGENT.roles.find(role => role.role_id === ASSISTANT_ROLE_ID)?.execution ?? "read-only", host_tools: tools } };
}

/** The register's prompts and roles in the call's scope: each installation's in its pack, the Host's own in Molis Work's. */
export async function agentDefinitionsKitEntries(home: string, source: ProjectPluginHost, caller: ActionCallContext): Promise<KitReport> {
  const definitions = homeAgentDefinitions(home), say = words(caller.locale), counts = definitions.uses.counts();
  const { installations } = await scopeInstallations(source, caller);
  const context = { localKey: localPublisherKeyId(home), pins: new Map(new HomeConsentLedger(home).publishers().map(pin => [pin.key_id, pin])), locale: caller.locale };
  const entries: KitReportedEntry[] = [];
  for (const row of installations) {
    const { record, manifest, scope } = row;
    const owner = definitions.installation(record.plugin_id, record.install_id);
    if (!owner) continue;
    entries.push(...ownerEntries(definitions, owner, { pack: `plugin:${record.install_id}`, source: kitPluginSource(record, manifest, context, kitPluginWords(row, caller.locale).name), scope,
      available: record.state === "running", tools: manifestTools(manifest?.agent) }, counts, say, caller.locale));
  }
  const inline = new Map(BUILTIN_INLINE_AGENT_ROLES.map(row => [`${row.owner_id}\0${row.role.role_id}`, row.host_tools]));
  const registered = new Map(definitions.registrations().map(owner => [owner.owner_id, owner]));
  for (const { owner_id } of builtinRegistrations()) {
    const owner = registered.get(owner_id);
    if (!owner) continue;
    const title = owner.source.title;
    entries.push(...ownerEntries(definitions, owner, { pack: "system:builtin", source: { kind: "system", module: owner_id, title }, scope: "home", available: true,
      tools: role => owner_id === ASSISTANT_PLUGIN_ID ? manifestTools(ASSISTANT_AGENT)(role) : [...inline.get(`${owner_id}\0${role.role_id}`) ?? []] }, counts, say, caller.locale));
  }
  return { entries };
}

/** The register's actions for the person: its AI kit report (`kit:read`), and taking their prompt edits out and back (§4.9). */
export function agentDefinitionsActionProvider(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  return { provider: { provider_id: KIT_AGENT_DEFINITIONS_PROVIDER_ID, title: "提示词与角色", kind: "system" }, definitions: [agentDefinitionsKitReport, ...Object.values(promptOverrideActions)],
    handlers: [bindActionHandler(agentDefinitionsKitReport, (_input, caller) => agentDefinitionsKitEntries(home, source, caller)), ...promptOverrideHandlers(() => homeAgentDefinitions(home))] };
}
