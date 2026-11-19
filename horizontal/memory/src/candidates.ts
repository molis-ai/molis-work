import type { MemoryCandidateRecord, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendCandidate, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import { belongsToMemorySession } from "./classification.js";
import { learnedInSession, type MemorySourceSession } from "./session-links.js";
import { candidateExpired } from "./policy.js";
import { memoryErrors } from "./errors.js";

interface Ports {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  operations: MemoryOperations;
  sourceSession?: MemorySourceSession;
  beforeEffect?(): void | Promise<void>;
  now(): Date;
  isForgotten(scope: MemoryScope, owner: string, id: string): boolean;
}

/** SDK candidate facts, conditional decisions and their explanatory ledger projection. No query writes. */
export class MemoryCandidates {
  constructor(private readonly ports: Ports) {}

  /** Join the ledger's notes with the current candidate owner; reading never repairs missing facts. */
  async records(caller: MemoryCaller, scope: MemoryScope, owner: string, canonical?: Map<string, MemoryBackendCandidate>,
    listed?: readonly MemoryBackendCandidate[]): Promise<MemoryCandidateRecord[]> {
    const held = new Map((listed ?? await this.ports.backend.withCaller(caller).candidates.list(scope, owner)).map(item => [item.candidate_id, item]));
    const out: MemoryCandidateRecord[] = [];
    for (const note of this.ports.ledger.candidates(caller.actor_id).filter(item => item.scope === scope && item.owner === owner)) {
      if (this.ports.isForgotten(scope, owner, note.candidate_id)) continue;
      let found = held.get(note.candidate_id);
      if (!found && (!caller.person || caller.memory_session)) {
        try { found = await this.ports.backend.withCaller(caller).candidates.get({ scope, owner, candidate_id: note.candidate_id, ...(caller.signal ? { signal: caller.signal } : {}) }); }
        catch (error) {
          caller.signal?.throwIfAborted();
          if (error instanceof Error && "code" in error && error.code === "MEMORY_SCOPE_DENIED") continue;
          throw error;
        }
      }
      if (!found) throw memoryErrors.not_found("记忆建议的原记录不可读；请核对存储后继续");
      if (!belongsToMemorySession(caller, found.meta) && !learnedInSession(caller, found.meta, found.sources ?? [], this.ports.sourceSession)) continue;
      canonical?.set(found.candidate_id, found);
      const state: MemoryCandidateRecord["state"] = found.state === "promoted" ? "accepted" : found.state;
      out.push({ ...note, version: found.version, state, memory_id: found.memory_id ?? note.memory_id });
    }
    return out;
  }

  async settle(caller: MemoryCaller, record: MemoryCandidateRecord, state: "discarded" | "expired"): Promise<MemoryCandidateRecord> {
    caller = this.ports.operations.caller(caller.person && caller.project_id === null ? { ...caller, project_id: record.project_id } : caller);
    const where = { scope: record.scope, owner: record.owner, candidate_id: record.candidate_id, ...this.ports.operations.candidate(caller, record, state) };
    const settled = state === "discarded" ? await this.ports.backend.withCaller(caller).candidates.discard(where) : await this.ports.backend.withCaller(caller).candidates.expire(where);
    const next: MemoryCandidateRecord = { ...record, state, version: settled.version };
    this.ports.ledger.saveCandidate(next);
    return next;
  }

  /** Called only by upkeep; a later pass resumes the same candidate decision after partial persistence. */
  async expire(caller: MemoryCaller, scope: MemoryScope, owner: string): Promise<void> {
    const canonical = new Map<string, MemoryBackendCandidate>();
    for (const record of await this.records(caller, scope, owner, canonical)) {
      const pending = record.state === "pending" && candidateExpired(canonical.get(record.candidate_id)!, this.ports.now().getTime());
      const repair = record.state === "expired" && this.ports.ledger.candidates(caller.actor_id)
        .some(note => note.candidate_id === record.candidate_id && note.state === "pending");
      if (!pending && !repair) continue;
      await this.ports.beforeEffect?.();
      caller.signal?.throwIfAborted();
      if (this.ports.isForgotten(scope, owner, record.candidate_id)) continue;
      if (repair) { this.ports.ledger.saveCandidate(record); continue; }
      const operation = this.ports.operations.child({ ...caller, operation_id: `candidate-expiry:${scope}:${owner}:${record.candidate_id}` }, "expire");
      await this.settle(operation, record, "expired");
    }
  }
}
