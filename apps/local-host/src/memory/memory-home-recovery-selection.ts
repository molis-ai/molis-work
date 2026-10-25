import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryHomeRecoveryDecision, MemoryHomeRecoveryMemory, MemoryHomeRecoverySource, MemoryHomeRecoverySession } from "@molis-ai/molis-work-contracts/services/memory";
import type { PrologueMemoryAdoptionInspection } from "@molis-ai/molis-work-service-agent-host";
import { memoryErrors, type MemoryRecoverySourceObservation } from "@molis-ai/molis-work-service-memory";
import type { SessionBusinessPurgeOwner } from "../session-business-purge.js";
import { prologueMemoryScope } from "./memory-backend.js";
import { recoveryNextCursor, type RecoverySourceSession } from "./memory-home-recovery-source.js";

const conflict = () => memoryErrors.conflict("目标原件或原业务选择无法完整固定，保留采用阻断待核对");
const sdkSession = (session: MemoryHomeRecoverySession["session"]) => ({ kind: "session" as const, id: session.session_id, revision: 1 as const });
type Reader = PrologueMemoryAdoptionInspection;

/** Capture waits while their canonical Session relationship still exists; the business owner retains the IDs. */
export async function prepareRecoverySessions(input: { reader: Reader; sources: readonly RecoverySourceSession[];
  business: SessionBusinessPurgeOwner; operation_id: string; current(): void }): Promise<MemoryHomeRecoverySession[]> {
  const result: MemoryHomeRecoverySession[] = [];
  for (const source of input.sources) {
    input.current();
    const observed = await input.reader.inspectSession({ ref: sdkSession(source.session) }); input.current();
    // A prior purge may already have removed wait-to-Session relationships. No new empty App plan can prove them.
    if (observed.state !== "present") throw conflict();
    const target = await input.reader.prepareSessionPurge({ source: { session: source.session, owner: source.owner, termination: source.source },
      operationId: `${input.operation_id}:session:${source.session.session_id}` }); input.current();
    const ref = sdkSession(source.session), preview = { sessionRef: ref, atVersion: target.preview.version, runs: target.preview.runs,
      resources: target.preview.resources, destroysKey: target.preview.destroys_key };
    const waits: string[] = []; let cursor: string | undefined;
    do {
      const page = await input.reader.inspectSessionWaits({ ref, preview, ...(cursor ? { cursor } : {}) }); input.current();
      for (const wait of page.waits) {
        if (wait.kind !== "wait" || wait.revision !== 1 || waits.includes(wait.id)) throw conflict();
        waits.push(wait.id);
      }
      cursor = recoveryNextCursor(page, cursor);
    } while (cursor !== undefined);
    const business = await input.business.prepare({ session: source.session, owner: source.owner, wait_ids: waits }); input.current();
    result.push({ ...structuredClone(source), target: { decision: target.decision, preview: target.preview }, business });
  }
  return result;
}

function provenance(entry: MemoryRecoverySourceObservation): MemoryHomeRecoverySource {
  const value = entry.observation;
  if (value.kind !== "inspect-target") throw conflict();
  if (entry.fact.kind === "home-recovery-target") return structuredClone(entry.fact.memory.source);
  if (value.intent === "forgotten") return { kind: "forgotten" };
  if (!value.operation_id || !value.source_expected_version) throw conflict();
  return { kind: value.intent, actor_id: entry.fact.actor_id, operation_id: value.operation_id, expected_version: value.source_expected_version };
}

function addMemory(result: MemoryHomeRecoveryMemory[], entry: MemoryHomeRecoveryMemory): void {
  const prior = result.find(item => isDeepStrictEqual(item.target.ref, entry.target.ref));
  if (prior) {
    if (!isDeepStrictEqual(prior.identity, entry.identity) || !isDeepStrictEqual(prior.target, entry.target)) throw conflict();
    return;
  }
  result.push(entry);
}

