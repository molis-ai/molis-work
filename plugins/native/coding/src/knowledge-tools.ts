import type { ActionExecutionContext, ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { KNOWLEDGE_CATALOG_RELATED, KNOWLEDGE_CATALOG_WHOLE_PIECES, KNOWLEDGE_PROVIDER_ID, knowledgeActions, knowledgeCatalogText, knowledgeCatalogWhole } from "@molis-ai/molis-work-contracts/services/knowledge";

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

type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect">;

/**
 * 「项目资料目录」for a round that carries 「列出项目资料」 (specs/project-knowledge §6.4, PMAT-36): the whole catalog when it is
 * small, otherwise the pieces related to the round's words, titles and briefs only, so the Agent picks what to pull with its
 * tools. Null when the round cannot list knowledge, there is none, or the listing fails: the round goes on without it.
 */
export async function knowledgeCatalogMaterial(actions: Pick<PluginActionClient, "invoke"> | undefined, tools: readonly ExactActionReference[], words: string, sessionId: string, control?: Control): Promise<AgentTextMaterial | null> {
  const list = knowledgeActions.list;
  if (!actions || !tools.some(tool => tool.capability_id === list.capability_id && tool.version === list.version && tool.provider_id === KNOWLEDGE_PROVIDER_ID)) return null;
  try {
    const first = await actions.invoke(list, { limit: KNOWLEDGE_CATALOG_WHOLE_PIECES }, control);
    const whole = knowledgeCatalogWhole(first);
    const pieces = whole ? first.pieces : (await actions.invoke(list, { related_to: words.slice(0, 2000), limit: KNOWLEDGE_CATALOG_RELATED }, control)).pieces;
    if (!pieces.length) return null;
    return { material_id: "knowledge-catalog", source_artifact_id: sessionId, source_version: 1, title: "项目资料目录", text: knowledgeCatalogText({ total: first.total, whole, pieces }) };
  } catch (error) {
    if (control?.signal?.aborted) throw error;
    return null;
  }
}
