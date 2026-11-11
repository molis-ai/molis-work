import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryCaller, AgentMemoryExtractor, AgentMemoryFormationContext, AgentMemoryPromotion, AgentMemorySourceRequest, AgentMemorySourceRef, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentSessionView, AgentSessionWriteObservation } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createPrologueError, isTerminalEventType, type Run } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { isMemoryClassRestrictions } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryAuthority, MemoryCallerContext, MemoryExtractor, MemoryPolicyConfig, MemorySourcePort, MemoryPromotionLatch } from "@prologue/sdk";
import { prologueMemoryPromotion } from "./prologue-memory-promotion.js";
import { prologueMemoryExtractor } from "./prologue-memory-formation.js";
import { sourceIdentityToSdk, sourceIdentityView } from "./prologue-memory-values.js";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryBinding } from "./prologue-memory.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import type { PrologueEffects } from "./prologue-effects.js";

/** App policy and live grants; SDK types occur only at this SDK adapter boundary. */
export interface PrologueMemoryOptions {
  policy: MemoryPolicyConfig;
  /** Explicitly accept the SDK's deeply frozen canonical list read inputs. */
  readInput?: "frozen";
  promotion?: AgentMemoryPromotion;
  extractor?: AgentMemoryExtractor;
  sources?: {
    capture?(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { refs: readonly AgentMemorySourceRef[] }): AgentSessionWriteObservation;
    resolve(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { refs: readonly AgentMemorySourceRef[] }): Promise<readonly AgentMemorySourceSnapshot[]>;
    check(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { identities: readonly AgentMemorySourceIdentity[] }): Promise<boolean>;
  };
  assertCurrent?(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0]): boolean;
  authorize(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0]): Promise<boolean>;
  authorizeRecall(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeRecall"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeRecall"]>>;
  authorizeManagement(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeManagement"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeManagement"]>>;
  authorizePurgeInspection?(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizePurgeInspection"]>>[0],
    owner: AgentSessionView["owner"]): Promise<boolean>;
  assertPurgeInspectionCurrent?(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["assertPurgeInspectionCurrent"]>>[0]): boolean;
  /** Resolve a current trusted caller from the persistent owner, never from Agent query fields. */
  callerForSession(owner: AgentSessionView["owner"], sessionId: string): Promise<AgentMemoryCaller | undefined>;
}

/** Live source proofs belong to one existing call/Run; later reads cannot refresh an invalidated proof. */
class SourceObservations {
  private readonly seen = new Set<string>();
  private readonly held: AgentSessionWriteObservation[] = [];
  private closed = false;
  constructor(private readonly observe: NonNullable<PrologueMemoryOptions["sources"]>["capture"]) {}
  assertCurrent = () => {
    if (this.closed) throw agentErrors.memory_read_changed("原来源调用已结束，不能继续使用旧检查");
    for (const observation of this.held) observation.assert_current();
  };
  capture(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { refs: readonly AgentMemorySourceRef[] }) {
    this.assertCurrent();
    const refs = request.refs.filter(ref => !this.seen.has(JSON.stringify([ref.event_id, ref.version])));
    if (!refs.length || !this.observe) return;
    const observation = this.observe(caller, { ...request, refs });
    this.held.push(observation);
    for (const ref of refs) this.seen.add(JSON.stringify([ref.event_id, ref.version]));
    this.assertCurrent();
  }
  close() { this.closed = true; for (const observation of this.held) observation.dispose(); this.held.length = 0; this.seen.clear(); }
}

/** A started SDK Run outlives its start promise; its published terminal event releases this frame. */
async function retainRunSources<T extends { run: Pick<Run, "subscribe"> }>(sources: SourceObservations,
  active: Set<() => void>, work: () => Promise<T>, disposeDispatch?: () => void): Promise<T> {
  let released = false, unsubscribe: (() => void) | undefined;
  const release = () => {
    if (released) return;
    released = true; sources.close(); active.delete(release); unsubscribe?.(); disposeDispatch?.();
  };
  active.add(release);
  try {
    const started = await work();
    unsubscribe = started.run.subscribe(event => { if (isTerminalEventType(event.type)) release(); });
    // subscribe replays synchronously, including an already published terminal event.
    if (released) unsubscribe();
    return started;
  } catch (error) { release(); throw error; }
}

/** The current bound owner and the original Session selection gate both public purge-inspection hooks. */
function sessionPurgeAuthority(options: PrologueMemoryOptions | undefined, index: SessionIndexStore,
  callerFor: (requested: MemoryCallerContext) => Promise<AgentMemoryCaller | undefined>,
  boundCaller: (requested: MemoryCallerContext) => AgentMemoryCaller | undefined):
  Pick<MemoryAuthority, "authorizePurgeInspection" | "assertPurgeInspectionCurrent"> {
  return {
      async authorizePurgeInspection(request) {
        const caller = await callerFor(request.context);
        if (!caller?.person || !caller.memory_session || caller.consumer !== "ui" || caller.purpose !== "management" || request.purpose === "owner-coverage"
          || !isDeepStrictEqual(request.selection.sessionRef, { kind: "session", id: caller.memory_session.session.session_id, revision: 1 })) return false;
        const saved = await index.read(request.selection.sessionRef.id);
        if (!saved?.owner || saved.owner.actor_id !== caller.actor_id) return false;
        return options?.authorizePurgeInspection?.(caller, request, saved.owner) ?? false;
      },
      assertPurgeInspectionCurrent(request) {
        const caller = boundCaller(request.context);
        if (!caller?.memory_session || options?.assertPurgeInspectionCurrent?.(caller, request) !== true)
          throw createPrologueError("MEMORY_SCOPE_DENIED", "原会话清理身份或固定操作已变化");
      },
  };
}

