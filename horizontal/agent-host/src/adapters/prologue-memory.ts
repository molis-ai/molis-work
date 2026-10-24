import { memoryPromotionFailure } from "./prologue-memory-promotion.js";
import { formationInput, formationView } from "./prologue-memory-formation.js";
import { candidateView, memoryView, toSdkMemoryMeta, purgeQuery, purgePageView } from "./prologue-memory-values.js";
import { randomUUID } from "node:crypto";
import type { PrologueEffects } from "./prologue-effects.js";
import { agentErrors } from "../errors.js";
import { isPrologueError, redactText, screenInbound, type ExactRef, type Runtime, type MemoryCallerContext } from "@prologue/sdk";
import type { AgentMemoryCaller, AgentMemoryFormationContext, AgentMemoryMutation, AgentMemoryChange, AgentMemoryExecutionControl, AgentMemoryCapability, AgentMemoryEntry } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The platform memory port over the runtime's memory and candidate stores, and the exact references of the memories the
 * Host chose for a run. Molis names fields in snake case; Prologue keeps its own. Nothing else is translated.
 */
export interface PrologueMemoryBinding {
  context(caller: AgentMemoryCaller): MemoryCallerContext;
  run<T>(caller: AgentMemoryCaller, work: () => Promise<T>, options?: {
    formation?: AgentMemoryFormationContext; validateContext?: () => Promise<void>; operation?: "disable";
  }): Promise<T>;
}
export function createPrologueMemory(runtime: Runtime, effects: Pick<PrologueEffects, "memory">, binding: PrologueMemoryBinding): {
  capability: AgentMemoryCapability;
} {
  type Entry = AgentMemoryEntry;
  const mutation = (input: AgentMemoryMutation) => ({ expectedVersion: input.expected_version, operationId: input.operation_id,
    ...(input.signal ? { signal: input.signal } : {}) });
  const change = (input: AgentMemoryChange) => ({ text: input.text, ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.meta === undefined ? {} : { meta: toSdkMemoryMeta(input.meta) }) });
  const ref = <K extends "memory" | "memory-candidate">(kind: K, id: string): ExactRef<K> => ({ kind, id, revision: 1 });
  type Bound = ReturnType<Runtime["bindMemory"]>;
  const formal = async (bound: Bound, input: { scope: Entry["scope"]; owner: string; memory_id: string }) => {
    await bound.memory.hydrate([{ scope: input.scope, owner: input.owner }]);
    const reference = ref("memory", input.memory_id), found = await bound.memory.get(reference);
    if (found && (found.scope !== input.scope || found.owner !== input.owner)) throw agentErrors.capability_unavailable("记忆不属于指定范围");
    return reference;
  };
  const candidate = async (bound: Bound, input: { scope: Entry["scope"]; owner: string; candidate_id: string }) => {
    await bound.candidates.hydrate([{ scope: input.scope, owner: input.owner }]);
    const reference = ref("memory-candidate", input.candidate_id), found = await bound.candidates.get(reference);
    if (found && (found.scope !== input.scope || found.owner !== input.owner)) throw agentErrors.capability_unavailable("候选不属于指定范围");
    return reference;
  };
  const facade = (caller?: AgentMemoryCaller, control?: AgentMemoryExecutionControl): AgentMemoryCapability => {
    const call = <T>(work: (bound: Bound) => Promise<T>, options?: Parameters<PrologueMemoryBinding["run"]>[2], signal?: AbortSignal): Promise<T> => {
      if (!caller) return Promise.reject(agentErrors.capability_unavailable("记忆调用缺少可信身份绑定"));
      return binding.run(caller, () => {
        const operation = () => work(runtime.bindMemory(binding.context(caller)));
        return (control ? effects.memory(control, operation, signal) : operation()).catch(error => {
          if (isPrologueError(error) && error.code === "STORAGE_CONFLICT") throw agentErrors.memory_conflict("记忆已变化，请重新查看后再决定");
          throw memoryPromotionFailure(error);
        });
      }, options);
    };
    return {
      withCaller: next => facade(Object.freeze(structuredClone(next)), control),
      withExecution: next => facade(caller, next),
      list: (scope, owner) => call(async bound => (await bound.memory.list({ scope, owner, ...(caller?.run_explicit ? { readMode: "explicit" as const } : {}) })).map(memoryView)),
      page: input => call(async bound => {
        const { scan_limit, ...query } = input;
        const page = await bound.memory.page({ ...query, ...(scan_limit === undefined ? {} : { scanLimit: scan_limit }) });
        return { ...page, items: page.items.map(memoryView), cost: {
          directory_entries: page.cost.directoryEntries, directory_enumerations: page.cost.directoryEnumerations,
          directory_traversal: page.cost.directoryTraversal, metadata_reads: page.cost.metadataReads, body_reads: page.cost.bodyReads,
        } };
      }),
      previewPurge: input => call(async bound => purgePageView(await bound.previewPurge(purgeQuery(input))), undefined, input.signal),
      write: input => call(async bound => memoryView(await bound.memory.write({ scope: input.scope, owner: input.owner, text: input.text,
        origin: input.origin, idempotencyKey: input.operation_id, ...(input.signal ? { signal: input.signal } : {}),
        ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) }))),
      update: input => call(async bound => memoryView(await bound.memory.update(await formal(bound, input), change(input.change), mutation(input)))),
      setMeta: input => call(async bound => memoryView(await bound.memory.setMeta(await formal(bound, input), toSdkMemoryMeta(input.meta), mutation(input)))),
      pause: input => call(async bound => memoryView(await bound.memory.pause(await formal(bound, input), input.reason, mutation(input)))),
      disable: input => call(async bound => memoryView(await bound.memory.disable(await formal(bound, input), input.reason, mutation(input))), { operation: "disable" }),
      resume: input => call(async bound => memoryView(await bound.memory.resume(await formal(bound, input), mutation(input)))),
      renew: input => call(async bound => memoryView(await bound.memory.renew(await formal(bound, input), input.expires_at_ms, mutation(input)))),
      previewMutation: input => call(async bound => {
        const proposed = input.mutation;
        await bound.memory.preview({ scope: input.scope, owner: input.owner, ...(input.signal ? { signal: input.signal } : {}),
          items: [{ ref: await formal(bound, input), expectedVersion: input.expected_version, operationId: input.operation_id,
            mutation: proposed.kind === "update" ? { kind: "update", change: change(proposed.change) } : proposed }] });
      }),
      tombstone: input => call(async bound => memoryView(await bound.memory.remove(await formal(bound, input), mutation(input)))),
      remove: input => call(async bound => bound.memory.purge(ref("memory", input.memory_id), {
        ...mutation(input), identity: { scope: input.scope, owner: input.owner },
      })),
      recall: input => call(async bound => {
        const result = await bound.memory.recall({ receiptId: randomUUID(), scopes: [{ scope: input.scope, owner: input.owner }],
          readMode: "task", ...(input.keywords ? { keywords: input.keywords } : {}), ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.kinds ? { filter: { kinds: input.kinds } } : {}), ...(input.limit !== undefined ? { limits: { maxItems: input.limit } } : {}) });
        if (!["ready", "none"].includes(result.outcome)) throw agentErrors.capability_unavailable("记忆召回尚未完成");
        return result.hits.map(hit => ({ entry: memoryView(hit.entry), score: hit.score }));
      }),
      screen: async text => {
        const screened = screenInbound(text);
        return { hold: screened.verdict === "hold", reasons: screened.reasons.map(reason => reason.rule), redacted: redactText(text) };
      },
      previewScope: (scope, owner) => call(async bound => {
        const preview = await bound.memory.previewScope({ scope, owner }), operation_id = randomUUID();
        const decision = await bound.memory.preview({ scope, owner, items: preview.entries.map(entry => ({ ref: entry.ref,
          expectedVersion: entry.version, operationId: `${operation_id}:${entry.ref.id}`, mutation: { kind: "purge" as const } })) });
        return { count: preview.count, fingerprint: preview.fingerprint, operation_id,
          items: preview.entries.map(entry => ({ memory_id: entry.ref.id, version: entry.version })),
          decision: { ...decision, scope, items: decision.items.map(item => {
            if (item.ref.revision !== 1 || item.mutation.kind !== "purge") throw agentErrors.capability_unavailable("清空预览的操作形状不匹配");
            return { ...item, ref: { ...item.ref, revision: 1 as const }, mutation: { kind: "purge" as const } };
          }) } };
      }),
      clearScope: input => call(async bound => {
        if (input.operation_id !== input.preview.operation_id || input.scope !== input.preview.decision.scope || input.owner !== input.preview.decision.owner) {
          throw agentErrors.capability_unavailable("清空确认不属于原来的范围和操作");
        }
        const result = await bound.memory.mutateBatch({ preview: input.preview.decision, ...(input.signal ? { signal: input.signal } : {}) });
        return { items: result.results.map(item => ({ memory_id: item.ref.id, outcome: item.status,
          ...(item.status === "completed" ? { version: item.version } : {}) })) };
      }),
      candidates: {
        form: input => call(async bound => formationView(await bound.candidates.form(formationInput(input))),
          input.trigger === "none" ? undefined : { formation: input.context, validateContext: input.validate_context }),
        propose: input => call(async bound => candidateView(await bound.candidates.propose({ scope: input.scope, owner: input.owner,
          text: input.text, origin: input.origin, ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}),
          ...(input.sources ? { sources: input.sources.map(source => ({ eventId: source.event_id, version: source.version })) } : {}) }, mutation(input)))),
        list: (scope, owner) => call(async bound => (await bound.candidates.list({ scope, owner })).map(candidateView)),
        get: ({ scope, owner, candidate_id, signal }) => call(async bound => {
          signal?.throwIfAborted();
          await bound.candidates.hydrate([{ scope, owner }]);
          signal?.throwIfAborted();
          const found = await bound.candidates.get(ref("memory-candidate", candidate_id));
          signal?.throwIfAborted();
          if (found && (found.scope !== scope || found.owner !== owner)) throw agentErrors.capability_unavailable("候选不属于指定范围");
          return found && candidateView(found);
        }),
        accept: input => call(async bound => memoryView(await bound.candidates.accept(await candidate(bound, input), mutation(input), {
          ...(input.text !== undefined ? { text: input.text } : {}), ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) }))),
        promote: input => call(async bound => memoryView(await bound.candidates.promote(await candidate(bound, input), { policy: input.policy, version: input.version }, mutation(input), {
          ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) })), undefined, input.signal),
        settleInto: input => call(async bound => memoryView(await bound.candidates.settleInto(await candidate(bound, input), {
          ref: await formal(bound, { ...input, memory_id: input.target.memory_id }), expectedVersion: input.target.expected_version, change: change(input.target.change),
        }, input.by, mutation({ ...input, expected_version: input.candidate_expected_version }))), undefined, input.signal),
        discard: input => call(async bound => candidateView(await bound.candidates.discard(await candidate(bound, input), mutation(input)))),
        expire: input => call(async bound => candidateView(await bound.candidates.expire(await candidate(bound, input), mutation(input)))),
        purge: input => call(async bound => bound.candidates.purge(ref("memory-candidate", input.candidate_id), {
          ...mutation(input), identity: { scope: input.scope, owner: input.owner },
        })),
        reconcileDecision: input => call(async bound => {
          const receipt = await bound.candidates.reconcileDecision(await candidate(bound, input), mutation(input));
          return { outcome: receipt.outcome, future_commit: receipt.futureCommit, past_commit: receipt.pastCommit,
            candidate: { candidate_id: receipt.candidate.ref.id, version: receipt.candidate.version },
            target: { memory_id: receipt.target.ref.id, state: receipt.target.state,
              ...(receipt.target.observedVersion === undefined ? {} : { observed_version: receipt.target.observedVersion }) },
            operation_id: receipt.operationId, decision_operation_id: receipt.decisionOperationId };
        }),
      },
    };
  };
  return { capability: facade() };
}
