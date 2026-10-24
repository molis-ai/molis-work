import type { Runtime } from "@prologue/sdk";
import type { RoundState } from "./prologue-node-kit.js";
import type { PrologueSurfaces } from "./prologue-surfaces.js";
import type { PrologueEffects } from "./prologue-effects.js";

interface SessionCleanupDeps {
  readonly runtime: Pick<Runtime, "effects" | "hooks">;
  readonly state: RoundState;
  readonly checks: { forgetSession(sessionId: string): void };
  readonly stepBoards: { unfollow(runId: string): void };
  readonly surfaces: () => PrologueSurfaces | undefined;
  readonly effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">;
}

/** Release an already-idle session's local observers and caches while its SDK origins are still readable.
 * The caller owns the lifecycle fence and busy refusal; this never stops a Run or closes the Runtime.
 */
export async function cleanupSession(deps: SessionCleanupDeps, sessionId: string, indexedRuns: readonly string[]): Promise<void> {
  const { runtime, state } = deps;
  const runIds = new Set([...indexedRuns, ...[...state.runSessions].filter(([, owner]) => owner === sessionId).map(([runId]) => runId)]);
  const reviewIds: string[] = [];
  const pendingIds = new Set<string>();
  for (const [reviewId, ref] of state.reviewEffects) {
    const effect = runtime.effects.get(ref);
    if (effect?.proposal.origin?.session !== sessionId) continue;
    reviewIds.push(reviewId);
    if (effect.proposal.origin.run) runIds.add(effect.proposal.origin.run);
    if (effect.pending) pendingIds.add(effect.pending.ref.id);
  }
  // The lifecycle lane supplies durable attempts too: restored pending deadlines need not have a live Run handle.
  for (const run of runIds) {
    for (const pending of await runtime.effects.pendings.readByOrigin({ session: sessionId, run })) pendingIds.add(pending.ref.id);
  }
  await deps.effects.beforeEffect(); deps.effects.assertCurrent();
  deps.checks.forgetSession(sessionId);
  for (const runId of runIds) {
    for (const off of state.runObservers.get(runId) ?? []) off();
    state.runObservers.delete(runId);
    deps.stepBoards.unfollow(runId);
  }
  // Failure leaves the lifecycle pending. Keep the target maps until its close succeeds, so retry closes what remains.
  await deps.surfaces()?.closeSession(sessionId, deps.effects);
  await deps.effects.beforeEffect(); deps.effects.assertCurrent();
  runtime.hooks.unregister(`molis-announce-guard-${sessionId}`);
  runtime.hooks.unregister(`molis-action-gateway-${sessionId}`);
  for (const runId of runIds) {
    const ref = state.runRefs.get(runId);
    if (ref) runtime.effects.releaseRun(ref);
    state.actionControllers.delete(runId); state.activeRuns.delete(runId); state.runRoots.delete(runId);
    state.runSessions.delete(runId); state.runRefs.delete(runId); state.heldLabels.delete(runId); state.roundFacts.delete(runId);
    state.commandEvents.delete(runId); state.subagentBridgeErrors.delete(runId); state.runWork.delete(runId); state.dispatchChecks.delete(runId);
  }
  for (const reviewId of reviewIds) state.reviewEffects.delete(reviewId);
  for (const pendingId of pendingIds) state.deadlines.delete(pendingId);
  state.sessions.delete(sessionId); state.actionToolSessions.delete(sessionId); state.gatewayRuns.delete(sessionId);
  state.gatewayKnown.delete(sessionId); state.gatewayOffered.delete(sessionId); state.gatewayHooks.delete(sessionId);
  state.memoryRounds.delete(sessionId); state.changeRounds.delete(sessionId); state.stopGuards.delete(sessionId);
  state.stopHooks.delete(sessionId); state.liveSessions.delete(sessionId);
}