export function createPrologueMemoryAuthority(options: PrologueMemoryOptions | undefined, index: SessionIndexStore, effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">): {
  forAttempt<T extends { run: Pick<Run, "subscribe"> }>(sessionId: string, attemptIndex: number, work: () => Promise<T>, disposeDispatch?: () => void): Promise<T>;
  close(): void;
  authority: MemoryAuthority; binding: PrologueMemoryBinding; sources?: MemorySourcePort; promotion?: MemoryPromotionLatch; extractor?: MemoryExtractor;
} {
  const calls = new AsyncLocalStorage<{ caller: AgentMemoryCaller; formation?: AgentMemoryFormationContext; validateContext?: () => Promise<void>; sources: SourceObservations }>();
  type RunFrame = { ref: SessionIndex["ref"]; owner: SessionIndex["owner"]; attempt: SessionIndex["attempts"][number]; caller?: AgentMemoryCaller; sources: SourceObservations };
  const runs = new AsyncLocalStorage<RunFrame>();
  const activeRuns = new Set<() => void>();
  let closed = false;
  const assertOpen = () => { if (closed) throw agentErrors.capability_unavailable("原 Runtime 已关闭，不能再准备记忆来源"); };
  const sourcePort = options?.sources;
  const assertSources = () => { (calls.getStore() ?? runs.getStore())?.sources.assertCurrent(); };
  const sourceEffects = { beforeEffect: () => effects.beforeEffect(), assertCurrent: () => { effects.assertCurrent(); assertSources(); } };
  const captureSources = (caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { refs: readonly AgentMemorySourceRef[] }) => {
    const frame = calls.getStore() ?? runs.getStore();
    if (!frame) throw agentErrors.capability_unavailable("来源检查缺少所属调用");
    frame.sources.capture(caller, request);
  };
  const context = (caller: AgentMemoryCaller): MemoryCallerContext => {
    if (!caller.actor_id || !caller.consumer || !caller.current_scene) throw agentErrors.capability_unavailable("记忆调用缺少可信身份或场景");
    return { consumer: caller.consumer, currentScene: caller.current_scene, purpose: caller.purpose,
      ...(caller.session_id ? { sessionRef: { kind: "session", id: caller.session_id, revision: 1 } } : {}),
      ...(caller.facts ? { facts: {
        ...(caller.facts.plugins ? { plugins: caller.facts.plugins } : {}),
        ...(caller.facts.object_kinds ? { objectKinds: caller.facts.object_kinds } : {}),
        ...(caller.facts.goals ? { goals: caller.facts.goals } : {}),
      } } : caller.plugin_id ? { facts: { plugins: [caller.plugin_id] } } : {}) };
  };
  const runCaller = (current: AgentMemoryCaller | undefined, frame: RunFrame): AgentMemoryCaller | undefined => {
    const memory = frame.attempt.memory_context, policy = memory?.class_restrictions;
    if (!current || !memory || !policy || policy.policy_version !== /* @version format.memory.class-policy */ 1 || policy.taxonomy_version !== /* @version format.memory.class-taxonomy */ 1
      || !isMemoryClassRestrictions(policy.personal) || !isMemoryClassRestrictions(policy.project)
      || memory.consumer !== current.consumer || memory.current_scene !== current.current_scene) return undefined;
    return { ...current, run_explicit: true, class_restrictions: structuredClone(policy),
      ...(memory.facts ? { facts: structuredClone(memory.facts) } : {}),
      ...(frame.attempt.frozen.character ? { character_id: frame.attempt.frozen.character.reference.artifact_id } : {}) };
  };
  const boundCaller = (requested: MemoryCallerContext) => {
    const caller = calls.getStore()?.caller;
    return caller && isDeepStrictEqual(context(caller), requested) ? caller : undefined;
  };
  const runFor = (requested: MemoryCallerContext) => {
    const frame = runs.getStore();
    return requested.purpose === "task" && frame && isDeepStrictEqual(frame.ref, requested.sessionRef) ? frame : undefined;
  };
  const callerFor = async (requested: MemoryCallerContext): Promise<AgentMemoryCaller | undefined> => {
    assertSources();
    const bound = boundCaller(requested);
    if (bound) return bound;
    const frame = runFor(requested);
    if (!options || !frame) return undefined;
    const caller = runCaller(await options.callerForSession(frame.owner, frame.ref.id), frame);
    return caller && isDeepStrictEqual(caller, frame.caller) && isDeepStrictEqual(context(caller), requested) ? caller : undefined;
  };
  const sourceRequest = (request: Parameters<MemorySourcePort["resolve"]>[0] | Parameters<MemorySourcePort["check"]>[0]): AgentMemorySourceRequest => ({
    app_id: request.appId, target: { scope: request.target.scope as AgentMemorySourceRequest["target"]["scope"], owner: request.target.owner,
      ...(request.target.namespace === undefined ? {} : { namespace: request.target.namespace }) }, ...(request.signal ? { signal: request.signal } : {}),
  });
  return {
    close() { closed = true; for (const release of activeRuns) release(); },
    async forAttempt(sessionId, attemptIndex, work, disposeDispatch) {
      assertOpen();
      const sources = new SourceObservations(sourcePort?.capture);
      return retainRunSources(sources, activeRuns, async () => {
        const saved = await index.read(sessionId), attempt = saved?.attempts[attemptIndex];
        assertOpen();
        if (!saved || !attempt) throw agentErrors.capability_unavailable("原执行的记忆配方不可读取");
        const frame: RunFrame = { ref: saved.ref, owner: saved.owner, attempt, sources };
        const caller = options && runCaller(await options.callerForSession(frame.owner, saved.ref.id), frame);
        if (caller) frame.caller = Object.freeze(structuredClone(caller));
        assertOpen();
        return runs.run(frame, work);
      }, disposeDispatch);
    },
    ...(options?.extractor ? { extractor: prologueMemoryExtractor(options.extractor, () => calls.getStore(), sourceEffects) } : {}),
    ...(options?.promotion ? { promotion: prologueMemoryPromotion(options.promotion, requested => {
      const bound = calls.getStore()?.caller;
      return requested ? callerFor(requested) : Promise.resolve(bound);
    }, sourceEffects) } : {}),
    binding: { context, run: (caller, work, formation, validateContext) => {
      const frame = { caller: Object.freeze(structuredClone(caller)), sources: new SourceObservations(sourcePort?.capture),
        ...(formation ? { formation: structuredClone(formation) } : {}), ...(validateContext ? { validateContext } : {}) };
      return calls.run(frame, async () => { try { return await work(); } finally { frame.sources.close(); } });
    } },
    ...(sourcePort ? { sources: {
      async resolve(request: Parameters<MemorySourcePort["resolve"]>[0]) {
        const caller = await callerFor(request.context);
        if (!caller) return [];
        const input = { ...sourceRequest(request), refs: request.refs.map(ref => ({ event_id: ref.eventId, version: ref.version })) };
        captureSources(caller, input);
        const values = await sourcePort.resolve(structuredClone(caller), input);
        assertSources();
        return values.map(source => ({ ...sourceIdentityToSdk(source), text: source.text }));
      },
      async check(request: Parameters<MemorySourcePort["check"]>[0]) {
        const caller = await callerFor(request.context);
        if (!caller) return false;
        const identities = request.identities.map(sourceIdentityView), input = { ...sourceRequest(request), identities };
        captureSources(caller, { ...input, refs: identities.map(({ event_id, version }) => ({ event_id, version })) });
        const accepted = await sourcePort.check(structuredClone(caller), input);
        assertSources(); return accepted;
      },
    } } : {}),
    authority: {
      ...(options?.readInput === "frozen" ? { readInput: "frozen" as const } : {}),
      async authorize(requests) {
        if (!options) return false;
        // Empty projections carry no entries; query scope authority has its separate gate.
        if (requests.length === 0) return true;
        const caller = await callerFor(requests[0]!.context);
        if (!caller || requests.some(request => !isDeepStrictEqual(request.context, requests[0]!.context))) return false;
        if (requests.some(request => ["save", "propose", "accept", "promote", "delete"].includes(request.action))) {
          await effects.beforeEffect(); effects.assertCurrent();
        }
        return options.authorize(caller, requests);
      },
      assertCurrent(requests) {
        sourceEffects.assertCurrent();
        if (requests.length === 0) return;
        const requested = requests[0]!.context, caller = boundCaller(requested) ?? runFor(requested)?.caller;
        if (!options || !caller || !isDeepStrictEqual(context(caller), requested)
          || requests.some(request => !isDeepStrictEqual(request.context, requested)))
          throw createPrologueError("MEMORY_SCOPE_DENIED", "记忆最终检查缺少本次可信身份");
        const allowed = options.assertCurrent?.(caller, requests);
        requireSynchronous(allowed, "记忆最终授权检查必须同步完成");
        if (allowed === false) throw createPrologueError("MEMORY_SCOPE_DENIED", "记忆权限已变更");
      },
      async authorizeRecall(request) {
        const caller = await callerFor(request.context);
        return caller && options ? options.authorizeRecall(caller, request) : { allowed: false };
      },
      async authorizeManagement(request) {
        const caller = await callerFor(request.context);
        return caller && options ? options.authorizeManagement(caller, request) : { allowed: false };
      },
      ...sessionPurgeAuthority(options, index, callerFor, boundCaller),
    },
  };
}
