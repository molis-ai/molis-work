import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller, AgentMemoryExtractor, AgentMemoryFormationContext, AgentMemoryPromotion, AgentMemorySourceRequest, AgentMemorySourceRef, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isMemoryClassRestrictions } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryAuthority, MemoryCallerContext, MemoryExtractor, MemoryPolicyConfig, MemorySourcePort, MemoryPromotionLatch } from "@prologue/sdk";
import { createPrologueError } from "@prologue/sdk";
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
  promotion?: AgentMemoryPromotion;
  extractor?: AgentMemoryExtractor;
  sources?: {
    resolve(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { refs: readonly AgentMemorySourceRef[] }): Promise<readonly AgentMemorySourceSnapshot[]>;
    check(caller: AgentMemoryCaller, request: AgentMemorySourceRequest & { identities: readonly AgentMemorySourceIdentity[] }): Promise<boolean>;
  };
  authorize(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0], operation?: "disable"): Promise<boolean>;
  /** Tighten this exact authorized request from live synchronous facts immediately before commit or dispatch. */
  assertCurrent?(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0], operation?: "disable"): boolean;
  authorizeRecall(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeRecall"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeRecall"]>>;
  authorizeManagement(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeManagement"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeManagement"]>>;
  /** Resolve a current trusted caller from the persistent owner, never from Agent query fields. */
  callerForSession(owner: AgentSessionView["owner"], sessionId: string): Promise<AgentMemoryCaller | undefined>;
}

export function createPrologueMemoryAuthority(options: PrologueMemoryOptions | undefined, index: SessionIndexStore, effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">): {
  forAttempt<T>(sessionId: string, attemptIndex: number, work: () => Promise<T>): Promise<T>;
  authority: MemoryAuthority; binding: PrologueMemoryBinding; sources?: MemorySourcePort; promotion?: MemoryPromotionLatch; extractor?: MemoryExtractor;
} {
  const calls = new AsyncLocalStorage<{ caller: AgentMemoryCaller; formation?: AgentMemoryFormationContext; validateContext?: () => Promise<void>; operation?: "disable" }>();
  // The SDK context names only a Session. Its actual start/drive async chain owns this fixed attempt;
  // a later attempt or another Session can never supply the policy for an earlier request.
  type RunFrame = Pick<SessionIndex, "ref" | "owner"> & { attempt: SessionIndex["attempts"][number]; caller?: AgentMemoryCaller };
  const runs = new AsyncLocalStorage<RunFrame>();
  const sourcePort = options?.sources;
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
    const { attempt } = frame, memory = attempt.memory_context, policy = memory?.class_restrictions;
    if (!current || !memory || !policy || policy.policy_version !== 2 || policy.taxonomy_version !== 1
      || !isMemoryClassRestrictions(policy.personal) || !isMemoryClassRestrictions(policy.project)
      || memory.consumer !== current.consumer || memory.current_scene !== current.current_scene) return undefined;
    const caller: AgentMemoryCaller = { ...current, run_explicit: true, class_restrictions: structuredClone(policy),
      ...(memory.facts ? { facts: structuredClone(memory.facts) } : {}),
      ...(attempt.frozen.character ? { character_id: attempt.frozen.character.reference.artifact_id } : {}) };
    if (caller.purpose !== "task" || caller.session_id !== frame.ref.id) return undefined;
    return caller;
  };
  const boundCaller = (requested: MemoryCallerContext): AgentMemoryCaller | undefined => {
    const caller = calls.getStore()?.caller;
    return caller && isDeepStrictEqual(context(caller), requested) ? caller : undefined;
  };
  const runFor = (requested: MemoryCallerContext): RunFrame | undefined => {
    const frame = runs.getStore();
    return requested.purpose === "task" && requested.sessionRef && frame
      && isDeepStrictEqual(frame.ref, requested.sessionRef) ? frame : undefined;
  };
  const callerFor = async (requested: MemoryCallerContext): Promise<AgentMemoryCaller | undefined> => {
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
    async forAttempt(sessionId, attemptIndex, work) {
      const saved = await index.read(sessionId), attempt = saved?.attempts[attemptIndex];
      if (!saved || !attempt) throw agentErrors.capability_unavailable("执行的记忆快照不可读取");
      const frame: RunFrame = { ref: saved.ref, owner: saved.owner, attempt };
      const caller = options && attempt.memory_context && runCaller(await options.callerForSession(frame.owner, frame.ref.id), frame);
      if (caller) frame.caller = Object.freeze(structuredClone(caller));
      return runs.run(frame, work);
    },
    ...(options?.extractor ? { extractor: prologueMemoryExtractor(options.extractor, () => calls.getStore(), effects) } : {}),
    ...(options?.promotion ? { promotion: prologueMemoryPromotion(options.promotion, requested => {
      const bound = calls.getStore()?.caller;
      return requested ? callerFor(requested) : Promise.resolve(bound);
    }, effects) } : {}),
    binding: { context, run: (caller, work, call) => calls.run({ caller: Object.freeze(structuredClone(caller)),
      ...(call?.formation ? { formation: structuredClone(call.formation) } : {}), ...(call?.validateContext ? { validateContext: call.validateContext } : {}),
      ...(call?.operation ? { operation: call.operation } : {}) }, work) },
    ...(sourcePort ? { sources: {
      async resolve(request: Parameters<MemorySourcePort["resolve"]>[0]) {
        const caller = await callerFor(request.context);
        if (!caller) return [];
        const values = await sourcePort.resolve(structuredClone(caller), { ...sourceRequest(request), refs: request.refs.map(ref => ({ event_id: ref.eventId, version: ref.version })) });
        return values.map(source => ({ ...sourceIdentityToSdk(source), text: source.text }));
      },
      async check(request: Parameters<MemorySourcePort["check"]>[0]) {
        const caller = await callerFor(request.context);
        return caller ? sourcePort.check(structuredClone(caller), { ...sourceRequest(request), identities: request.identities.map(sourceIdentityView) }) : false;
      },
    } } : {}),
    authority: {
      async authorize(requests) {
        if (!options) return false;
        await effects.beforeEffect();
        effects.assertCurrent();
        // Empty projections carry no entries; query scope authority has its separate gate.
        if (requests.length === 0) return true;
        const caller = await callerFor(requests[0]!.context);
        if (!caller || requests.some(request => !isDeepStrictEqual(request.context, requests[0]!.context))) return false;
        return options.authorize(caller, requests, boundCaller(requests[0]!.context) ? calls.getStore()?.operation : undefined);
      },
      assertCurrent(requests) {
        effects.assertCurrent();
        if (requests.length === 0) return;
        const requested = requests[0]!.context;
        const bound = boundCaller(requested), caller = bound ?? runFor(requested)?.caller;
        if (!options || !caller || !isDeepStrictEqual(context(caller), requested)
          || requests.some(request => !isDeepStrictEqual(request.context, requested))) {
          throw createPrologueError("MEMORY_SCOPE_DENIED", "记忆最终检查缺少本次可信身份");
        }
        const allowed = options.assertCurrent?.(caller, requests, bound ? calls.getStore()?.operation : undefined);
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
    },
  };
}
