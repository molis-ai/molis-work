import { AsyncLocalStorage } from "node:async_hooks";
import { isAbsolute } from "node:path";
import { BUILT_IN_ADAPTERS, createAdapterRegistry } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";
import type { AgentRuntimeAdapter, AgentRuntimeDiagnostics, AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { endedOnPromise } from "./prologue-stop-guard.js";
import type { createPluginBuilderAgent, PluginBuilderAgentOptions } from "./plugin-builder.js";
import { actionToolRefs } from "./prologue-action-tools.js";
import { createPrologueConditionCheckers } from "./prologue-checkers.js";
import { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { PrologueCredentialBridge } from "./prologue-credentials.js";
import { prologueEffects } from "./prologue-effects.js";
import type { PrologueGitReviewPort } from "./prologue-git.js";
import type { PrologueInferenceClient } from "../inference.js";
import { createPrologueMcpLibrary } from "./prologue-mcp.js";
import { createPrologueMemory } from "./prologue-memory.js";
import { createPrologueMemoryAuthority } from "./prologue-memory-authority.js";
import { readResource, readResourceText, createRoundState, type DispatchGuard, type DispatchGuards, type PrologueNodeAdapterOptions } from "./prologue-node-kit.js";
import { createNodeCoordination, createNodeInference, createNodeProjectWork } from "./prologue-node-parts.js";
import { createWorkGraphs } from "./prologue-work-graphs.js";
import { answerPending, createNodeGitReviews, createNodePort, createNodeRuntime, directoriesIdle, questionReader } from "./prologue-node-port.js";
import { createPrologueRecovery } from "./prologue-recovery.js";
import { createApprovals, createPendingPort, createReviewMemory, restoreReviewHistory } from "./prologue-review-documents.js";
import { createPrologueSchedule } from "./prologue-schedule.js";
import { createProjectDeletion, type PrologueProjectDeletion } from "./prologue-project-deletion.js";
import { createSessionIndexStore } from "./prologue-session-index.js";
import { createPrologueWriteCheckers } from "./prologue-write-checkers.js";
import { acquirePrologueStorageOwner } from "./prologue-storage-owner.js";
import { createPrologueSurfaces, type PrologueSurfaces } from "./prologue-surfaces.js";
import { resolveModelHostname } from "./node-model-dns.js";
import { PrologueAgentAdapter } from "./prologue.js";
import { agentErrors } from "../errors.js";
export { PrologueCredentialBridge, type PrologueCredentialHost } from "./prologue-credentials.js";
export type { PrologueNodeAdapterOptions } from "./prologue-node-kit.js";
export { SUBAGENT_DEFAULT_TURNS } from "./prologue-node-port.js";

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
export function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter & { inference: PrologueInferenceClient; createBuilderAgent(options: PluginBuilderAgentOptions): ReturnType<typeof createPluginBuilderAgent>; gitReviews?: PrologueGitReviewPort; writeCheckers: AgentWriteCheckerStore;
  projectDeletion: PrologueProjectDeletion; surfaces?: { decide(decision: Parameters<PrologueSurfaces["decide"]>[0]): void }; withEffect: NonNullable<AgentRuntimeAdapter["withEffect"]>; assertDirectoriesIdle(paths: readonly string[]): Promise<void> }> & { close(): Promise<void> } {
  let release: (() => void) | undefined, closeAdapter: (() => Promise<void>) | undefined, closing: Promise<void> | undefined;
  const cleanup = new Set<() => Promise<void>>();
  const keep = (close: () => unknown) => {
    const pending = async () => {
      if (!cleanup.has(pending)) return;
      await close();
      cleanup.delete(pending);
    };
    cleanup.add(pending);
    return pending;
  };
  const closePending = async () => {
    const failures: unknown[] = [];
    for (const close of [...cleanup].reverse()) { try { await close(); } catch (failure) { failures.push(failure); } }
    return failures;
  };
  const relinquish = () => { release?.(); release = undefined; };
  const initialized = (async () => {
    if (typeof options.storageRoot !== "string" || !isAbsolute(options.storageRoot)) {
      throw agentErrors.storage_root_invalid("Agent 执行服务需要明确的绝对存储目录；不会回退到当前目录或用户默认存储");
    }
    release = acquirePrologueStorageOwner(options.storageRoot, options.storageOwner);
    try {
      const adapter = await initializePrologueNodeAdapter(options, keep);
      closeAdapter = adapter.close.bind(adapter);
      adapter.close = close;
      return adapter;
    } catch (error) {
      const failures = await closePending();
      if (failures.length) throw new AggregateError([error, ...failures], "Agent 初始化未完成，资源清理失败；仍保留存储所有权");
      relinquish(); throw error;
    }
  })();
  // Keep this handle even when initialization rejects: the rejection does not close outstanding resources.
  function close(): Promise<void> {
    return closing ??= (async () => {
      await initialized.catch(() => undefined);
      if (closeAdapter) await closeAdapter();
      else {
        const failures = await closePending();
        if (failures.length) throw new AggregateError(failures, "Agent 资源清理失败；仍保留存储所有权");
      }
      relinquish();
    })().catch(error => { closing = undefined; throw error; });
  }
  return Object.assign(initialized, { close });
}

async function initializePrologueNodeAdapter(options: PrologueNodeAdapterOptions, onFailureClose: (close: () => unknown) => () => Promise<void>) {
  // Async context holds only a trusted denial guard, never serializes it in a Run.
  const dispatchGuards: DispatchGuards = new AsyncLocalStorage<DispatchGuard>();
  const host = createNodeHost({
    // This runtime owns or borrows the storage root's actual owner lock for its whole life, so a write claim
    // found there at start is one a crashed owner left: the Host clears it instead of refusing that record for ever.
    storageRoot: options.storageRoot, exclusiveOwner: true,
    resolveHost: resolveModelHostname,
    beforeNetworkDispatch: async () => dispatchGuards.getStore()?.(),
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
  const index = createSessionIndexStore(effects.host, options.app.appId, options.projectDeletionPending,
    id => [...state.activeRuns].some(([run, active]) => state.runSessions.get(run) === id && active.live()));
  const memoryAuthority = createPrologueMemoryAuthority(options.memory, index, effects);
  // Bound to the runtime once it exists; nothing is looked at before a wait is registered.
  const checks = createPrologueConditionCheckers({ runtime: () => runtime, ports: options.checks, project: async id => (await index.read(id).catch(() => undefined))?.owner.project_id,
    owner: async id => (await index.read(id).catch(() => undefined))?.owner });
  const runtime = await createNodeRuntime(options, effects.host, schedule.run, () => surfaceHost, { forRun: runId => state.dispatchChecks.get(runId) }, checks.checkers, memoryAuthority);
  const closeRuntime = onFailureClose(() => runtime.shutdown());
  const closeChecks = onFailureClose(() => checks.close());
  checks.open();
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
      return dispatchGuards.run(async () => { const fence = await inherited?.(); await guard(); return fence; }, operation);
    },
    directoryAuthorized: options.checks?.directoryAuthorized,
    resolveConnection: options.resolveMcpConnection, saveConnection: options.saveMcpConnection,
    subscribeConnections: options.subscribeMcpConnections,
    credentialRefFor: (ref) => credentials.prologueRefFor(ref),
  });
  const closeMcp = onFailureClose(() => mcpLibrary.dispose());
  const surfaces = () => surfaceHost;
  const platformMemory = createPrologueMemory(runtime, effects, memoryAuthority.binding);
  const gitReviews = createNodeGitReviews(options, host, runtime);
  const closeGit = onFailureClose(() => gitReviews?.close());
  const projectWork = createNodeProjectWork(options, host, runtime, state);
  const workGraphs = createWorkGraphs(runtime, index);
  // A part's round that ended while the Host stopped before its step's end was written: its step ends now (§6.0n).
  await workGraphs.reconcile();
  const { messages, waitsPort, stepBoards } = createNodeCoordination(runtime, index, state, projectWork);
  const closeWaits = onFailureClose(() => waitsPort.close());
  const closeMessages = onFailureClose(() => messages.close());
  const closeStepBoards = onFailureClose(() => stepBoards.close());
  const reviews = { runtime, host, state, index, options, surfaces, projectWork };
  const pendings = createPendingPort(reviews);
  const remember = createReviewMemory(reviews);
  const approvals = createApprovals(reviews, pendings, remember);
  const detachReviews = restoreReviewHistory(reviews, pendings, remember);
  const closeReviews = onFailureClose(() => detachReviews?.());
  const checkpoints = options.reviewQueue ? createPrologueCheckpoints({ runtime, queue: options.reviewQueue, readIndex: index.read, capture: index.capture, readResource: ref => readResource(runtime, ref),
    remember: (id, intent) => index.update(id, saved => { (saved.rewinds ??= []).push(intent); }),
    decision: (id, pendingId, receipt) => index.update(id, saved => {
      (saved.review_decisions ??= {})[pendingId] = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note };
    }),
  }) : undefined;
  const closeCheckpoints = onFailureClose(() => checkpoints?.close());
  const { inference, createBuilderAgent, close: stopInference } = createNodeInference(runtime, options, credentials, dispatchGuards);
  const closeInference = onFailureClose(stopInference);
  const recovery = createPrologueRecovery({ runtime, index, state, checkpoints });
  const readQuestion = questionReader(runtime);
  const port = createNodePort({ runtime, effects, host, options, state, index, dispatchGuards, surfaces, mcpLibrary, platformMemory, memoryAuthority, credentials, stepBoards, projectWork, workGraphs,
    messages, waitsPort, checkpoints, approvals, schedule, recovery, readQuestion, checks,
    shutdown: async () => {
      await closeMcp();
      await closeInference();
      for (const controller of state.actionControllers.values()) controller.abort();
      state.actionControllers.clear();
      await closeStepBoards(); await closeMessages(); await closeWaits(); await closeChecks();
      await closeReviews();
      await closeCheckpoints(); await closeGit();
      return closeRuntime();
    } });

  return Object.assign(new PrologueAgentAdapter({
    runtime: { ...port, startAgentRun: input => effects.start(input, async () => {
      const current = index.capture(input.session_id);
      const started = await port.startAgentRun(input);
      current();
      // What the waits this round registers are checked against, look after look.
      const client = input.actions?.client ?? input.action_gateway?.client;
      checks.remember(started.run.ref.id, { session_id: input.session_id, ...(input.beforeDispatch ? { beforeDispatch: input.beforeDispatch } : {}), ...(input.root_path ? { root_path: input.root_path } : {}),
        ...(client ? { actions: { client } } : {}), tools: index.read(input.session_id).then(saved => {
          const attempt = saved?.attempts.find(item => item.run_id === started.run.ref.id);
          return attempt?.action_tool_scope ? actionToolRefs(attempt.frozen.action_tools ?? [], attempt.action_tool_scope) : new Map();
        }) }, started.run);
      return started;
    }) },
    modelConfiguration: options.modelConfiguration,
    ...(options.memoryUsage ? { memoryUsage: options.memoryUsage } : {}),
    stopHeld: runId => { const queue = state.heldLabels.get(runId); const next = queue?.shift(); if (queue && !queue.length) state.heldLabels.delete(runId); return next; },
    // Judged when the run ends, from its facts: held for only announcing, and nothing called after that.
    endedOnPromise: (runId, sessionId) => endedOnPromise(state, runId, sessionId),
    approvals,
    answerPending: answerPending({ runtime, host, state, readQuestion, index, options, effects }),
  }), { inference, createBuilderAgent, gitReviews, writeCheckers: createPrologueWriteCheckers(runtime), diagnostics: () => {
    const seen = runtimeDiagnostics(runtime);
    return { ...seen, ledger_failures: [...seen.ledger_failures, ...workGraphs.failures().map((entry, at) => ({ ...entry, seq: seen.ledger_failures.length + at + 1 }))] };
  },
    /** The person's standing site decisions for the side panel's browser, applied to the running runtime. */
    surfaces: surfaceHost ? { decide: (decision: Parameters<PrologueSurfaces["decide"]>[0]) => surfaceHost!.decide(decision) } : undefined,
    projectDeletion: createProjectDeletion({ runtime, index, lifecycle: port.sessions.lifecycle!, effects }),
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
