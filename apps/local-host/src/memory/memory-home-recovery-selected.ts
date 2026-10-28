import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryHomeRecoveryDecision } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { createMemoryLedgerSelectedRetention, inspectMemoryLedgerSelectedSources,
  type MemoryLedgerAdoptionSnapshot, type MemoryLedgerSelectedRetentionPlan } from "@molis-ai/molis-work-storage";
import type { SessionBusinessPurgeOwner } from "../session-business-purge.js";
import { prologueMemoryScope } from "./memory-backend.js";
import { retainRecoveryFailure, type MemoryHomeRecoveryFrame, type recoverySdkResources } from "./memory-home-recovery-resources.js";

/** Retained sources come from the same original Ledger owner as normal adoption cleanup. */
export function appendRecoveryTargetSources(frame: MemoryHomeRecoveryFrame, homeDirectory: string,
  memories: MemoryHomeRecoveryDecision["memories"], barriers: MemoryHomeRecoveryDecision["barriers"]): MemoryHomeRecoveryDecision["barriers"] {
  const result = structuredClone([...barriers]);
  try {
    const selected = inspectMemoryLedgerSelectedSources({ homeDirectory, assertCurrent: frame.current, targets: memories.map(item => ({
      ref: item.target.ref, identity: { scope: prologueMemoryScope(item.identity.scope), owner: item.identity.owner } })) });
    for (const item of selected) for (const source of item.sources) {
      if (source.actor_id !== LOCAL_PERSON_ACTOR_ID) throw memoryErrors.conflict("原记忆来源不属于当前本机主体");
      const identity = { scope: item.identity.scope === "user" ? "personal" as const : item.identity.scope, owner: item.identity.owner };
      const prior = result.find(value => value.actor_id === source.actor_id && isDeepStrictEqual(value.identity, identity));
      const ref = { event_id: source.event_id, version: source.version };
      if (prior) {
        if (!prior.sources.some(value => isDeepStrictEqual(value, ref))) result.splice(result.indexOf(prior), 1, { ...prior, sources: [...prior.sources, ref] });
      } else result.push({ actor_id: source.actor_id, identity, sources: [ref] });
    }
    frame.current(); return result;
  } catch (error) { return retainRecoveryFailure(frame, error); }
}

function retentionPlan(decision: MemoryHomeRecoveryDecision): MemoryLedgerSelectedRetentionPlan {
  const scopes: Array<MemoryLedgerSelectedRetentionPlan["scopes"][number]> = [];
  const identities = [...decision.memories.map(item => item.identity), ...decision.barriers.map(item => item.identity)]
    .filter((item, index, all) => !all.slice(0, index).some(other => isDeepStrictEqual(other, item)));
  for (const identity of identities) {
    const original = decision.memories.filter(item => isDeepStrictEqual(item.identity, identity));
    const value = (item: typeof original[number]) => item.target.mode === "already-cleared" ? { state: "cleared" as const } : { version: item.target.expected_version };
    const barriers = decision.barriers.filter(item => isDeepStrictEqual(item.identity, identity));
    if (barriers.some(item => item.actor_id !== LOCAL_PERSON_ACTOR_ID)) throw memoryErrors.conflict("原来源屏障的主体不能改变");
    scopes.push({ ...identity,
      memories: original.filter(item => item.target.ref.kind === "memory").map(item => ({ memory_id: item.target.ref.id, ...value(item) })),
      candidates: original.filter(item => item.target.ref.kind === "memory-candidate").map(item => ({ candidate_id: item.target.ref.id, ...value(item) })),
      sources: barriers.flatMap(item => item.sources) });
  }
  return { actor_id: LOCAL_PERSON_ACTOR_ID, operation_id: decision.operation_id, scopes };
}

type Context = { frame: MemoryHomeRecoveryFrame; homeDirectory: string; decision: MemoryHomeRecoveryDecision;
  sdk: ReturnType<typeof recoverySdkResources>; business: SessionBusinessPurgeOwner };

