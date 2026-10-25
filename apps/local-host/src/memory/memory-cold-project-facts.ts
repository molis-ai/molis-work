import type { MemoryLedgerRecoveryFact as Fact } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryErrors, type ProjectMemoryPurgeFactsQuery, type ProjectMemoryPurgeLedgerFacts } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedgerRecoveryInspection, type MemoryLedgerRecoveryInspection } from "@molis-ai/molis-work-storage";

/** Target Ledger identities and provenance only. SDK previews own target versions. */
export function createColdProjectMemoryFacts(input: { homeDirectory: string; current(): void; signal?: AbortSignal }) {
  const readers = new Set<MemoryLedgerRecoveryInspection>();
  const dispose = (reader: MemoryLedgerRecoveryInspection) => { reader.close(); readers.delete(reader); };
  const scan = (reader: MemoryLedgerRecoveryInspection, accept: (fact: Fact) => void) => {
    while (true) {
      input.current();
      const page = reader.next();
      input.current();
      if (page.issues.length) throw memoryErrors.conflict("目标记忆账注有未确认事实，保留原件待核对");
      for (const fact of page.facts) accept(fact);
      if (page.exhausted) return;
    }
  };
  const collect = (reader: MemoryLedgerRecoveryInspection, query: ProjectMemoryPurgeFactsQuery): ProjectMemoryPurgeLedgerFacts => {
    const candidates: Extract<Fact, { kind: "candidate" }>[] = [], changes: Extract<Fact, { kind: "change" }>[] = [];
    const scopeFor = (fact: { scope: string; owner: string }) => query.scopes.find(scope => scope.scope === fact.scope && scope.owner === fact.owner);
    scan(reader, fact => {
      if (fact.actor_id !== query.actor_id) return;
      if (fact.kind === "candidate") {
        const scope = scopeFor(fact);
        if (scope && (scope.scope !== "personal" || scope.candidates.some(item => item.candidate_id === fact.candidate_id))) {
          if (fact.project_id !== null && fact.project_id !== query.project_id) throw memoryErrors.conflict("目标候选账注项目身份矛盾");
          candidates.push(fact);
        }
      }
      if (fact.kind === "change" && fact.memory_id && fact.scope !== "personal" && scopeFor(fact)) {
        if (fact.project_id !== null && fact.project_id !== query.project_id) throw memoryErrors.conflict("目标记忆账注项目身份矛盾");
        changes.push(fact);
      }
    });
    const memoryIds = new Set(query.scopes.flatMap(scope => scope.memories.map(item => item.memory_id)));
    const forgottenIds = new Set([...memoryIds, ...changes.flatMap(item => item.memory_id ? [item.memory_id] : [])]);
    const forgotten = new Set<string>(), candidateSources = new Map<string, AgentMemorySourceRef[]>(), memorySources = new Map<string, AgentMemorySourceRef[]>();
    for (const candidate of candidates) if (candidate.sources_known) candidateSources.set(candidate.candidate_id, []);
    for (const id of memoryIds) memorySources.set(id, []);
    reader.rewind(); input.current();
    scan(reader, fact => {
      if (fact.kind === "forgotten" && fact.actor_id === "" && forgottenIds.has(fact.memory_id)) forgotten.add(fact.memory_id);
      if (fact.kind !== "source-link" || fact.actor_id !== query.actor_id) return;
      const source = { event_id: fact.event_id, version: fact.version };
      if (fact.candidate_id && fact.location.table === "candidates") candidateSources.get(fact.candidate_id)?.push(source);
      if (fact.memory_id && fact.location.table === "markers" && fact.operation_id === undefined && fact.candidate_id === undefined)
        memorySources.get(fact.memory_id)?.push(source);
    });
    return {
      candidates: candidates.map(fact => ({ scope: fact.scope, owner: fact.owner, candidate_id: fact.candidate_id,
        ...(fact.sources_known ? { source_refs: candidateSources.get(fact.candidate_id)! } : {}) })),
      changes: changes.map(fact => ({ scope: fact.scope, owner: fact.owner, memory_id: fact.memory_id!, forgotten: forgotten.has(fact.memory_id!) })),
      memorySources: [...memorySources].map(([memory_id, sources]) => ({ memory_id, sources })),
    };
  };
  return {
    isIdle: () => readers.size === 0,
    read(query: ProjectMemoryPurgeFactsQuery): ProjectMemoryPurgeLedgerFacts {
      if (readers.size) throw memoryErrors.conflict("上次目标账注检查尚未关闭");
      input.current();
      const reader = openMemoryLedgerRecoveryInspection({ homeDirectory: input.homeDirectory, assertCurrent: input.current,
        ...(input.signal ? { signal: input.signal } : {}) });
      readers.add(reader);
      let result: ProjectMemoryPurgeLedgerFacts;
      try { result = collect(reader, query); }
      catch (error) {
        try { dispose(reader); } catch (closeError) { throw new AggregateError([error, closeError], "目标账注检查与关闭失败"); }
        throw error;
      }
      dispose(reader); input.current(); return result;
    },
    close() {
      const errors: unknown[] = [];
      for (const reader of readers) try { dispose(reader); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, "目标账注检查尚未关闭");
    },
  };
}
