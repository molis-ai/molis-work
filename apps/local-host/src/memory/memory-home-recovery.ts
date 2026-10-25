import { isAbsolute, relative, sep } from "node:path";
import type { MemoryHomeRecoveryDecision, MemoryHomeRecoveryRequest, MemoryHomeRecoveryResult } from "@molis-ai/molis-work-contracts/services/memory";
export type { MemoryHomeRecoveryResult } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { inspectExistingStoragePath } from "@molis-ai/molis-work-storage";
import { createSessionBusinessPurgeOwner as composeSessionBusinessPurgeOwner, type SessionBusinessPurgeInput, type SessionBusinessPurgeOwner } from "../session-business-purge.js";
import { codingManifest, prepareCodingSessionPurge, clearCodingSessionPurge, verifyCodingSessionPurge } from "@molis-ai/molis-work-plugin-coding";
import { reconcileProjectDeletionHistory } from "../project-deletion-recovery-history.js";
import { convert, profilesForAdoption, type MemoryHomeAdoptionResult } from "./memory-home-adoption.js";
import { openMemoryHomeRecoveryFrame } from "./memory-home-recovery-frame.js";
import { assertRecoverySourceWithinDecision, readRecoverySessionSource, type RecoverySourceSession } from "./memory-home-recovery-source.js";
import { prepareRecoveryMemories, prepareRecoverySessionMemories, prepareRecoverySessions, recoveryBarriers } from "./memory-home-recovery-selection.js";
import { appendRecoveryTargetSources, applySelectedRecovery, verifySelectedRecovery } from "./memory-home-recovery-selected.js";
import { readRecoveryCatalog, readRecoveryHomeFacts, recoveryScopes, recoverySdkResources,
  type MemoryHomeRecoveryFrame } from "./memory-home-recovery-resources.js";
import { restoreRecoveryProjects, type MemoryHomeRecoveryPlatform } from "./memory-home-recovery-projects.js";
import { coldProjectMemoryReads } from "./memory-cold-project-sdk.js";
import { verifyMemoryCoverage } from "./memory-project-coverage.js";

export interface MemoryHomeRecoveryInput extends MemoryHomeRecoveryRequest {
  /** Synchronous live offline-maintenance authority. No ordinary App Runtime may be running on either copy. */
  assertCurrent(): void;
  readonly signal?: AbortSignal;
}
const invalid = () => memoryErrors.conflict("恢复需要同一历史的明确停写工作副本与原操作号");

function fixedInput(input: MemoryHomeRecoveryInput) {
  const { homeDirectory, sourceDirectory, operation_id, assertCurrent, signal } = input;
  if (![homeDirectory, sourceDirectory].every(value => typeof value === "string" && isAbsolute(value))
    || typeof operation_id !== "string" || !operation_id.trim() || typeof assertCurrent !== "function") throw invalid();
  const within = (parent: string, child: string) => { const value = relative(parent, child); return value === "" || value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value); };
  if (within(homeDirectory, sourceDirectory) || within(sourceDirectory, homeDirectory)) throw invalid();
  const home = inspectExistingStoragePath(homeDirectory, "directory"), source = inspectExistingStoragePath(sourceDirectory, "directory");
  if (!home.exists || !source.exists) throw invalid();
  const current = () => {
    if (signal?.aborted) throw memoryErrors.conflict("恢复维护已取消，原资源仍须关闭");
    home.assertCurrent(); source.assertCurrent();
    // Caller errors never carry an executable cleanup capability into a resource owner's failure channel.
    try {
      const result: unknown = assertCurrent();
      if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); throw invalid(); }
    } catch (error) { throw Object.assign(new Error("恢复维护权限已失效", { cause: error }), { code: "memory.conflict" }); }
    if (signal?.aborted) throw memoryErrors.conflict("恢复维护已取消，原资源仍须关闭");
    home.assertCurrent(); source.assertCurrent();
  };
  current(); return { homeDirectory, sourceDirectory, operation_id, current };
}

async function prepareDecision(frame: MemoryHomeRecoveryFrame, input: ReturnType<typeof fixedInput>,
  source: Awaited<ReturnType<typeof readRecoveryCatalog>>, sourceFacts: Awaited<ReturnType<typeof readRecoveryHomeFacts>>,
  scopes: ReturnType<typeof recoveryScopes>, business: ReturnType<typeof createSessionBusinessPurgeOwner>, sourceSessions: readonly RecoverySourceSession[]) {
  const { groups } = reconcileProjectDeletionHistory(source.receipts, frame.catalog().receipts, []);
  const targetSdk = recoverySdkResources(frame, input.homeDirectory, scopes, input.operation_id, sourceSessions.map(item => item.session));
  const known_scopes = scopes.map(item => ({ ...item, scope: item.scope === "user" ? "personal" as const : item.scope }));
  const sessions = await targetSdk.inspect(reader => prepareRecoverySessions({ reader, sources: sourceSessions, business,
    operation_id: input.operation_id, current: frame.current }));
  let memories = await targetSdk.inspect(reader => prepareRecoveryMemories({ reader, observations: sourceFacts.observations,
    known_scopes, operation_id: input.operation_id, current: frame.current }));
  for (const session of sessions) {
    const selectedSdk = recoverySdkResources(frame, input.homeDirectory, scopes, session.target.decision.operation_id, [session.session]);
    memories = await selectedSdk.inspect(reader => prepareRecoverySessionMemories({ reader, session, memories,
      known_scopes, operation_id: input.operation_id, current: frame.current }));
  }
  const selected = { sessions, memories };
  const barriers = appendRecoveryTargetSources(frame, input.homeDirectory, selected.memories, recoveryBarriers(sourceFacts.observations));
  frame.beginDecision({ kind: "home-recovery", operation_id: input.operation_id,
    known_scopes: scopes.map(item => ({ ...item, scope: item.scope === "user" ? "personal" : item.scope })),
    ...selected, barriers, project_groups: groups });
  return frame.expected().parent!.body;
}