/** The parent already owns every tuple. This composition invokes only the original SDK and Ledger deletion owners. */
export async function applySelectedRecovery(input: Context): Promise<void> {
  const { frame, decision, sdk, business } = input, plan = retentionPlan(decision);
  const retained = createMemoryLedgerSelectedRetention({ homeDirectory: input.homeDirectory, plan, mode: "cleanup", assertCurrent: frame.current });
  const change = (work: (snapshot: MemoryLedgerAdoptionSnapshot) => MemoryLedgerAdoptionSnapshot) => {
    frame.current();
    try { const before = frame.expected().snapshot, after = work(before); frame.ledgerCommitted({ before, after }); }
    catch (error) { retainRecoveryFailure(frame, error); }
  };
  for (const scope of plan.scopes) change(snapshot => retained.suppressSources({ snapshot, scope: scope.scope, owner: scope.owner, sources: scope.sources }));
  const memoryPurges = decision.memories.flatMap(item => item.target.mode === "already-cleared" ? [] : [{
    ref: item.target.ref, identity: { scope: prologueMemoryScope(item.identity.scope), owner: item.identity.owner },
    expectedVersion: item.target.expected_version, operationId: item.target.operation_id,
    ...(item.target.selection ? { selection: { kind: "session" as const, sessionRef: { kind: "session" as const,
      id: item.target.selection.session.session_id, revision: 1 }, operationId: item.target.selection.operation_id } } : {}) }]);
  await sdk.write({ memoryPurges, sessionPurges: decision.sessions.map(item => ({ session: item.session, owner: item.owner, ...item.target })) }, async writer => {
    for (const item of decision.memories) {
      frame.current();
      const observed = await writer.inspectMemory({ ref: item.target.ref, identity: { scope: prologueMemoryScope(item.identity.scope), owner: item.identity.owner } }); frame.current();
      if (observed.state !== "cleared") {
        if (item.target.mode !== "present-purge" || observed.state !== "present") throw memoryErrors.conflict("原记忆仍未确认，不能用来源空态替代目标");
        await writer.purgeMemoryTarget({ ref: item.target.ref }); frame.current();
      }
      if (item.target.ref.kind === "memory") change(snapshot => retained.forget({ snapshot, memory_id: item.target.ref.id }));
      else change(snapshot => retained.dropCandidate({ snapshot, candidate_id: item.target.ref.id }));
    }
    for (const item of decision.sessions) { await writer.purgeSessionTarget({ session: item.session }); frame.current(); }
  });
  for (const item of decision.sessions) { frame.current(); await business.clear(item.business); frame.current(); }
  await verifySelectedRecovery(input);
}

/** Completion checks only original identities. It does not derive a new plan from current successors. */
export async function verifySelectedRecovery(input: Context): Promise<void> {
  const { frame, decision, sdk, business } = input;
  await sdk.inspect(async reader => {
    for (const item of decision.memories) {
      frame.current(); const observed = await reader.inspectMemory({ ref: item.target.ref,
        identity: { scope: prologueMemoryScope(item.identity.scope), owner: item.identity.owner } }); frame.current();
      if (observed.state !== "cleared") throw memoryErrors.conflict("原记忆的物理清除尚未确认");
    }
    for (const item of decision.sessions) {
      await reader.verifySessionPurge({ target: { session: item.session, owner: item.owner, ...item.target } }); frame.current();
    }
  });
  for (const item of decision.sessions) { await business.verifyOriginal(item.business); frame.current(); }
  try {
    createMemoryLedgerSelectedRetention({ homeDirectory: input.homeDirectory, plan: retentionPlan(decision), mode: "original", assertCurrent: frame.current })
      .verifyOriginal({ snapshot: frame.expected().snapshot }); frame.current();
  } catch (error) { retainRecoveryFailure(frame, error); }
}
