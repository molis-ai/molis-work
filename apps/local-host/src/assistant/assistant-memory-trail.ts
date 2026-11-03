import type { AgentMemoryRecallFact } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantRound, AssistantRoundMemory } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";

/** Display only visible identities; current text must never impersonate an earlier injected version. */
export function assistantMemoryTrail(fact: AgentMemoryRecallFact, items: ReadonlyMap<string, MemoryItem>): AssistantRound["memories_used"] {
  const view = (ref: { memory_id: string; version: number }): AssistantRoundMemory | null => {
    const item = items.get(ref.memory_id);
    if (!item) return null;
    return { memory_id: item.memory_id, version: ref.version, scope: item.scope,
      text: item.version === ref.version ? item.text : "", origin: item.version === ref.version ? item.origin : "",
      ...(item.version === ref.version ? {} : { content_changed: true }) };
  };
  const used = new Map<string, AssistantRoundMemory>(), uncertain = new Map<string, AssistantRoundMemory>();
  for (const context of fact.contexts ?? []) {
    if (context.status !== "response-observed" && context.status !== "dispatched-or-unknown") continue;
    for (const ref of context.references) {
      const item = view(ref), key = JSON.stringify([ref.memory_id, ref.version]);
      if (item) (context.status === "response-observed" ? used : uncertain).set(key, item);
    }
  }
  for (const key of used.keys()) uncertain.delete(key);
  const omitted = fact.omitted.flatMap(ref => { const item = view(ref); return item ? [{ ...item, reason: "budget" as const }] : []; });
  const unverified = !fact.contexts && (fact.injected.length > 0 || (fact.selected?.length ?? 0) > 0);
  if (!used.size && !uncertain.size && !omitted.length && !unverified && !fact.recording_error) return undefined;
  return { used: [...used.values()], omitted, ...(uncertain.size ? { uncertain: [...uncertain.values()] } : {}),
    ...(unverified ? { unverified: true } : {}), ...(fact.recording_error ? { recording_error: fact.recording_error } : {}) };
}
