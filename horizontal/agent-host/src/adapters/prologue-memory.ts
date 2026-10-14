import { agentErrors } from "../errors.js";
import { redactText, screenInbound, type ExactRef, type MemoryEntry, type MemoryMeta, type Runtime, type ScopedCandidate } from "@prologue/sdk";
import type { AgentMemoryExecutionControl, AgentMemoryCandidateEntry, AgentMemoryCapability, AgentMemoryEntry, AgentMemoryMeta, AgentPinnedMemory } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The platform memory port over the runtime's memory and candidate stores, and the exact references of the memories the
 * Host chose for a run. Molis names fields in snake case; Prologue keeps its own. Nothing else is translated.
 */
export function createPrologueMemory(runtime: Runtime, bind: (memory: AgentMemoryCapability, control: AgentMemoryExecutionControl) => AgentMemoryCapability): { capability: AgentMemoryCapability; refsFor(pinned: readonly AgentPinnedMemory[]): Promise<ExactRef<"memory">[]> } {
  type Entry = AgentMemoryEntry;
  type Meta = AgentMemoryMeta;
  type Candidate = AgentMemoryCandidateEntry;
  type SdkMeta = MemoryMeta;
  const toSdk = (meta: Meta): SdkMeta => ({
    ...(meta.kind !== undefined ? { kind: meta.kind } : {}), ...(meta.source !== undefined ? { source: meta.source } : {}), ...(meta.basis !== undefined ? { basis: meta.basis } : {}),
    ...(meta.applies_when ? { appliesWhen: { ...(meta.applies_when.plugins ? { plugins: meta.applies_when.plugins } : {}), ...(meta.applies_when.object_kinds ? { objectKinds: meta.applies_when.object_kinds } : {}),
      ...(meta.applies_when.goals ? { goals: meta.applies_when.goals } : {}), ...(meta.applies_when.task !== undefined ? { task: meta.applies_when.task } : {}),
      ...(meta.applies_when.from_ms !== undefined ? { fromMs: meta.applies_when.from_ms } : {}), ...(meta.applies_when.until_ms !== undefined ? { untilMs: meta.applies_when.until_ms } : {}) } } : {}),
    ...(meta.evidence ? { evidence: meta.evidence.map(one => ({ kind: one.kind, ...(one.text !== undefined ? { text: one.text } : {}), ...(one.ref !== undefined ? { ref: one.ref } : {}), ...(one.at_ms !== undefined ? { atMs: one.at_ms } : {}) })) } : {}),
    ...(meta.expires_at_ms !== undefined ? { expiresAtMs: meta.expires_at_ms } : {}), ...(meta.approved_by ? { approvedBy: meta.approved_by } : {}),
    ...(meta.namespace !== undefined ? { namespace: meta.namespace } : {}),
  });
  const fromSdk = (meta: SdkMeta): Meta => ({
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
    ...(entry.paused ? { paused: { reason: entry.paused.reason, at_ms: entry.paused.atMs } } : {}), created_at_ms: entry.createdAtMs ?? 0, updated_at_ms: entry.updatedAtMs ?? 0 });
  const candidateView = (item: ScopedCandidate): Candidate => ({ candidate_id: item.ref.id, scope: item.scope as Candidate["scope"], owner: item.owner,
    text: item.text, origin: item.origin, tags: [...item.tags], meta: fromSdk(item.meta), state: item.state, created_at_ms: item.createdAtMs,
    ...(item.settledAtMs !== undefined ? { settled_at_ms: item.settledAtMs } : {}), ...(item.entry ? { memory_id: item.entry.id } : {}) });
  const hydrated = new Set<string>();
  const ready = async (scope: Entry["scope"], owner: string) => {
    const key = `${scope}:${owner}`;
    if (!hydrated.has(key)) { await runtime.memory.hydrate([{ scope, owner }]); await runtime.memoryCandidates.hydrate([{ scope, owner }]); hydrated.add(key); }
  };
  const find = async (scope: Entry["scope"], owner: string, id: string) => {
    await ready(scope, owner);
    const entry = runtime.memory.list({ scope, owner }).find(item => item.ref.id === id);
    if (!entry) throw agentErrors.capability_unavailable("这条记忆不存在或已删除");
    return entry;
  };
  const candidate = async (scope: Entry["scope"], owner: string, id: string) => {
    await ready(scope, owner);
    const found = runtime.memoryCandidates.list({ scope, owner }).find(item => item.ref.id === id);
    if (!found) throw agentErrors.capability_unavailable("这条候选不存在");
    return found.ref;
  };
  const capability: AgentMemoryCapability = {
    withExecution: control => bind(capability, control),
    list: async (scope, owner) => { await ready(scope, owner); return runtime.memory.list({ scope, owner }).map(view); },
    write: async input => { await ready(input.scope, input.owner); return view(await runtime.memory.write({ scope: input.scope, owner: input.owner, text: input.text, origin: input.origin,
      ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })); },
    update: async input => view(await runtime.memory.update((await find(input.scope, input.owner, input.memory_id)).ref, input.text)),
    setMeta: async input => view(await runtime.memory.setMeta((await find(input.scope, input.owner, input.memory_id)).ref, toSdk(input.meta))),
    pause: async input => view(await runtime.memory.pause((await find(input.scope, input.owner, input.memory_id)).ref, input.reason)),
    resume: async input => view(await runtime.memory.resume((await find(input.scope, input.owner, input.memory_id)).ref)),
    remove: async input => { await runtime.memory.purge((await find(input.scope, input.owner, input.memory_id)).ref); return true; },
    recall: async input => { await ready(input.scope, input.owner);
      const atMs = (await runtime.readClock()).wallTimeMs;
      return runtime.memory.recall({ scope: input.scope, owner: input.owner, ...(input.keywords ? { keywords: input.keywords } : {}), ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.kinds ? { kinds: input.kinds } : {}), atMs, ...(input.limit ? { limit: input.limit } : {}) }).hits.map(hit => ({ entry: view(hit.entry), score: hit.score })); },
    screen: async text => {
      const screened = screenInbound(text);
      return { hold: screened.verdict === "hold", reasons: screened.reasons.map(reason => reason.rule), redacted: redactText(text) };
    },
    previewScope: async (scope, owner) => {
      await ready(scope, owner);
      const preview = runtime.memory.previewScope({ scope, owner });
      return { count: preview.count, fingerprint: preview.fingerprint, memory_ids: preview.entries.map(entry => entry.ref.id) };
    },
    clearScope: async input => {
      await ready(input.scope, input.owner);
      // Refused (nothing removed) when the scope changed since the preview; then every one is purged, not only tombstoned.
      const removed = await runtime.memory.removeScope({ scope: input.scope, owner: input.owner, fingerprint: input.fingerprint });
      for (const ref of removed) await runtime.memory.purge(ref);
      return removed.map(ref => ref.id);
    },
    candidates: {
      propose: async input => { await ready(input.scope, input.owner); return candidateView(await runtime.memoryCandidates.propose({ scope: input.scope, owner: input.owner, text: input.text, origin: input.origin,
        ...(input.tags ? { tags: input.tags } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })); },
      list: async (scope, owner) => { await ready(scope, owner); return runtime.memoryCandidates.list({ scope, owner }).map(candidateView); },
      accept: async input => view(await runtime.memoryCandidates.accept(await candidate(input.scope, input.owner, input.candidate_id), {
        ...(input.text !== undefined ? { text: input.text } : {}), ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })),
      promote: async input => view(await runtime.memoryCandidates.promote(await candidate(input.scope, input.owner, input.candidate_id), { policy: input.policy, version: input.version },
        { ...(input.origin !== undefined ? { origin: input.origin } : {}), ...(input.meta ? { meta: toSdk(input.meta) } : {}) })),
      settleInto: async input => view(await runtime.memoryCandidates.settleInto(await candidate(input.scope, input.owner, input.candidate_id),
        (await find(input.scope, input.owner, input.memory_id)).ref, input.by)),
      discard: async input => candidateView(await runtime.memoryCandidates.discard(await candidate(input.scope, input.owner, input.candidate_id))),
      expire: async input => candidateView(await runtime.memoryCandidates.expire(await candidate(input.scope, input.owner, input.candidate_id))),
      purge: async input => { await runtime.memoryCandidates.purge(await candidate(input.scope, input.owner, input.candidate_id)); },
    },
  };
  const refsFor = async (pinned: readonly AgentPinnedMemory[]): Promise<ExactRef<"memory">[]> => {
    const refs: ExactRef<"memory">[] = [];
    for (const pin of pinned) {
      await ready(pin.scope, pin.owner);
      const found = runtime.memory.list({ scope: pin.scope, owner: pin.owner }).find(entry => entry.ref.id === pin.memory_id);
      // One deleted meanwhile is simply not there: the run is not given it.
      if (found) refs.push(found.ref);
    }
    return refs;
  };
  return { capability, refsFor };
}
