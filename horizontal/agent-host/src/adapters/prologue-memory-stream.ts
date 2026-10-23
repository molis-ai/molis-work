import type { PrologueEvent, PrologueStreamState } from "./prologue-stream.js";

/** Retrieval and final dispatch are separate facts; all three reading strategies retain their receipts. */
export function applyMemoryRecalled(state: PrologueStreamState, event: PrologueEvent, _at: string | null): boolean {
  const recalled = event as Extract<PrologueEvent, { type: "memory-recalled" }>;
  const previous = state.memory_recalled;
  const unique = (items: Array<{ memory_id: string; version: number }>) => [...new Map(items.map(item => [`${item.memory_id}:${item.version}`, item])).values()];
  state.memory_recalled = { ...previous, method: recalled.method === "recall" ? "recall" : "pinned",
    injected: previous?.injected ?? [],
    selected: unique([...(previous?.selected ?? []), ...(recalled.injected ?? []).map(one => ({ memory_id: one.id, version: one.version }))]),
    omitted: unique([...(previous?.omitted ?? []), ...(recalled.omitted ?? []).map(one => ({ memory_id: one.id, version: one.version }))]),
    unavailable: [...new Set([...(previous?.unavailable ?? []), ...(recalled.unavailable ?? [])])],
    retrievals: [...(previous?.retrievals ?? []), ...(recalled.retrieval ? [{ receipt_id: recalled.retrieval.receiptId, outcome: recalled.retrieval.outcome,
      ...(recalled.retrieval.errorCode ? { error_code: recalled.retrieval.errorCode } : {}) }] : [])] };
  return true;
}

export function applyMemoryContext(state: PrologueStreamState, event: PrologueEvent, _at: string | null): boolean {
  const context = event as Extract<PrologueEvent, { type: "memory-context" }>;
  const previous = state.memory_recalled ?? { method: "recall" as const, injected: [], omitted: [], unavailable: [], selected: [], retrievals: [] };
  const projected = { call_id: context.callId, status: context.status, tokens: context.tokens, budget_tokens: context.budgetTokens, basis: context.basis,
    references: context.references.map(one => ({ receipt_id: one.receiptId, memory_id: one.id, version: one.version })),
    parts: context.parts.map(one => ({ ...one })) };
  const contexts = [...(previous.contexts ?? []).filter(one => one.call_id !== projected.call_id), projected];
  const dispatched = contexts.filter(one => one.status === "dispatched-or-unknown" || one.status === "response-observed").flatMap(one => one.references);
  state.memory_recalled = { ...previous, contexts,
    injected: [...new Map(dispatched.map(({ memory_id, version }) => [`${memory_id}:${version}`, { memory_id, version }])).values()] };
  return true;
}
