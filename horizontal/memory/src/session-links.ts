import type { AgentMemoryMeta, AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "./service.js";
import { memoryPromotionSources } from "./promotion.js";

/** Which Runtime session an original input belongs to; the Host owns the source identity format. */
export type MemorySourceSession = (ref: AgentMemorySourceRef) => string | undefined;

/**
 * A long-term memory or suggestion that was learned from what the person said in this business session (its sources name the
 * session), as opposed to one classified as the session's own (`session_ref`). The session page shows and counts both, and
 * clearing the session removes both; the long-term ones go through the ordinary forgetting path, not the exact session purge.
 */
export function learnedInSession(caller: Pick<MemoryCaller, "memory_session">, meta: AgentMemoryMeta, refs: readonly AgentMemorySourceRef[],
  sourceSession: MemorySourceSession | undefined): boolean {
  const session = caller.memory_session?.session.session_id;
  return !!session && !!sourceSession && !meta.session_ref && meta.classification?.lifecycle !== "session"
    && refs.some(ref => sourceSession(ref) === session);
}

/** The sources a formal memory was ever promoted, accepted or written from (the promotion ledger's links). */
export function memorySources(ledger: MemoryLedgerPort, actorId: string, memoryId: string): readonly AgentMemorySourceRef[] {
  return memoryPromotionSources(ledger, () => new Date()).linked(actorId, memoryId);
}
