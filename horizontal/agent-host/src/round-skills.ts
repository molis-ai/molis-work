import { ActionError, type ActionSkillRound } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAX_SKILL_BODY_CHARS, type AgentManifest, type AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { agentBodyIn } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { AgentRoundSkill } from "@molis-ai/molis-work-contracts/services/agent-host";
import { SKILL_BODY_READ_MAX_REFS, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { agentErrors } from "./errors.js";

/**
 * The shared Skill catalog for one round, bound by the Host (`system.skills`, specs/capability-pack/contract-design.md §3.1). The Host
 * reads it as the plugin starting the round, except the references its own delegation named, which it reads as the delegating person;
 * each reader is asked at most once per call, and the round calls `list` and `readBodies` once each, never per reference (§3.4).
 */
export interface AgentRoundSkillCatalog {
  /** The round's frozen named list (`ActionCallContext.skill_round.named`): what `frozen.skills[].named` records. */
  readonly named: readonly SkillRef[];
  list(consumer: ActionSkillRound["consumer"], refs: readonly SkillRef[]): Promise<SkillCatalogEntry[]>;
  readBodies(consumer: ActionSkillRound["consumer"], refs: readonly SkillRef[]): Promise<SkillBodyReadResult[]>;
}

/** The parts of a `SkillRef` that name an installation: the starting plugin's own one, as the Host read it from the installation record. */
export type AgentSkillSource = Pick<SkillRef, "source" | "install_id" | "installation_generation">;

const sameSource = (ref: SkillRef, own: AgentSkillSource | undefined) => own !== undefined && ref.install_id === own.install_id
  && ref.installation_generation === own.installation_generation && ref.source.kind === own.source.kind && ref.source.plugin_id === own.source.plugin_id
  && ref.source.plugin_version === own.source.plugin_version && ref.source.publisher_signature === own.source.publisher_signature;

export interface RoundSkillsInput {
  selected: readonly SkillRef[];
  manifest: AgentManifest;
  /** The starting plugin's own Skill bodies, as its installation registered them. */
  own: readonly AgentSkillDefinition[];
  locale?: string;
  source: AgentSkillSource | undefined;
  catalog: AgentRoundSkillCatalog | undefined;
  consumer: ActionSkillRound["consumer"];
  hostTools: readonly string[];
  /** The Runtime reports Skills as unsupported: no Skill can be frozen. */
  unsupported: boolean;
}

/**
 * Freezes a round's Skills (§3.1, §3.2): the plugin's own `agent.skills` from its registered bodies, the rest from the shared catalog in
 * one read. Every reference resolves or the round does not start; nothing is skipped and no other version is read (SKP-07). An own
 * Skill's `tools` must stay within the role's `host_tools`; a catalog Skill's `tools` only describe it, so they are never compared here
 * and never widen the role (the adapter registers only what the role has).
 */
export async function freezeRoundSkills(input: RoundSkillsInput): Promise<AgentRoundSkill[]> {
  const { selected } = input;
  const keys = selected.map(skillRefKey);
  if (selected.length > SKILL_BODY_READ_MAX_REFS || new Set(keys).size !== keys.length) throw agentErrors.capability_unavailable("技能选择重复或超过数量限制");
  if (!selected.length) return [];
  if (input.unsupported) throw agentErrors.capability_unavailable("当前运行时不能使用技能");
  const named = new Set((input.catalog?.named ?? []).map(skillRefKey));
  const own = selected.filter(ref => sameSource(ref, input.source) && input.manifest.skills?.some(skill => skill.skill_id === ref.skill_id && skill.version === ref.version));
  const shared = selected.filter(ref => !own.includes(ref));
  const frozenOwn = own.map(ref => ownSkill(ref, input, named.has(skillRefKey(ref))));
  const frozenShared = shared.length ? await catalogSkills(shared, input, named) : [];
  // The order the plugin chose them in is the order the round reads them.
  const byKey = new Map([...frozenOwn, ...frozenShared].map(skill => [skillRefKey(skill.ref), skill]));
  return keys.map(key => byKey.get(key)!);
}

function ownSkill(ref: SkillRef, input: RoundSkillsInput, named: boolean): AgentRoundSkill {
  const declared = input.manifest.skills!.find(skill => skill.skill_id === ref.skill_id && skill.version === ref.version)!;
  const definition = input.own.find(skill => skill.skill_id === ref.skill_id && skill.version === ref.version);
  const body = definition && agentBodyIn(definition, input.locale);
  if (!body?.trim() || !definition) throw agentErrors.capability_unavailable("这个技能版本不可用，请重新选择");
  if (body.length > MAX_SKILL_BODY_CHARS || JSON.stringify(definition.tools) !== JSON.stringify(declared.tools)) {
    throw agentErrors.capability_unavailable("技能正文或工具声明与发布版本不一致");
  }
  if (declared.tools.some(tool => !input.hostTools.includes(tool))) {
    throw agentErrors.role_execution_exceeded(`技能“${declared.name}”需要当前执行方式未开放的工具，请更换方式或取消选择`);
  }
  return { ref: structuredClone(ref), origin: "own", name: declared.name, tools: [...declared.tools], named, body };
}

async function catalogSkills(refs: readonly SkillRef[], input: RoundSkillsInput, named: ReadonlySet<string>): Promise<AgentRoundSkill[]> {
  const catalog = input.catalog;
  if (!catalog) throw agentErrors.capability_unavailable("这一轮不能读技能目录，只能用插件自己的技能");
  const [entries, bodies] = await readCatalog(() => Promise.all([catalog.list(input.consumer, refs), catalog.readBodies(input.consumer, refs)]));
  const entryOf = new Map(entries.map(entry => [skillRefKey(entry.ref), entry]));
  const bodyOf = new Map(bodies.map(result => [skillRefKey(result.ref), result]));
  return refs.map(ref => {
    const key = skillRefKey(ref), entry = entryOf.get(key), result = bodyOf.get(key);
    const name = entry?.name ?? ref.skill_id;
    if (!result || !result.ok) throw agentErrors.capability_unavailable(`技能“${name}”现在不能用（${result?.reason ?? "not_current"}），请重新选择`);
    // The body read checked this reference against the catalog; a list without it means the catalog changed between the two reads.
    if (!entry) throw agentErrors.capability_unavailable(`技能“${name}”现在不能用（not_current），请重新选择`);
    return { ref: structuredClone(ref), origin: "catalog", name: entry.name, tools: [...entry.tools], named: named.has(key), body: result.body };
  });
}

/** A refused catalog read refuses the round in its own words; a cancelled call stays cancelled. */
async function readCatalog<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (error instanceof ActionError && error.code === "actions.cancelled") throw error;
    throw agentErrors.capability_unavailable(`读不了技能目录：${error instanceof Error ? error.message : String(error)}`);
  }
}
