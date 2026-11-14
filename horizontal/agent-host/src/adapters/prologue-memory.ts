import { memoryPromotionFailure } from "./prologue-memory-promotion.js";
import { formationInput, formationView } from "./prologue-memory-formation.js";
import { candidateView, memoryView, memoryPageView, toSdkMemoryMeta } from "./prologue-memory-values.js";
import { randomUUID } from "node:crypto";
import type { PrologueEffects } from "./prologue-effects.js";
import { agentErrors } from "../errors.js";
import { redactText, screenInbound, isPrologueError, type ExactRef, type Runtime, type MemoryCallerContext } from "@prologue/sdk";
import type { AgentMemoryCaller, AgentMemoryFormationContext, AgentMemoryMutation, AgentMemoryChange, AgentMemoryExecutionControl, AgentMemoryCapability, AgentMemoryEntry } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The platform memory port over the runtime's memory and candidate stores, and the exact references of the memories the
 * Host chose for a run. Molis names fields in snake case; Prologue keeps its own. Nothing else is translated.
 */
export interface PrologueMemoryBinding {
  context(caller: AgentMemoryCaller): MemoryCallerContext;
  run<T>(caller: AgentMemoryCaller, work: () => Promise<T>, formation?: AgentMemoryFormationContext, validateContext?: () => Promise<void>): Promise<T>;
}
/** The public SDK Session inspection and fixed-purge bridge share the facade's same controlled call. */
function sessionPurgeCapability(call: <T>(work: (bound: ReturnType<Runtime["bindMemory"]>) => Promise<T>) => Promise<T>):
  Pick<AgentMemoryCapability, "previewSessionPurge" | "purgeSessionTarget"> {
  return {
      previewSessionPurge: input => call(async bound => {
        const page = await bound.previewPurge({ kind: input.kind, selection: { kind: "session", sessionRef: input.selection.session_ref,
          operationId: input.selection.operation_id }, ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit }), ...(input.signal ? { signal: input.signal } : {}) });
        return { ...page, items: page.items.map(item => ({ kind: item.kind, id: item.ref.id, scope: item.identity.scope, owner: item.identity.owner,
          version: item.expectedVersion, state: item.state, ...(item.sessionRef ? { session_ref: { ...item.sessionRef, revision: 1 as const } } : {}) })) };
      }),
      purgeSessionTarget: input => call(async bound => {
        const options = { expectedVersion: input.version, operationId: input.operation_id, identity: { scope: input.scope, owner: input.owner },
          selection: { kind: "session" as const, sessionRef: input.selection.session_ref, operationId: input.selection.operation_id }, ...(input.signal ? { signal: input.signal } : {}) };
        if (input.kind === "memory") await bound.memory.purge({ kind: "memory", id: input.id, revision: 1 }, options);
        else await bound.candidates.purge({ kind: "memory-candidate", id: input.id, revision: 1 }, options);
      }),
  };
}

