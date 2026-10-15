import { AsyncLocalStorage } from "node:async_hooks";
import { BUILT_IN_ADAPTERS, createAdapterRegistry } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";
import type { AgentRuntimeAdapter, AgentRuntimeDiagnostics } from "@molis-ai/molis-work-contracts/services/agent-host";
import { announcesWithoutActing } from "./announce-guard.js";
import type { createPluginBuilderAgent, PluginBuilderAgentOptions } from "./plugin-builder.js";
import { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { PrologueCredentialBridge } from "./prologue-credentials.js";
import { prologueEffects } from "./prologue-effects.js";
import type { PrologueGitReviewPort } from "./prologue-git.js";
import type { PrologueInferenceClient } from "../inference.js";
import { createPrologueMcpLibrary } from "./prologue-mcp.js";
import { createPrologueMemory } from "./prologue-memory.js";
import { readResource, readResourceText, createRoundState, type DispatchGuards, type PrologueNodeAdapterOptions } from "./prologue-node-kit.js";
import { createNodeCoordination, createNodeInference, createNodeProjectWork } from "./prologue-node-parts.js";
import { answerPending, createNodeGitReviews, createNodePort, createNodeRuntime, directoriesIdle, questionReader } from "./prologue-node-port.js";
import { createPrologueRecovery } from "./prologue-recovery.js";
import { createApprovals, createPendingPort, createReviewMemory, restoreReviewHistory } from "./prologue-review-documents.js";
import { createPrologueSchedule } from "./prologue-schedule.js";
import { createSessionIndexStore } from "./prologue-session-index.js";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";
import { createPrologueSurfaces, type PrologueSurfaces } from "./prologue-surfaces.js";
import { resolveModelHostname } from "./node-model-dns.js";
import { PrologueAgentAdapter } from "./prologue.js";

export { THINKING_OUTPUT_TOKENS } from "./prologue-run-params.js";
export { PrologueCredentialBridge, type PrologueCredentialHost } from "./prologue-credentials.js";
export type { PrologueNodeAdapterOptions } from "./prologue-node-kit.js";
export { SUBAGENT_DEFAULT_TURNS } from "./prologue-node-port.js";
export { MODEL_CALL_TIMEOUT_MS } from "./prologue-run.js";

/**
 * The SDK-specific Node composition, with colocated SDK helpers.
 *
 * It adapts the SDK's shapes to the narrow port the adapter needs, so the
 * adapter's behavior stays testable without a model, a network or a disk.
 * Its parts are their own modules (W4-06): the runtime and its port
 * (prologue-node-port), a round's start (prologue-run), reviews
 * (prologue-review-documents), recovery (prologue-recovery), the session index
 * (prologue-session-index), timed work (prologue-schedule) and the
 * coordination parts (prologue-node-parts); this file only puts them together.
 *
 * The packed SDK is exercised with MiniMax by prologue-node-live.test.ts.
 * This verifies the execution boundary; product entry and recovery need their
 * own end-to-end verification.
 */

/**
 * What Prologue's own adapter table says: which protocol keys exist, and which
 * of them lets us set a cache breakpoint.
 *
 * Read from the SDK rather than copied into a list of our own, so a rename over
 * there reaches our tests instead of quietly diverging. SDK imports stay within the Node composition and its colocated helpers;
 * the runtime port and plugin remain independent of SDK implementation types.
 */
export function prologueProtocolFacts(): ReadonlyArray<{
  readonly protocol: string;
  readonly prompt_cache: boolean;
}> {
  return BUILT_IN_ADAPTERS.map((adapter) => ({
    protocol: adapter.protocol,
    prompt_cache: adapter.supportsPromptCache === true,
  }));
}

/** Whether Prologue would accept this protocol name. Throwing is its own answer. */
export function prologueAcceptsProtocol(protocol: string): boolean {
  const select = createAdapterRegistry(BUILT_IN_ADAPTERS);
  try {
    select(protocol);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the Prologue Runtime on the Node host.
 *
 * Without a Host review owner it stays read-only. Attaching that owner enables
 * workspace writes with untrusted approval; each writing role must also pass
 * the capability matrix and its frozen tool allowlist.
 */
export async function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter & { inference: PrologueInferenceClient; createBuilderAgent(options: PluginBuilderAgentOptions): ReturnType<typeof createPluginBuilderAgent>; gitReviews?: PrologueGitReviewPort;
  surfaces?: { decide(decision: Parameters<PrologueSurfaces["decide"]>[0]): void }; withEffect: NonNullable<AgentRuntimeAdapter["withEffect"]>; assertDirectoriesIdle(paths: readonly string[]): Promise<void> }> {
  const release = options.storageRoot ? acquirePrologueStorageOwner(options.storageRoot) : () => {};
  try {
    const adapter = await initializePrologueNodeAdapter(options);
    const close = adapter.close.bind(adapter);
    let closing: Promise<void> | undefined;
    adapter.close = () => closing ??= (async () => {
      await close();
      release();
    })();
    return adapter;
  } catch (error) { release(); throw error; }
}

async function initializePrologueNodeAdapter(options: PrologueNodeAdapterOptions) {
  // Async context holds only a trusted denial guard, never serializes it in a Run.
  const dispatchGuards: DispatchGuards = new AsyncLocalStorage<() => void | Promise<void>>();
  const host = createNodeHost({
    // This process holds the storage root's owner lock (acquirePrologueStorageOwner) for its whole life, so a write claim
    // found there at start is one a crashed owner left: the Host clears it instead of refusing that record for ever.
    ...(options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot, exclusiveOwner: true }),
    resolveHost: resolveModelHostname,
    beforeNetworkDispatch: async () => { await dispatchGuards.getStore()?.(); },
    // A model call that got no response at all (the connection dropped) is sent again under the retry policy, rather
    // than ending the round: the person's decision (2026-09-27), knowing a dropped request may be billed twice.
    retryUnansweredModelCalls: true,
  });
  // Each invocation's SDK writes re-check its caller first (prologue-effects); accepted runs detach from the start call.
  const effects = prologueEffects(host);
  const schedule = createPrologueSchedule();
  // Bound after the runtime exists; the redactor it is given reaches it only when a screenshot is taken.
  let surfaceHost: PrologueSurfaces | undefined;
  const state = createRoundState();
  const runtime = await createNodeRuntime(options, effects.host, schedule.run, () => surfaceHost, { forRun: runId => state.dispatchChecks.get(runId) });
  surfaceHost = options.surfaces ? createPrologueSurfaces(() => runtime, options.surfaces, ref => readResourceText(runtime, ref)) : undefined;
  // Sites the person allowed earlier, as approvals the person can take back at once (not as rules fixed at start).
  if (surfaceHost && options.reviewQueue) for (const entry of options.surfaces!.siteDecisions()) if (entry.decision === "allow") surfaceHost.decide(entry);
  const credentials = new PrologueCredentialBridge({
    host: { writeCredential: (input) => runtime.credentials.write(input) },
    resolve: options.resolveCredential,
  });
  const mcpLibrary = createPrologueMcpLibrary(runtime, {
    withDispatchGuard: (guard, operation) => {
      const inherited = dispatchGuards.getStore();
      return dispatchGuards.run(async () => { await inherited?.(); await guard(); }, operation);
    },
    resolveConnection: options.resolveMcpConnection,
    subscribeConnections: options.subscribeMcpConnections,
    credentialRefFor: (ref) => credentials.prologueRefFor(ref),
  });
  const index = createSessionIndexStore(effects.host, options.app.appId);
  const surfaces = () => surfaceHost;
  const platformMemory = createPrologueMemory(runtime, effects.bind);
  const gitReviews = createNodeGitReviews(options, host, runtime);
  const projectWork = createNodeProjectWork(options, host, runtime, state);
  const { messages, waitsPort, stepBoards } = createNodeCoordination(runtime, index, state, projectWork);
  const reviews = { runtime, host, state, index, options, surfaces, projectWork };
  const pendings = createPendingPort(reviews);
  const remember = createReviewMemory(reviews);
  const approvals = createApprovals(reviews, pendings, remember);
  const detachReviews = restoreReviewHistory(reviews, pendings, remember);
  const checkpoints = options.reviewQueue ? createPrologueCheckpoints({ runtime, queue: options.reviewQueue, readIndex: index.read, readResource: ref => readResource(runtime, ref),
    remember: (id, intent) => index.update(id, saved => { (saved.rewinds ??= []).push(intent); }),
    decision: (id, pendingId, receipt) => index.update(id, saved => {
      (saved.review_decisions ??= {})[pendingId] = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note };
    }),
  }) : undefined;
  const { inference, createBuilderAgent, close: closeInference } = createNodeInference(runtime, options, credentials, dispatchGuards);
  const recovery = createPrologueRecovery({ runtime, index, state, checkpoints });
  const readQuestion = questionReader(runtime);
  const port = createNodePort({ runtime, effects, host, options, state, index, dispatchGuards, surfaces, mcpLibrary, platformMemory, credentials, stepBoards, projectWork,
    messages, waitsPort, checkpoints, approvals, schedule, recovery, readQuestion,
    shutdown: async () => {
      mcpLibrary.dispose();
      await closeInference();
      for (const controller of state.actionControllers.values()) controller.abort();
      state.actionControllers.clear();
      stepBoards.close(); messages.close(); waitsPort.close();
      detachReviews?.();
      await checkpoints?.close(); await gitReviews?.close();
      return runtime.shutdown();
    } });

  return Object.assign(new PrologueAgentAdapter({
    runtime: { ...port, startAgentRun: input => effects.start(input, () => port.startAgentRun(input)) },
    modelConfiguration: options.modelConfiguration,
    stopHeld: runId => { const queue = state.heldLabels.get(runId); const next = queue?.shift(); if (queue && !queue.length) state.heldLabels.delete(runId); return next; },
    // Judged when the run ends, from its last words: the runtime stops consulting the hook after it has held twice.
    endedOnPromise: (runId, sessionId, text) => {
      const guard = state.stopGuards.get(sessionId), held = guard?.held.get(runId);
      guard?.held.delete(runId);
      return Boolean(guard?.writing && held?.has("announce") && announcesWithoutActing(text));
    },
    approvals,
    answerPending: answerPending({ runtime, host, state, readQuestion }),
  }), { inference, createBuilderAgent, gitReviews, diagnostics: () => runtimeDiagnostics(runtime),
    /** The person's standing site decisions for the side panel's browser, applied to the running runtime. */
    surfaces: surfaceHost ? { decide: (decision: Parameters<PrologueSurfaces["decide"]>[0]) => surfaceHost!.decide(decision) } : undefined,
    assertDirectoriesIdle: directoriesIdle(runtime, index), withEffect: effects.call });
}

/** The runtime's own receipts, as the developer diagnostics page shows them. */
export function runtimeDiagnostics(runtime: Pick<import("@prologue/sdk").Runtime, "identity" | "state" | "assembly" | "capabilityReport" | "ledgerFailures">): AgentRuntimeDiagnostics {
  const report = runtime.capabilityReport;
  return {
    app: { app_id: runtime.identity.app.appId, app_version: runtime.identity.app.appVersion },
    state: runtime.state,
    fingerprint: runtime.assembly.fingerprint,
    slots: Object.entries(runtime.assembly.slots).map(([slot, resolved]) => ({ slot, state: resolved.state, implementation: resolved.implementation ?? null,
      version: resolved.version ?? null, why: resolved.why ?? null, fallback: resolved.usedFallback })),
    host: { requested: [...report.requested], effective: [...report.effective],
      not_present: Object.entries(report.actual).filter(([, state]) => state !== "present").map(([capability, state]) => ({ capability, state })) },
    ledger_failures: runtime.ledgerFailures.map(entry => ({ kind: entry.kind, seq: entry.seq, code: entry.code ?? null, detail: entry.detail ?? null })),
  };
}