/** Source intent selects identity only. The current target owner supplies its actual CAS or cleared proof. */
export async function prepareRecoveryMemories(input: { reader: Reader; observations: readonly MemoryRecoverySourceObservation[];
  known_scopes: MemoryHomeRecoveryDecision["known_scopes"];
  operation_id: string; current(): void }): Promise<MemoryHomeRecoveryMemory[]> {
  const result: MemoryHomeRecoveryMemory[] = [];
  for (const entry of input.observations) {
    const observation = entry.observation;
    if (observation.kind !== "inspect-target") continue;
    const identity = observation.identity;
    if (!input.known_scopes.some(scope => isDeepStrictEqual(scope, identity))) throw conflict();
    const ref = { kind: observation.target, id: observation.id, revision: 1 as const };
    input.current(); const observed = await input.reader.inspectMemory({ ref, identity: { ...identity, scope: prologueMemoryScope(identity.scope) } }); input.current();
    const source = provenance(entry);
    if (observed.state === "cleared") { addMemory(result, { identity, source, target: { ref, mode: "already-cleared" } }); continue; }
    if (observed.state !== "present" || !isDeepStrictEqual(observed.target.ref, ref)) throw conflict();
    addMemory(result, { identity, source, target: { ref, mode: "present-purge", expected_version: observed.target.expectedVersion,
      operation_id: `${input.operation_id}:${ref.kind}:${ref.id}` } });
  }
  return result;
}

/** The selected Session original operation owns its bound Memory preview and purge selection. */
export async function prepareRecoverySessionMemories(input: { reader: Reader; session: MemoryHomeRecoverySession;
  memories: readonly MemoryHomeRecoveryMemory[]; known_scopes: MemoryHomeRecoveryDecision["known_scopes"];
  operation_id: string; current(): void }): Promise<MemoryHomeRecoveryMemory[]> {
  const result = structuredClone([...input.memories]), item = input.session;
  for (const kind of ["memory", "memory-candidate"] as const) {
    const selection = { kind: "session" as const, sessionRef: sdkSession(item.session), operationId: item.target.decision.operation_id };
    let cursor: string | undefined;
    do {
      input.current(); const page = await input.reader.previewMemoryPurge({ kind, selection, ...(cursor ? { cursor } : {}) }); input.current();
      if (page.outcome !== "completed" || page.issues.length) throw conflict();
      for (const found of page.items) {
        if (found.identity.scope !== "user" && found.identity.scope !== "project" && found.identity.scope !== "character") throw conflict();
        const identity = { scope: found.identity.scope === "user" ? "personal" as const : found.identity.scope, owner: found.identity.owner };
        if (!input.known_scopes.some(scope => isDeepStrictEqual(scope, identity)) || found.kind !== kind || !isDeepStrictEqual(found.sessionRef, selection.sessionRef)) throw conflict();
        const prior = result.find(value => isDeepStrictEqual(value.target.ref, found.ref));
        // Session permission is needed after the original Session is prepared; retain it on any coincident source intent.
        if (prior) {
          if (!isDeepStrictEqual(prior.identity, identity) || prior.target.mode !== "present-purge" || prior.target.expected_version !== found.expectedVersion) throw conflict();
          result.splice(result.indexOf(prior), 1);
        }
        addMemory(result, { identity, source: prior?.source ?? { kind: "session-termination", session: item.session }, target: {
          ref: { kind, id: found.ref.id, revision: 1 }, mode: "present-purge", expected_version: found.expectedVersion,
          operation_id: `${input.operation_id}:${kind}:${found.ref.id}`, selection: { session: item.session, operation_id: item.target.decision.operation_id } } });
      }
      cursor = recoveryNextCursor(page, cursor);
    } while (cursor !== undefined);
  }
  return result;
}

export function recoveryBarriers(observations: readonly MemoryRecoverySourceObservation[]): MemoryHomeRecoveryDecision["barriers"][number][] {
  const result: MemoryHomeRecoveryDecision["barriers"][number][] = [];
  for (const entry of observations) if (entry.observation.kind === "event-barrier") {
    const { actor_id, identity, event_id } = entry.observation;
    if (actor_id !== LOCAL_PERSON_ACTOR_ID) throw conflict();
    const prior = result.find(value => value.actor_id === actor_id && isDeepStrictEqual(value.identity, identity));
    if (prior) { if (!prior.sources.some(source => source.event_id === event_id)) result.splice(result.indexOf(prior), 1, { ...prior, sources: [...prior.sources, { event_id }] }); }
    else result.push({ actor_id, identity, sources: [{ event_id }] });
  }
  return result;
}