export function createPrologueMemory(runtime: Runtime, effects: Pick<PrologueEffects, "memory" | "observeMemoryWrites">, binding: PrologueMemoryBinding): {
  capability: AgentMemoryCapability;
} {
  type Entry = AgentMemoryEntry;
  const mutation = (input: AgentMemoryMutation) => ({ expectedVersion: input.expected_version, operationId: input.operation_id,
    ...(input.signal ? { signal: input.signal } : {}) });
  const change = (input: AgentMemoryChange) => ({ text: input.text, ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.meta === undefined ? {} : { meta: toSdkMemoryMeta(input.meta) }) });
  const ref = <K extends "memory" | "memory-candidate">(kind: K, id: string): ExactRef<K> => ({ kind, id, revision: 1 });
  type Bound = ReturnType<Runtime["bindMemory"]>;
  const formal = async (bound: Bound, input: { scope: Entry["scope"]; owner: string; memory_id: string }, explicit = false) => {
    await bound.memory.hydrate([{ scope: input.scope, owner: input.owner }]);
    const reference = ref("memory", input.memory_id), found = await bound.memory.get(reference, explicit ? { readMode: "explicit" } : {});
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
    const call = <T>(work: (bound: Bound) => Promise<T>, formation?: AgentMemoryFormationContext, validateContext?: () => Promise<void>): Promise<T> => {
      if (!caller) return Promise.reject(agentErrors.capability_unavailable("记忆调用缺少可信身份绑定"));
      return binding.run(caller, () => {
        const operation = () => work(runtime.bindMemory(binding.context(caller)));
        return effects.memory(control, operation).catch(error => { throw memoryPromotionFailure(error); });
      }, formation, validateContext);
    };
    return {
      withCaller: next => facade(Object.freeze(structuredClone(next)), control),
      withExecution: next => facade(caller, next),
      observeWrites: () => call(async () => {
        control?.assert_current();
        const unchanged = effects.observeMemoryWrites();
        return () => { control?.assert_current(); unchanged(); };
      }),
      ...sessionPurgeCapability(call),
      list: (scope, owner) => call(async bound => (await bound.memory.list({ scope, owner, ...(caller?.run_explicit ? { readMode: "explicit" as const } : {}) })).map(memoryView)),
      page: input => call(async bound => {
        const { scan_limit, ...query } = input;
        return memoryPageView(await bound.memory.page({ ...query, ...(scan_limit === undefined ? {} : { scanLimit: scan_limit }) }));
      }),
      write: input => call(async bound => memoryView(await bound.memory.write({ scope: input.scope, owner: input.owner, text: input.text,
        origin: input.origin, idempotencyKey: input.operation_id, ...(input.signal ? { signal: input.signal } : {}),
        ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) }))),
      update: input => call(async bound => memoryView(await bound.memory.update(await formal(bound, input, caller?.run_explicit), change(input.change), mutation(input)))),
      renew: input => call(async bound => memoryView(await bound.memory.renew(await formal(bound, input), input.expires_at_ms, mutation(input)))).catch(error => {
        if (isPrologueError(error) && error.code === "STORAGE_CONFLICT") throw agentErrors.memory_conflict("记忆已变化，请重新查看后再决定");
        throw error;
      }),
      setMeta: input => call(async bound => memoryView(await bound.memory.setMeta(await formal(bound, input), toSdkMemoryMeta(input.meta), mutation(input)))),
      pause: input => call(async bound => memoryView(await bound.memory.pause(await formal(bound, input), input.reason, mutation(input)))),
      disable: input => call(async bound => memoryView(await bound.memory.disable(await formal(bound, input, caller?.run_explicit), input.reason, mutation(input)))),
      resume: input => call(async bound => memoryView(await bound.memory.resume(await formal(bound, input), mutation(input)))),
      previewMutation: input => call(async bound => {
        const proposed = input.mutation;
        await bound.memory.preview({ scope: input.scope, owner: input.owner, ...(input.signal ? { signal: input.signal } : {}),
          items: [{ ref: await formal(bound, input), expectedVersion: input.expected_version, operationId: input.operation_id,
            mutation: proposed.kind === "update" ? { kind: "update", change: change(proposed.change) } : proposed }] });
      }),
      tombstone: input => call(async bound => memoryView(await bound.memory.remove(await formal(bound, input), mutation(input)))),
      remove: input => call(async bound => bound.memory.purge(await formal(bound, input), mutation(input))),
      recall: input => call(async bound => {
        const result = await bound.memory.recall({ receiptId: randomUUID(), scopes: [{ scope: input.scope, owner: input.owner }],
          readMode: caller?.run_explicit ? "explicit" : "task", ...(input.keywords ? { keywords: input.keywords } : {}), ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.kinds ? { filter: { kinds: input.kinds } } : {}), ...(input.limit !== undefined ? { limits: { maxItems: input.limit } } : {}) });
        if (!["ready", "none"].includes(result.outcome)) throw agentErrors.capability_unavailable("记忆召回尚未完成");
        return result.hits.map(hit => ({ entry: memoryView(hit.entry), score: hit.score }));
      }),
      screen: async text => {
        const screened = screenInbound(text);
        return { hold: screened.verdict === "hold", reasons: screened.reasons.map(reason => reason.rule), redacted: redactText(text) };
      },
      previewBatch: input => call(async bound => {
        const items = [];
        for (const item of input.items) items.push({ ref: await formal(bound, { ...input, memory_id: item.memory_id }),
          expectedVersion: item.version, operationId: `${input.operation_id}:${item.memory_id}`,
          mutation: input.action === "remove" ? { kind: "purge" as const } : { kind: "disable" as const, reason: "你停用了" } });
        const decision = await bound.memory.preview({ scope: input.scope, owner: input.owner, items, ...(input.signal ? { signal: input.signal } : {}) });
        return { operation_id: input.operation_id, items: input.items.map(item => ({ ...item })),
          decision: { ...decision, scope: input.scope, items: items.map(item => ({ ...item, ref: { ...item.ref, revision: 1 as const } })) } };
      }),
      applyBatch: input => call(async bound => {
        const result = await bound.memory.mutateBatch({ preview: input.preview.decision, ...(input.signal ? { signal: input.signal } : {}) });
        return { items: result.results.map(item => ({ memory_id: item.ref.id, outcome: item.status,
          ...(item.status === "completed" ? { version: item.version } : {}) })) };
      }),
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
          input.trigger === "none" ? undefined : input.context, input.trigger === "none" ? undefined : input.validate_context),
        propose: input => call(async bound => candidateView(await bound.candidates.propose({ scope: input.scope, owner: input.owner,
          text: input.text, origin: input.origin, ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}),
          ...(input.sources ? { sources: input.sources.map(source => ({ eventId: source.event_id, version: source.version })) } : {}) }, mutation(input)))),
        list: (scope, owner) => caller?.candidate_access?.purpose === "formation-receipt"
          ? facade({ ...caller, candidate_access: undefined }, control).candidates.list(scope, owner)
          : call(async bound => (await bound.candidates.list({ scope, owner })).map(candidateView)),
        get: input => call(async bound => {
          input.signal?.throwIfAborted();
          const found = await bound.candidates.get(ref("memory-candidate", input.candidate_id));
          input.signal?.throwIfAborted();
          if (found && (found.scope !== input.scope || found.owner !== input.owner)) throw agentErrors.capability_unavailable("候选不属于指定范围");
          return found ? candidateView(found) : undefined;
        }),
        accept: input => call(async bound => memoryView(await bound.candidates.accept(await candidate(bound, input), mutation(input), {
          ...(input.text !== undefined ? { text: input.text } : {}), ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) }))),
        promote: input => call(async bound => memoryView(await bound.candidates.promote(await candidate(bound, input), { policy: input.policy, version: input.version }, mutation(input), {
          ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdkMemoryMeta(input.meta) } : {}) }))),
        settleInto: input => call(async bound => memoryView(await bound.candidates.settleInto(await candidate(bound, input), {
          ref: await formal(bound, { ...input, memory_id: input.target.memory_id }), expectedVersion: input.target.expected_version, change: change(input.target.change),
        }, input.by, mutation({ ...input, expected_version: input.candidate_expected_version })))),
        discard: input => call(async bound => candidateView(await bound.candidates.discard(await candidate(bound, input), mutation(input)))),
        expire: input => call(async bound => candidateView(await bound.candidates.expire(await candidate(bound, input), mutation(input)))),
        purge: input => call(async bound => bound.candidates.purge(await candidate(bound, input), mutation(input))),
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
