import type { MemoryExtractor, MemoryFormationInput, MemoryFormationResult } from "@prologue/sdk";
import type { AgentMemoryCaller, AgentMemoryExtractor, AgentMemoryFormationContext, AgentMemoryFormationInput,
  AgentMemoryFormationResult, AgentMemoryFormationSlot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { PrologueEffects } from "./prologue-effects.js";
import { fromSdkMemoryMeta, sourceSnapshotView, toSdkMemoryMeta } from "./prologue-memory-values.js";

/** SDK formation remains the sole candidate writer. This boundary only translates the App's fixed command. */
export const formationInput = (input: AgentMemoryFormationInput): MemoryFormationInput => input.trigger === "none"
  ? { operationId: input.operation_id, trigger: "none", ...(input.signal ? { signal: input.signal } : {}) }
  : ({ operationId: input.operation_id, trigger: input.trigger,
  ...(input.signal ? { signal: input.signal } : {}),
  ...(input.sources ? { sources: input.sources.map(source => ({ eventId: source.event_id, version: source.version })) } : {}),
  ...(input.slots ? { slots: input.slots.map(slot => ({ id: slot.id, scope: slot.scope, owner: slot.owner, origin: slot.origin,
    meta: toSdkMemoryMeta(slot.meta), ...(slot.replacement ? { replacement: { ref: { kind: "memory" as const, id: slot.replacement.memory_id, revision: 1 },
      expectedVersion: slot.replacement.expected_version } } : {}) })) } : {}),
});
export const formationView = (result: MemoryFormationResult): AgentMemoryFormationResult => ({ operation_id: result.operationId, outcome: result.outcome,
  items: result.items.map(item => ({ slot_id: item.slotId, outcome: item.outcome,
    ...(item.candidate ? { candidate: { candidate_id: item.candidate.ref.id, version: item.candidate.version } } : {}),
    ...(item.code === undefined ? {} : { code: item.code }) })),
  extraction: { calls: result.extraction.calls, ...(result.extraction.usage ? { usage: {
    ...(result.extraction.usage.inputTokens === undefined ? {} : { input_tokens: result.extraction.usage.inputTokens }),
    ...(result.extraction.usage.outputTokens === undefined ? {} : { output_tokens: result.extraction.usage.outputTokens }),
    ...(result.extraction.usage.cachedInputTokens === undefined ? {} : { cached_input_tokens: result.extraction.usage.cachedInputTokens }),
  } } : {}) }, ...(result.code === undefined ? {} : { code: result.code }),
});

/** A per-call ALS snapshot accompanies the extractor without entering the SDK's sources or persistent storage. */
export function prologueMemoryExtractor(extractor: AgentMemoryExtractor,
  current: () => { caller: AgentMemoryCaller; formation?: AgentMemoryFormationContext; validateContext?: () => Promise<void> } | undefined,
  effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">): MemoryExtractor {
  const extract = extractor.extract.bind(extractor);
  return { async extract(input) {
    const bound = current();
    if (!bound) throw agentErrors.capability_unavailable("记忆提炼缺少可信调用方");
    const beforeDispatch = async () => {
      await effects.beforeEffect(); await bound.validateContext?.();
      effects.assertCurrent(); input.signal.throwIfAborted();
    };
    await beforeDispatch();
    const result = await extract(structuredClone(bound.caller), { operation_id: input.operationId, trigger: input.trigger,
      sources: input.sources.map(sourceSnapshotView), slots: input.slots.map(slot => ({ id: slot.id, scope: slot.scope as AgentMemoryFormationSlot["scope"],
        owner: slot.owner, origin: slot.origin, meta: fromSdkMemoryMeta(slot.meta),
        ...(slot.replacement ? { replacement: { memory_id: slot.replacement.ref.id, expected_version: slot.replacement.expectedVersion } } : {}) })),
      ...(bound.formation ? { context: structuredClone(bound.formation) } : {}), signal: input.signal, before_dispatch: beforeDispatch,
      limits: { max_sources: input.limits.maxSources, max_slots: input.limits.maxSlots, max_drafts: input.limits.maxDrafts,
        max_source_chars: input.limits.maxSourceChars, max_draft_chars: input.limits.maxDraftChars, timeout_ms: input.limits.timeoutMs } });
    // Return reported use before the SDK's source/grant and Host commit guards decide whether drafts may be saved.
    return { drafts: result.drafts.map(draft => ({ slotId: draft.slot_id, text: draft.text,
      ...(draft.applies_when ? { appliesWhen: { task: draft.applies_when.task } } : {}),
      ...(draft.suggested_basis === undefined ? {} : { suggestedBasis: draft.suggested_basis }),
      evidence: draft.evidence.map(item => ({ source: { eventId: item.source.event_id, version: item.source.version }, quote: item.quote })) })),
      ...(result.usage ? { usage: { ...(result.usage.input_tokens === undefined ? {} : { inputTokens: result.usage.input_tokens }),
        ...(result.usage.output_tokens === undefined ? {} : { outputTokens: result.usage.output_tokens }),
        ...(result.usage.cached_input_tokens === undefined ? {} : { cachedInputTokens: result.usage.cached_input_tokens }) } } : {}) };
  } };
}
