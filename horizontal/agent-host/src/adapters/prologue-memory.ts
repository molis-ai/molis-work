import { randomUUID } from "node:crypto";
import type { PrologueEffects } from "./prologue-effects.js";
import { agentErrors } from "../errors.js";
import { redactText, screenInbound, type ExactRef, type MemoryEntry, type MemoryMeta, type Runtime, type ScopedCandidate, type MemoryCallerContext } from "@prologue/sdk";
import type { AgentMemoryCaller, AgentMemoryMutation, AgentMemoryChange, AgentMemoryExecutionControl, AgentMemoryCandidateEntry, AgentMemoryCapability, AgentMemoryEntry, AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The platform memory port over the runtime's memory and candidate stores, and the exact references of the memories the
 * Host chose for a run. Molis names fields in snake case; Prologue keeps its own. Nothing else is translated.
 */
export interface PrologueMemoryBinding {
  context(caller: AgentMemoryCaller): MemoryCallerContext;
  run<T>(caller: AgentMemoryCaller, work: () => Promise<T>): Promise<T>;
}
export function createPrologueMemory(runtime: Runtime, effects: Pick<PrologueEffects, "call">, binding: PrologueMemoryBinding): {
  capability: AgentMemoryCapability;
} {
  type Entry = AgentMemoryEntry;
  type Meta = AgentMemoryMeta;
  type Candidate = AgentMemoryCandidateEntry;
  type SdkMeta = MemoryMeta;
  const toSdk = (meta: Meta): SdkMeta => ({
    ...(meta.classification ? { classification: structuredClone(meta.classification) } : {}),
    ...(meta.session_ref ? { sessionRef: { ...meta.session_ref } } : {}),
    ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
    ...(meta.applies_when ? { appliesWhen: { ...(meta.applies_when.plugins ? { plugins: meta.applies_when.plugins } : {}), ...(meta.applies_when.object_kinds ? { objectKinds: meta.applies_when.object_kinds } : {}),
      ...(meta.applies_when.goals ? { goals: meta.applies_when.goals } : {}), ...(meta.applies_when.task !== undefined ? { task: meta.applies_when.task } : {}),
      ...(meta.applies_when.from_ms !== undefined ? { fromMs: meta.applies_when.from_ms } : {}), ...(meta.applies_when.until_ms !== undefined ? { untilMs: meta.applies_when.until_ms } : {}) } } : {}),
    ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.at_ms !== undefined ? { atMs: one.at_ms } : {}) })) } : {}),
    ...(meta.expires_at_ms !== undefined ? { expiresAtMs: meta.expires_at_ms } : {}), ...(meta.approved_by ? { approvedBy: meta.approved_by } : {}),
    ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
  });
  const fromSdk = (meta: SdkMeta): Meta => ({
    ...(meta.classification ? { classification: { scenes: [...meta.classification.scenes], lifecycle: meta.classification.lifecycle,
      ...(meta.classification.extra ? { extra: Object.fromEntries(Object.entries(meta.classification.extra).map(([key, values]) => [key, [...values]])) } : {}) } } : {}),
    ...(meta.sessionRef ? { session_ref: { ...meta.sessionRef } } : {}),
    ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
    ...(meta.appliesWhen ? { applies_when: { ...(meta.appliesWhen.plugins ? { plugins: [...meta.appliesWhen.plugins] } : {}), ...(meta.appliesWhen.objectKinds ? { object_kinds: [...meta.appliesWhen.objectKinds] } : {}),
      ...(meta.appliesWhen.goals ? { goals: [...meta.appliesWhen.goals] } : {}), ...(meta.appliesWhen.task !== undefined ? { task: meta.appliesWhen.task } : {}),
      ...(meta.appliesWhen.fromMs !== undefined ? { from_ms: meta.appliesWhen.fromMs } : {}), ...(meta.appliesWhen.untilMs !== undefined ? { until_ms: meta.appliesWhen.untilMs } : {}) } } : {}),
    ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.atMs !== undefined ? { at_ms: one.atMs } : {}) })) } : {}),
    ...(meta.expiresAtMs !== undefined ? { expires_at_ms: meta.expiresAtMs } : {}), ...(meta.approvedBy ? { approved_by: { ...meta.approvedBy } } : {}),
    ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
  });
  const view = (entry: MemoryEntry): Entry => ({ memory_id: entry.ref.id, scope: entry.scope as Entry["scope"], owner: entry.owner,
    text: entry.text, origin: entry.origin, tags: [...entry.tags], version: entry.version, meta: fromSdk(entry.meta ?? {}),
    tombstoned: entry.tombstoned === true,
    ...(entry.disabled ? { disabled: { reason: entry.disabled.reason, at_ms: entry.disabled.atMs } } : {}),
    ...(entry.key ? { key: { ...entry.key } } : {}),
    ...(entry.paused ? { paused: { reason: entry.paused.reason, at_ms: entry.paused.atMs } } : {}), created_at_ms: entry.createdAtMs ?? 0, updated_at_ms: entry.updatedAtMs ?? 0 });
  const candidateView = (item: ScopedCandidate): Candidate => ({ candidate_id: item.ref.id, version: item.version,
    ...(item.sources ? { sources: item.sources.map(source => ({ event_id: source.eventId, version: source.version,
      speaker: { ...source.speaker }, derivation: source.derivation, occurred_at_ms: source.occurredAtMs,
      ...(source.about ? { about: { event_id: source.about.eventId, version: source.about.version } } : {}) })) } : {}), scope: item.scope as Candidate["scope"], owner: item.owner,
    text: item.text, origin: item.origin, tags: [...item.tags], meta: fromSdk(item.meta), state: item.state, created_at_ms: item.createdAtMs,
    ...(item.settledAtMs !== undefined ? { settled_at_ms: item.settledAtMs } : {}), ...(item.entry ? { memory_id: item.entry.id } : {}) });
  const mutation = (input: AgentMemoryMutation) => ({ expectedVersion: input.expected_version, operationId: input.operation_id,
    ...(input.signal ? { signal: input.signal } : {}) });
  const change = (input: AgentMemoryChange) => ({ text: input.text, ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.meta === undefined ? {} : { meta: toSdk(input.meta) }) });
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
    const call = <T>(work: (bound: Bound) => Promise<T>): Promise<T> => {
      if (!caller) return Promise.reject(agentErrors.capability_unavailable("记忆调用缺少可信身份绑定"));
      return binding.run(caller, () => {
        const operation = () => work(runtime.bindMemory(binding.context(caller)));
        return control ? effects.call(control, operation) : operation();
      });
    };
    return {
      withCaller: next => facade(Object.freeze(structuredClone(next)), control),
      withExecution: next => facade(caller, next),
      list: (scope, owner) => call(async bound => (await bound.memory.list({ scope, owner })).map(view)),
      write: input => call(async bound => view(await bound.memory.write({ scope: input.scope, owner: input.owner, text: input.text,
        origin: input.origin, idempotencyKey: input.operation_id, ...(input.signal ? { signal: input.signal } : {}),
        ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) }))),
      update: input => call(async bound => view(await bound.memory.update(await formal(bound, input), change(input.change), mutation(input)))),
      setMeta: input => call(async bound => view(await bound.memory.setMeta(await formal(bound, input), toSdk(input.meta), mutation(input)))),
      pause: input => call(async bound => view(await bound.memory.pause(await formal(bound, input), input.reason, mutation(input)))),
      disable: input => call(async bound => view(await bound.memory.disable(await formal(bound, input), input.reason, mutation(input)))),
      resume: input => call(async bound => view(await bound.memory.resume(await formal(bound, input), mutation(input)))),
      remove: input => call(async bound => bound.memory.purge(await formal(bound, input), mutation(input))),
      recall: input => call(async bound => {
        const result = await bound.memory.recall({ receiptId: randomUUID(), scopes: [{ scope: input.scope, owner: input.owner }],
          readMode: "task", ...(input.keywords ? { keywords: input.keywords } : {}), ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.kinds ? { filter: { kinds: input.kinds } } : {}), ...(input.limit !== undefined ? { limits: { maxItems: input.limit } } : {}) });
        if (!["ready", "none"].includes(result.outcome)) throw agentErrors.capability_unavailable("记忆召回尚未完成");
        return result.hits.map(hit => ({ entry: view(hit.entry), score: hit.score }));
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
        propose: input => call(async bound => candidateView(await bound.candidates.propose({ scope: input.scope, owner: input.owner,
          text: input.text, origin: input.origin, ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}),
          ...(input.sources ? { sources: input.sources.map(source => ({ eventId: source.event_id, version: source.version })) } : {}) }, mutation(input)))),
        list: (scope, owner) => call(async bound => (await bound.candidates.list({ scope, owner })).map(candidateView)),
        accept: input => call(async bound => view(await bound.candidates.accept(await candidate(bound, input), mutation(input), {
          ...(input.text !== undefined ? { text: input.text } : {}), ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.meta ? { meta: toSdk(input.meta) } : {}) }))),
        promote: input => call(async bound => view(await bound.candidates.promote(await candidate(bound, input), { policy: input.policy, version: input.version }, mutation(input), {
          ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) }))),
        settleInto: input => call(async bound => view(await bound.candidates.settleInto(await candidate(bound, input), {
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
