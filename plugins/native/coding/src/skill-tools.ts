import type { ActionExecutionContext, ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentBodyIn } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginActionClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { SKILLS_PROVIDER_ID, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import readNativeMarkdown from "./native-markdown.js";

const key = (ref: ExactActionReference) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id]);
const readBodies = skillCatalogActions.readBodies;
const catalogInstructions = readNativeMarkdown("prompts", "coding.auto-skill-catalog", ["en"]);
/** Below the 20,000-character material budget, so the instruction always fits beside the list. */
const LISTED_MAX_CHARS = 18_000;

/**
 * The read tool a round carries when it has automatic Skills to offer (SKP-10): `skills.body.read@1`, offered as the exact catalog action. It is
 * added only when the round has at least one automatic Skill and within the Character's tools when one is chosen; a tool the Character never
 * had is simply not there. The Host still reads the round's directory at start (`frozenActions`) with the round's `skill_round`, so a Host
 * without this action refuses the round there rather than the model finding a dead tool. The Host writes `skill_round` on the calls this tool
 * makes, so an automatic Skill's body is readable and an unnamed `manual` one stays `not_named`.
 */
export function withSkillTools(chosen: readonly ExactActionReference[], offered: readonly ActionView[], character: readonly ExactActionReference[] | null | undefined,
  offer: boolean): ExactActionReference[] {
  if (!offer) return [...chosen];
  // The plugin's own directory listing is no round yet (no `skill_round`), so it does not show the catalog's reads; take the exact action the
  // contract names instead, preferring the version the Host offers when that listing does show it.
  const listed = offered.find(view => view.provider.provider_id === SKILLS_PROVIDER_ID && view.capability_id === readBodies.capability_id);
  const ref = listed ? { capability_id: listed.capability_id, version: listed.version, provider_id: listed.provider.provider_id }
    : { capability_id: readBodies.capability_id, version: readBodies.version, provider_id: SKILLS_PROVIDER_ID };
  const tools = [...chosen];
  if (tools.some(tool => key(tool) === key(ref)) || (character && !character.some(allowed => key(allowed) === key(ref)))) return tools;
  tools.push(ref);
  return tools;
}

type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect">;

/**
 * The Skills set to 「自动」 for Coding in this scope, one catalog listing per round (SKP-10). Read as this installation with its own
 * `skills:read`; only the metadata, never a body. A host without the catalog, or one that refuses this listing, offers none: the round goes
 * on without automatic Skills rather than failing, as project knowledge does. A cancelled call still stays cancelled.
 */
export async function autoSkillsOf(actions: Pick<PluginActionClient, "invoke"> | undefined, control?: Control): Promise<SkillCatalogEntry[]> {
  if (!actions) return [];
  try {
    const listed = await actions.invoke(skillCatalogActions.list, { applies_to: "coding", states: ["auto"] }, control);
    return listed.skills.filter(entry => entry.availability.available);
  } catch (error) {
    if (control?.signal?.aborted) throw error;
    return [];
  }
}

/**
 * 「可自动使用的技能」for one round (SKP-10): the name, description, when-to-use and exact reference of every automatic Skill the round can
 * read, and how to read one with the round's tool. Skills the person named or chose this round are left out: their bodies already travel with
 * it and are the ones to follow. Null when the round carries no read tool or has nothing to offer, so nothing is said or added then.
 */
export function autoSkillMaterial(entries: readonly SkillCatalogEntry[], tools: readonly ExactActionReference[], selected: readonly SkillRef[], locale?: string): AgentTextMaterial | null {
  if (!tools.some(tool => key(tool) === key({ capability_id: readBodies.capability_id, version: readBodies.version, provider_id: SKILLS_PROVIDER_ID }))) return null;
  const chosen = new Set(selected.map(skillRefKey)), listed: object[] = [];
  for (const entry of entries) {
    if (chosen.has(skillRefKey(entry.ref))) continue;
    const row = { ref: entry.ref, name: entry.name, description: entry.description, ...(entry.when_to_use ? { when_to_use: entry.when_to_use } : {}) };
    if (JSON.stringify([...listed, row]).length > LISTED_MAX_CHARS) break;
    listed.push(row);
  }
  if (!listed.length) return null;
  const markdown = agentBodyIn(catalogInstructions, locale).replace(/^---\nversion: \d+\n---\n\n/u, "");
  const [title, ...instructions] = markdown.split("\n");
  return { material_id: "coding-auto-skills", title: title!, text: [...instructions, "", JSON.stringify(listed)].join("\n").trimStart() };
}