async function finishRecovery(frame: MemoryHomeRecoveryFrame, input: ReturnType<typeof fixedInput>, decision: MemoryHomeRecoveryDecision,
  source: Awaited<ReturnType<typeof readRecoveryCatalog>>, coverage: Awaited<ReturnType<typeof readRecoveryHomeFacts>>["coverage"],
  platform: MemoryHomeRecoveryPlatform, business: ReturnType<typeof createSessionBusinessPurgeOwner>) {
  const scopes = decision.known_scopes.map(item => ({ ...item, scope: item.scope === "personal" ? "user" as const : item.scope }));
  const sdk = recoverySdkResources(frame, input.homeDirectory, scopes, input.operation_id, decision.sessions.map(item => item.session));
  const selected = { frame, homeDirectory: input.homeDirectory, decision, sdk, business };
  if (decision.phase === "committed") await verifySelectedRecovery(selected);
  else await applySelectedRecovery(selected);
  await restoreRecoveryProjects({ frame, ...input, decision, source, coverage, business, platform });
  if (decision.phase === "committed") {
    await sdk.inspect(reader => verifyMemoryCoverage(coldProjectMemoryReads(reader, { operationId: input.operation_id, scopes, current: frame.current }),
      { operation_id: input.operation_id, known_scopes: scopes }, frame.current));
    await frame.close(); return;
  }
  const result: MemoryHomeAdoptionResult = { outcome: "completed", items: { adopted: 0, current: 0, "needs-reconcile": 0, conflict: 0, unknown: 0 }, verification: "not-run" };
  await sdk.write({}, bridge => convert(bridge, scopes, result));
  frame.current();
  if (result.outcome !== "completed" || result.verification !== "complete") throw memoryErrors.conflict("恢复后的完整 SDK 采用核对尚未通过");
  // All final resources remain under the same Home owner until the original parent transaction publishes.
  await frame.publish(profilesForAdoption(frame.expected().snapshot));
}

/** Public cold maintenance composition. Failures retain the original resources through error.close(), without replay. */
export async function recoverMemoryHome(input: MemoryHomeRecoveryInput, platform: MemoryHomeRecoveryPlatform): Promise<MemoryHomeRecoveryResult> {
  const fixed = fixedInput(input);
  const frame = await openMemoryHomeRecoveryFrame({ homeDirectory: fixed.homeDirectory, operation_id: fixed.operation_id, assertCurrent: fixed.current });
  try {
    const previous = frame.expected().parent?.body;
    if (!previous) frame.beginAdoption();
    const source = await readRecoveryCatalog(frame, fixed.sourceDirectory);
    const sourceFacts = await readRecoveryHomeFacts(frame, fixed.sourceDirectory, true, source);
    const targetFacts = await readRecoveryHomeFacts(frame, fixed.homeDirectory, false, frame.catalog());
    const scopes = recoveryScopes(sourceFacts.coverage.knownScopes, targetFacts.coverage.knownScopes, previous?.known_scopes);
    const sourceSdk = recoverySdkResources(frame, fixed.sourceDirectory, scopes, fixed.operation_id, []);
    const sourceSessions = await sourceSdk.inspect(reader => readRecoverySessionSource(reader, source, frame.current));
    if (previous) assertRecoverySourceWithinDecision(sourceFacts.observations, sourceSessions, previous);
    const business = createSessionBusinessPurgeOwner({ homeDirectory: fixed.homeDirectory, assertCurrent: frame.current, projectDatabase: frame.projectDatabase });
    frame.retain(business);
    if (previous && reconcileProjectDeletionHistory(source.receipts, frame.catalog().receipts, previous.project_groups).fresh.length) throw invalid();
    const decision = previous ?? await prepareDecision(frame, fixed, source, sourceFacts, scopes, business, sourceSessions);
    await finishRecovery(frame, fixed, decision, source, targetFacts.coverage, platform, business);
    return { outcome: "completed", operation_id: fixed.operation_id, replayed: previous !== undefined };
  } catch (error) { throw frame.failure(error); }
}

/** Assemble the original Coding rules for cold Session maintenance, without creating or activating a plugin. */
export function createSessionBusinessPurgeOwner(input: SessionBusinessPurgeInput): SessionBusinessPurgeOwner {
  return composeSessionBusinessPurgeOwner(input, { manifest: codingManifest, prepare: prepareCodingSessionPurge,
    clear: clearCodingSessionPurge, verify: verifyCodingSessionPurge });
}
