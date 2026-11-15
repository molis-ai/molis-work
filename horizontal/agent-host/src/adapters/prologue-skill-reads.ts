import type { AgentRunSkillRead } from "@molis-ai/molis-work-contracts/services/agent-host";
import { SKILLS_PROVIDER_ID, skillCatalogActions, type SkillBodyReadResult } from "@molis-ai/molis-work-contracts/services/skills";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { GATEWAY_TOOLS } from "./prologue-action-gateway.js";
import { agentActionToolName, MOLIS_ACTION_TOOL_PREFIX } from "./prologue-action-tools.js";

const READ = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID };
/** A round's own tool for the catalog read ends with the action's digest whatever pack it was declared in (`agentActionToolName`). */
const DIRECT_SUFFIX = agentActionToolName(READ, "").slice(MOLIS_ACTION_TOOL_PREFIX.length);

/**
 * Whether a tool call is the round reading Skill bodies from the catalog (`skills.body.read` of `system.skills`): its own action tool,
 * or the gateway's read with that exact identity. Told by the call, never by what a result looks like, so no other tool's result can
 * pass for a Skill the round used.
 */
export function isSkillReadCall(name: string, input: Record<string, unknown> | undefined): boolean {
  if (name.startsWith(MOLIS_ACTION_TOOL_PREFIX)) return name.endsWith(DIRECT_SUFFIX);
  return name === GATEWAY_TOOLS.read && input?.provider_id === READ.provider_id && input.capability_id === READ.capability_id;
}

/** The bodies one such call really read: the catalog's own answer, the refused ones left out. A result cut short reads as none. */
export function skillReadsIn(text: string): AgentRunSkillRead[] {
  let results: unknown;
  try { results = (JSON.parse(text) as { results?: unknown }).results; } catch { return []; /* cut at the tool observation limit */ }
  if (!Array.isArray(results)) return [];
  return (results as SkillBodyReadResult[]).flatMap(result => result?.ok === true && result.ref && typeof result.name === "string" ? [{ ref: result.ref, name: result.name }] : []);
}

/** Adds what a call read to the round's list, each Skill once, in the order first read. */
export function rememberSkillReads(held: AgentRunSkillRead[], text: string): void {
  for (const read of skillReadsIn(text)) if (!held.some(entry => skillRefKey(entry.ref) === skillRefKey(read.ref))) held.push(read);
}
