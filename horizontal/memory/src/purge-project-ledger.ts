import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memorySourceLinks, suppressMemorySources } from "./promotion.js";

export type ProjectMemoryPurgeLedger = Pick<MemoryLedgerPort, "dropCandidate" | "forget" | "forgetScopes"> & {
  suppressSources(scope: MemoryScope, owner: string, sources: readonly AgentMemorySourceRef[], at: string): void;
};
export function projectMemoryPurgeLedger(ledger: MemoryLedgerPort, actor: string): ProjectMemoryPurgeLedger {
  return { dropCandidate: id => ledger.dropCandidate(id), forget: id => ledger.forget(id), forgetScopes: input => ledger.forgetScopes(input),
    suppressSources: (scope, owner, sources, at) => suppressMemorySources(ledger, actor, scope, owner, sources, at) };
}

export interface ProjectMemoryPurgeFactsQuery {
  readonly project_id: string;
  readonly actor_id: string;
  readonly scopes: readonly { readonly scope: MemoryScope; readonly owner: string;
    readonly memories: readonly { readonly memory_id: string }[];
    readonly candidates: readonly { readonly candidate_id: string }[] }[];
}
/** Only the selected project's evidence, never text, a complete Ledger, or SDK CAS versions. */
export interface ProjectMemoryPurgeLedgerFacts {
  readonly candidates: readonly { readonly scope: MemoryScope; readonly owner: string; readonly candidate_id: string;
    readonly source_refs?: readonly AgentMemorySourceRef[] }[];
  readonly changes: readonly { readonly scope: MemoryScope; readonly owner: string; readonly memory_id: string; readonly forgotten: boolean }[];
  readonly memorySources: readonly { readonly memory_id: string; readonly sources: readonly AgentMemorySourceRef[] }[];
}

/** Online wiring preserves its existing Ledger semantics; cold callers supply bounded validated facts instead. */
export function readProjectMemoryPurgeLedgerFacts(ledger: MemoryLedgerPort, query: ProjectMemoryPurgeFactsQuery): ProjectMemoryPurgeLedgerFacts {
  const scopeFor = (entry: { scope: MemoryScope; owner: string }) => query.scopes.find(scope => scope.scope === entry.scope && scope.owner === entry.owner);
  return {
    candidates: ledger.candidates(query.actor_id).filter(note => {
      const scope = scopeFor(note);
      return scope && (scope.scope !== "personal" || scope.candidates.some(item => item.candidate_id === note.candidate_id));
    }).map(note => ({ scope: note.scope, owner: note.owner, candidate_id: note.candidate_id,
      ...(note.source_refs === undefined ? {} : { source_refs: note.source_refs }) })),
    changes: ledger.changes(query.actor_id, Number.MAX_SAFE_INTEGER).flatMap(note => {
      const scope = scopeFor(note);
      return scope && scope.scope !== "personal" && note.memory_id ? [{ scope: note.scope, owner: note.owner,
        memory_id: note.memory_id, forgotten: Boolean(ledger.marker("", `memory-forgotten:${note.memory_id}`)) }] : [];
    }),
    memorySources: query.scopes.flatMap(scope => scope.memories.map(item => ({ memory_id: item.memory_id,
      sources: memorySourceLinks(ledger, query.actor_id, item.memory_id) }))),
  };
}
