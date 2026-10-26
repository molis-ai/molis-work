import type { MemoryCallerContext, MemoryPromotionIdentity, MemoryPromotionLatch, MemoryPromotionPendingError } from "@prologue/sdk";
import type { AgentMemoryCaller, AgentMemoryPromotion, AgentMemoryPromotionIdentity, AgentMemoryPromotionPendingError } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { candidateView, fromSdkMemoryMeta, memoryView, sourceSnapshotView } from "./prologue-memory-values.js";
import type { PrologueEffects } from "./prologue-effects.js";

const identity = (input: MemoryPromotionIdentity): AgentMemoryPromotionIdentity => ({ operation_id: input.operationId,
  candidate: { candidate_id: input.candidate.ref.id, version: input.candidate.version }, policy: input.policy, version: input.version });

/** Only converts the existing SDK policy/journal protocol; no policy, journal or operation state lives here. */
export function prologueMemoryPromotion(promotion: AgentMemoryPromotion,
  callerFor: (context?: MemoryCallerContext) => Promise<AgentMemoryCaller | undefined>,
  effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">): MemoryPromotionLatch {
  if (typeof promotion.decide !== "function" || typeof promotion.undo?.prepare !== "function" || typeof promotion.undo?.record !== "function") {
    throw agentErrors.capability_unavailable("记忆晋升需要完整策略与撤销记录主人");
  }
  const decide = promotion.decide.bind(promotion), prepare = promotion.undo.prepare.bind(promotion.undo), record = promotion.undo.record.bind(promotion.undo);
  const caller = async (context?: MemoryCallerContext) => {
    const bound = await callerFor(context);
    if (!bound) throw agentErrors.capability_unavailable("记忆晋升缺少可信调用方");
    // Callback code receives a separate projection, never the ALS binding itself.
    return structuredClone(bound);
  };
  return {
    policy: promotion.policy, version: promotion.version,
    async decide(input) {
      return decide(await caller(input.context), { ...identity(input), proposed: candidateView(input.proposed),
        sources: input.sources.map(sourceSnapshotView), desired: { kind: input.desired.kind, change: { text: input.desired.change.text,
          ...(input.desired.change.origin === undefined ? {} : { origin: input.desired.change.origin }),
          ...(input.desired.change.meta === undefined ? {} : { meta: fromSdkMemoryMeta(input.desired.change.meta) }) },
          ...(input.desired.target ? { target: { memory_id: input.desired.target.ref.id, expected_version: input.desired.target.expectedVersion } } : {}) },
        ...(input.signal ? { signal: input.signal } : {}) });
    },
    undo: {
      async prepare(input) {
        const who = await caller();
        await effects.beforeEffect(); effects.assertCurrent();
        input.signal?.throwIfAborted();
        return prepare(who, { ...identity(input), after: memoryView(input.after),
          ...(input.before ? { before: memoryView(input.before) } : {}), ...(input.signal ? { signal: input.signal } : {}) });
      },
      async record(input) {
        const who = await caller();
        await effects.beforeEffect(); effects.assertCurrent();
        input.signal?.throwIfAborted();
        const receipt = await record(who, { ...identity(input), entry: memoryView(input.entry),
          ...(input.signal ? { signal: input.signal } : {}) });
        // Keep the App's returned identity. The SDK validates it against the original committed operation.
        return { appId: input.appId, operationId: receipt.operation_id,
          candidate: { ref: { kind: "memory-candidate", id: receipt.candidate.candidate_id, revision: 1 }, version: receipt.candidate.version },
          policy: receipt.policy, version: receipt.version,
          entry: { ref: { kind: "memory", id: receipt.entry.memory_id, revision: 1 }, version: receipt.entry.version }, changeId: receipt.change_id };
      },
    },
  };
}

/** Preserve the SDK's post-commit state in the App contract without exposing SDK references or callback errors. */
export function memoryPromotionFailure(error: unknown): unknown {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "MEMORY_PROMOTION_RECORD_PENDING") return error;
  const pending = error as MemoryPromotionPendingError;
  const details = { operation_id: pending.operationId, committed: { memory_id: pending.committed.ref.id, version: pending.committed.version } };
  const result = Object.assign(agentErrors.memory_promotion_record_pending("正式记忆已提交，历史或候选关联仍待原操作补齐", details), details) as AgentMemoryPromotionPendingError;
  return result;
}
