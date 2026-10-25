import { isDeepStrictEqual } from "node:util";
import type { MemoryHomeRecoveryDecision, MemoryHomeRecoverySession, MemoryOwnerRelation } from "@molis-ai/molis-work-contracts/services/memory";
import { collectMemoryLedgerRecoveryObservations, memoryErrors, type MemoryRecoverySourceObservation } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedgerRecoveryInspection } from "@molis-ai/molis-work-storage";
import type { PrologueMemoryAdoptionInspection, PrologueSessionIndexFact } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectDeletionCatalogSnapshot } from "../project-deletion-recovery-target.js";

export type RecoverySourceSession = Pick<MemoryHomeRecoverySession, "session" | "owner" | "source">;
const incomplete = () => memoryErrors.conflict("来源原删除决定、会话归属或终止事实尚未完整确认");

/** All rows are decoded by Storage; this pass retains only owner identities, never Home bodies. */
export function readRecoveryOwnerRelations(reader: ReturnType<typeof openMemoryLedgerRecoveryInspection>, current: () => void): MemoryOwnerRelation[] {
  const owners: MemoryOwnerRelation[] = [];
  for (;;) {
    current(); const page = reader.next(); current();
    if (page.issues.length || !page.exhausted && !page.facts.length) throw incomplete();
    owners.push(...page.facts.flatMap(fact => fact.kind === "owner" ? [fact.relation] : []));
    if (page.exhausted) return owners;
  }
}

/** Catalog's original plans supply retained identities to the one Memory source interpreter. */
export function readRecoveryMemorySource(reader: ReturnType<typeof openMemoryLedgerRecoveryInspection>, catalog: ProjectDeletionCatalogSnapshot,
  current: () => void) {
  const retained = catalog.receipts.flatMap(row => row.recovery.kind === "runtime"
    ? row.recovery.memory.scopes.flatMap(scope => scope.memories.map(item => ({ scope: scope.scope, owner: scope.owner, memory_id: item.memory_id }))) : []);
  return collectMemoryLedgerRecoveryObservations({ reader, retained, assertCurrent: current });
}

/** A continuation is transport state only. Empty intermediate pages still have to be consumed. */
export function recoveryNextCursor(page: { exhausted: boolean; cursor?: string }, previous: string | undefined): string | undefined {
  if (page.exhausted) return undefined;
  if (!page.cursor || page.cursor === previous) throw incomplete();
  return page.cursor;
}

/** A resume keeps its original grant; new source intent cannot silently join that already-fixed operation. */
export function assertRecoverySourceWithinDecision(observations: readonly MemoryRecoverySourceObservation[],
  sessions: readonly RecoverySourceSession[], decision: MemoryHomeRecoveryDecision): void {
  for (const { observation } of observations) {
    if (observation.kind === "inspect-target") {
      if (!decision.memories.some(item => item.target.ref.kind === observation.target && item.target.ref.id === observation.id
        && isDeepStrictEqual(item.identity, observation.identity))) throw incomplete();
    } else if (!decision.barriers.some(item => item.actor_id === observation.actor_id && isDeepStrictEqual(item.identity, observation.identity)
      && item.sources.some(source => source.event_id === observation.event_id))) throw incomplete();
  }
  for (const session of sessions) if (!decision.sessions.some(item => isDeepStrictEqual(item.session, session.session)
    && isDeepStrictEqual(item.owner, session.owner) && isDeepStrictEqual(item.source, session.source))) throw incomplete();
}

function sourceSession(index: PrologueSessionIndexFact, terminal: Awaited<ReturnType<PrologueMemoryAdoptionInspection["sessionTerminations"]>>["items"][number]): RecoverySourceSession {
  const { lifecycle, owner } = index, preview = terminal.preview;
  if (!owner.actor_id || lifecycle?.action !== "purge" || !lifecycle.preview
    || !isDeepStrictEqual(lifecycle.preview, preview) || lifecycle.decision.expected_version !== preview.atVersion
    || lifecycle.phase !== "prepared" && (terminal.phase !== "complete" || lifecycle.receipt?.version !== terminal.version)) throw incomplete();
  return { session: { runtime_id: "prologue", session_id: index.sessionRef.id }, owner: { ...owner, actor_id: owner.actor_id },
    source: { preview: { session: { runtime_id: "prologue", session_id: index.sessionRef.id }, version: preview.atVersion,
      runs: preview.runs, resources: preview.resources, destroys_key: preview.destroysKey }, phase: terminal.phase, version: terminal.version } };
}

/** A Session is owned by one exact source Index or an original Catalog topology, never by its name or timestamp. */
export async function readRecoverySessionSource(reader: PrologueMemoryAdoptionInspection, catalog: ProjectDeletionCatalogSnapshot,
  current: () => void): Promise<RecoverySourceSession[]> {
  const indexes: PrologueSessionIndexFact[] = [], terminals: Awaited<ReturnType<typeof reader.sessionTerminations>>["items"][number][] = [];
  let cursor: string | undefined;
  do {
    current(); const page = await reader.inspectSessionIndexes({ ...(cursor ? { cursor } : {}) }); current();
    indexes.push(...page.facts); cursor = recoveryNextCursor(page, cursor);
  } while (cursor !== undefined);
  do {
    current(); const page = await reader.sessionTerminations({ ...(cursor ? { cursor } : {}) }); current();
    terminals.push(...page.items); cursor = recoveryNextCursor(page, cursor);
  } while (cursor !== undefined);
  if (new Set(indexes.map(item => item.sessionRef.id)).size !== indexes.length
    || new Set(terminals.map(item => item.preview.sessionRef.id)).size !== terminals.length) throw incomplete();
  const projectSessions = catalog.receipts.flatMap(row => row.recovery.kind === "runtime" ? row.recovery.sessions.sessions : []);
  const independent: RecoverySourceSession[] = [];
  for (const terminal of terminals) {
    const id = terminal.preview.sessionRef.id, index = indexes.find(item => item.sessionRef.id === id);
    const held = projectSessions.filter(item => item.session.session_id === id);
    if (!held.length) {
      if (!index) throw incomplete();
      independent.push(sourceSession(index, terminal)); continue;
    }
    for (const item of held) {
      const preview = { sessionRef: { kind: "session", id, revision: 1 }, atVersion: item.preview.version,
        runs: item.preview.runs, resources: item.preview.resources, destroysKey: item.preview.destroys_key };
      if (!isDeepStrictEqual(preview, terminal.preview) || item.indexed !== !!index
        || index && !isDeepStrictEqual(item.owner, index.owner)) throw incomplete();
    }
  }
  // Prepared source intent without SDK termination is unresolved, not a new target write grant.
  for (const index of indexes) if (index.lifecycle?.action === "purge"
    && !projectSessions.some(item => item.session.session_id === index.sessionRef.id)
    && !terminals.some(item => item.preview.sessionRef.id === index.sessionRef.id)) throw incomplete();
  current(); return independent;
}
