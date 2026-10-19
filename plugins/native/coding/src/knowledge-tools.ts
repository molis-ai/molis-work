import type { ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";

const key = (ref: ExactActionReference) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id]);

/**
 * The tools a round carries: the person's own picks, plus project knowledge (specs/project-knowledge, open to the built-in
 * Agent by default, the person's 2026-10-19 decision). Only knowledge the directory offers this plugin's Agent now is added,
 * so a knowledge action the person revoked in 对外接入, or one outside the round's Character, is simply not there.
 */
export function withKnowledgeTools(chosen: readonly ExactActionReference[], offered: readonly ActionView[], character?: readonly ExactActionReference[] | null): ExactActionReference[] {
  const tools = [...chosen], have = new Set(chosen.map(key));
  for (const view of offered) {
    if (view.provider.provider_id !== KNOWLEDGE_PROVIDER_ID || !view.availability.available || !view.action.audiences.includes("agent")) continue;
    const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    if (have.has(key(ref)) || (character && !character.some(allowed => key(allowed) === key(ref)))) continue;
    have.add(key(ref));
    tools.push(ref);
  }
  return tools;
}
