import { isDeepStrictEqual } from "node:util";
import { currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, type ActionCallContext, type ActionClient, type ActionNamedSkills, type ActionSkillRound } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILLS_PROVIDER_ID, SKILLS_READ_PERMISSION, skillCatalogActions, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import type { AgentRoundSkillCatalog, AgentSkillSource } from "@molis-ai/molis-work-service-agent-host";

/**
 * The named list the Host bound to the plugin action this round starts in (specs/capability-pack/contract-design.md §2.3): the routed
 * page envelope or the Host's delegation, read only when its installation and exact action are the running ones, as `original_input`.
 * Any other call (a nested call, another action, another installation, a round's tool call) has none.
 */
export function currentNamedSkills(caller: HostPluginCaller | undefined): { named: ActionNamedSkills; person: ActionCallContext } | undefined {
  const invocation = currentPluginInvocation();
  if (!invocation || !("definition" in invocation) || !caller || invocation.install_id !== caller.install_id) return undefined;
  const named = invocation.caller.named_skills;
  return named && named.install_id === caller.install_id && named.action.capability_id === invocation.definition.capability_id
    && named.action.version === invocation.definition.version ? { named: structuredClone(named), person: invocation.caller } : undefined;
}

/** The starting plugin's own installation as a `SkillRef` names it, from its installation record. */
export function ownSkillSource(record: PluginInstanceRecord): AgentSkillSource {
  return { source: { kind: "plugin", plugin_id: record.plugin_id, plugin_version: record.version, publisher_signature: record.publisher_signature },
    install_id: record.install_id, installation_generation: record.installation_generation };
}

export interface RoundSkillReaders {
  client: ActionClient;
  /** The plugin starting the round, as its own installation calls with its own grants. */
  plugin: ActionCallContext;
  /** The Host's delegation that started this call named these: they are read as the delegating person (§3.1, the one exception). */
  delegated?: { person: ActionCallContext; refs: readonly SkillRef[] };
  named: readonly SkillRef[];
}

/**
 * The shared catalog for one round (§3.1, §3.4). References are read as the plugin unless the Host's own delegation named them; each
 * reader gets one `skills.catalog.list@1` and one `skills.body.read@1` with all its references, so a round asks at most twice of each.
 * `skill_round` is written only on these calls: nothing a plugin or a model sends can carry it.
 */
export function roundSkillCatalog(readers: RoundSkillReaders): AgentRoundSkillCatalog {
  const groups = (refs: readonly SkillRef[]) => {
    const delegated = refs.filter(ref => readers.delegated?.refs.some(named => isDeepStrictEqual(named, ref)));
    const own = refs.filter(ref => !delegated.includes(ref));
    return [...(own.length ? [{ caller: readers.plugin, refs: own }] : []), ...(delegated.length ? [{ caller: readers.delegated!.person, refs: delegated }] : [])];
  };
  const reading = (caller: ActionCallContext, consumer: ActionSkillRound["consumer"]): ActionCallContext => {
    if (caller.audience === "plugin" && !caller.permissions.includes(SKILLS_READ_PERMISSION)) {
      throw new ActionError("actions.forbidden", "这个插件没有获准读技能目录（skills:read），这一轮只能用它自己的技能");
    }
    return { ...caller, skill_round: { consumer, named: structuredClone(readers.named) },
      allowed_actions: [skillCatalogActions.list, skillCatalogActions.readBodies].map(action => ({ capability_id: action.capability_id, version: action.version, provider_id: SKILLS_PROVIDER_ID })) };
  };
  const list = { capability_id: skillCatalogActions.list.capability_id, version: skillCatalogActions.list.version };
  const read = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version };
  return {
    named: readers.named,
    list: async (consumer, refs) => (await Promise.all(groups(refs).map(async group =>
      (await readers.client.invoke(reading(group.caller, consumer), list, {}) as { skills: SkillCatalogEntry[] }).skills))).flat(),
    readBodies: async (consumer, refs) => (await Promise.all(groups(refs).map(async group =>
      (await readers.client.invoke(reading(group.caller, consumer), read, { refs: group.refs }) as { results: SkillBodyReadResult[] }).results))).flat(),
  };
}
