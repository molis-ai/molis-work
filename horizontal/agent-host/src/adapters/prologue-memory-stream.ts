import type { PrologueEvent, PrologueStreamState } from "./prologue-stream.js";

/** Retrieval and final dispatch are separate facts; all three reading strategies retain their receipts. */
export function applyMemoryRecalled(state: PrologueStreamState, event: PrologueEvent, _at: string | null): boolean {
  const recalled = event as Extract<PrologueEvent, { type: "memory-recalled" }>;
  const previous = state.memory_recalled;
  const retrieval = recalled.retrieval, cost = retrieval?.cost;
  const unique = (items: Array<{ memory_id: string; version: number }>) => [...new Map(items.map(item => [`${item.memory_id}:${item.version}`, item])).values()];
  state.memory_recalled = { ...previous, method: recalled.method === "recall" ? "recall" : "pinned",
    injected: previous?.injected ?? [],
    selected: unique([...(previous?.selected ?? []), ...(recalled.injected ?? []).map(one => ({ memory_id: one.id, version: one.version }))]),
    omitted: unique([...(previous?.omitted ?? []), ...(recalled.omitted ?? []).map(one => ({ memory_id: one.id, version: one.version }))]),
    unavailable: [...new Set([...(previous?.unavailable ?? []), ...(recalled.unavailable ?? [])])],
    retrievals: [...(previous?.retrievals ?? []), ...(retrieval ? [{ receipt_id: retrieval.receiptId, outcome: retrieval.outcome,
      ...(retrieval.errorCode !== undefined ? { error_code: retrieval.errorCode } : {}),
      ...(retrieval.attempts !== undefined ? { attempts: retrieval.attempts.map(attempt => ({ algorithm: attempt.algorithm, outcome: attempt.outcome,
        ...(attempt.fallbackFrom !== undefined ? { fallback_from: attempt.fallbackFrom } : {}),
        ...(attempt.errorCode !== undefined ? { error_code: attempt.errorCode } : {}) })) } : {}),
      ...(cost !== undefined ? { cost: { recaller_calls: cost.recallerCalls,
        ...(cost.recallerUsage !== undefined ? { recaller_usage: {
          ...(cost.recallerUsage.inputTokens !== undefined ? { input_tokens: cost.recallerUsage.inputTokens } : {}),
          ...(cost.recallerUsage.outputTokens !== undefined ? { output_tokens: cost.recallerUsage.outputTokens } : {}),
          ...(cost.recallerUsage.cachedInputTokens !== undefined ? { cached_input_tokens: cost.recallerUsage.cachedInputTokens } : {}),
        } } : {}),
        directory_entries: cost.directoryEntries, directory_enumerations: cost.directoryEnumerations, directory_traversal: cost.directoryTraversal,
        metadata_reads: cost.metadataReads, body_reads: cost.bodyReads, records_scanned: cost.recordsScanned,
        candidates_exposed: cost.candidatesExposed, elapsed_ms: cost.elapsedMs, complete: cost.complete } } : {}) }] : [])] };
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
