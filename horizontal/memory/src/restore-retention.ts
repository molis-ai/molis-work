import type { MemoryForgettingFacts, MemoryRestoreIdentity, MemoryRestoreLedgerFacts, MemoryRestoreRetention, MemoryRestoreSdkPort, MemoryRestoreTarget } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";

const same = (left: MemoryRestoreIdentity, right: MemoryRestoreIdentity) => left.scope === right.scope && left.owner === right.owner;

/** The independent accepted decision is authoritative even when the current SQL projection is unreadable. */
export function prepareMemoryRestoreRetention(facts: MemoryForgettingFacts): MemoryRestoreRetention {
  const memories = new Map<string, MemoryRestoreRetention["memories"][number]>();
  const candidates = new Map<string, MemoryRestoreRetention["candidates"][number]>();
  const sources = new Map<string, MemoryRestoreRetention["sources"][number]>();
  for (const decision of facts.decisions) {
    const where = { scope: decision.scope, owner: decision.owner };
    for (const memory of decision.memories) {
      const key = JSON.stringify([where.scope, where.owner, memory.memory_id]);
      const selection_mode = memories.get(key)?.selection_mode === "related" ? "related" : decision.selection_mode;
      memories.set(key, { ...where, memory_id: memory.memory_id, selection_mode });
    }
    for (const candidate of decision.candidates) candidates.set(JSON.stringify([where.scope, where.owner, candidate.candidate_id]), { ...where, candidate_id: candidate.candidate_id });
    for (const event_id of decision.source_event_ids) sources.set(JSON.stringify([decision.actor_id, where.scope, where.owner, event_id]),
      { ...where, actor_id: decision.actor_id, event_id, at: decision.accepted_at });
  }
  return { memories: [...memories.values()], candidates: [...candidates.values()], sources: [...sources.values()] };
}

/** Freeze actual restored versions, then let the original SDK owner clear only that selection. */
export async function applyMemoryRestoreRetention(input: {
  readonly retention: MemoryRestoreRetention;
  readonly incoming: MemoryRestoreLedgerFacts;
  readonly sdk: MemoryRestoreSdkPort | undefined;
  readonly assertCurrent: () => void;
  readonly retainLedger: (candidateIds: readonly string[]) => void;
}): Promise<readonly string[]> {
  const { retention, incoming, sdk, assertCurrent } = input, selected = new Map<string, MemoryRestoreTarget>();
  const related = incoming.candidates.filter(item => retention.memories.some(memory => memory.selection_mode === "related" && same(item, memory)
    && (item.memory_id === memory.memory_id || item.supersedes === memory.memory_id))
    || retention.candidates.some(candidate => same(item, candidate) && item.candidate_id === candidate.candidate_id)
    || retention.sources.some(source => same(item, source) && item.source_event_ids.includes(source.event_id)));
  const candidateIds = new Set(related.map(item => item.candidate_id));
  let changed: readonly string[] = [];
  const add = (target: MemoryRestoreTarget) => {
    selected.set(target.kind + ":" + target.id, target);
    if (target.kind === "memory-candidate" && incoming.candidates.some(item => same(item, target) && item.candidate_id === target.id)) candidateIds.add(target.id);
  };
  assertCurrent();
  if (sdk) {
    for (const memory of retention.memories) {
      const inspected = await sdk.inspect({ ...memory, kind: "memory", id: memory.memory_id }); assertCurrent();
      if (inspected.state === "present") add(inspected.target);
    }
    const candidateTargets = new Map([...related, ...retention.candidates].map(item => [JSON.stringify([item.scope, item.owner, item.candidate_id]), item]));
    for (const candidate of candidateTargets.values()) {
      const inspected = await sdk.inspect({ ...candidate, kind: "memory-candidate", id: candidate.candidate_id }); assertCurrent();
      if (inspected.state === "present") add(inspected.target);
    }
    const scopes = new Map(retention.sources.map(source => [JSON.stringify([source.scope, source.owner]), source]));
    for (const identity of scopes.values()) {
      for (const candidate of await sdk.candidates(identity)) {
        if (candidate.sources?.some(source => retention.sources.some(barrier => same(candidate, barrier) && barrier.event_id === source.event_id))) add(candidate);
      }
      assertCurrent();
    }
    changed = await sdk.purge([...selected.values()]); assertCurrent();
    for (const target of selected.values()) {
      if ((await sdk.inspect(target)).state !== "cleared") throw memoryErrors.conflict("恢复清除没有原主人确认的完成事实");
      assertCurrent();
    }
    for (const identity of scopes.values()) {
      if ((await sdk.candidates(identity)).some(candidate => candidate.sources?.some(source => retention.sources.some(barrier => same(candidate, barrier)
        && barrier.event_id === source.event_id)))) throw memoryErrors.conflict("恢复后仍有已遗忘来源的候选");
      assertCurrent();
    }
  }
  // An archive predating formation may have no SDK target at all. Its original must still stay suppressed.
  // A previous SDK purge may have completed before its ledger cleanup failed. The original
  // terminal relationship, not the presence of an SDK body, decides which projection must go.
  input.retainLedger([...candidateIds]);
  assertCurrent(); return changed;
}
