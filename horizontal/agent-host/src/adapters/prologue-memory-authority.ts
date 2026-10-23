import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryCaller, AgentMemoryExtractor, AgentMemoryFormationContext, AgentMemoryPromotion, AgentMemorySourceRequest, AgentMemorySourceRef, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryAuthority, MemoryCallerContext, MemoryExtractor, MemoryPolicyConfig, MemorySourcePort, MemoryPromotionLatch } from "@prologue/sdk";
import { prologueMemoryPromotion } from "./prologue-memory-promotion.js";
import { prologueMemoryExtractor } from "./prologue-memory-formation.js";
import { sourceIdentityToSdk, sourceIdentityView } from "./prologue-memory-values.js";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryBinding } from "./prologue-memory.js";
import type { SessionIndexStore } from "./prologue-session-index.js";
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
  authorize(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0]): Promise<boolean>;
  authorizeRecall(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeRecall"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeRecall"]>>;
  authorizeManagement(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeManagement"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeManagement"]>>;
  /** Resolve a current trusted caller from the persistent owner, never from Agent query fields. */
  callerForSession(owner: AgentSessionView["owner"], sessionId: string): Promise<AgentMemoryCaller | undefined>;
}

export function createPrologueMemoryAuthority(options: PrologueMemoryOptions | undefined, index: SessionIndexStore, effects: Pick<PrologueEffects, "beforeEffect" | "assertCurrent">): {
  authority: MemoryAuthority; binding: PrologueMemoryBinding; sources?: MemorySourcePort; promotion?: MemoryPromotionLatch; extractor?: MemoryExtractor;
} {
  const calls = new AsyncLocalStorage<{ caller: AgentMemoryCaller; formation?: AgentMemoryFormationContext; validateContext?: () => Promise<void> }>();
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
  const callerFor = async (requested: MemoryCallerContext): Promise<AgentMemoryCaller | undefined> => {
    const bound = calls.getStore()?.caller;
    if (bound && isDeepStrictEqual(context(bound), requested)) return bound;
    if (!options || requested.purpose !== "task" || !requested.sessionRef) return undefined;
    const saved = await index.read(requested.sessionRef.id);
    if (!saved || !isDeepStrictEqual(saved.ref, requested.sessionRef)) return undefined;
    const current = await options.callerForSession(saved.owner, saved.ref.id);
    const attempt = saved.attempts.at(-1), memory = attempt?.memory_context;
    if (!current || !memory || memory.consumer !== current.consumer || memory.current_scene !== current.current_scene) return undefined;
    const caller: AgentMemoryCaller = { ...current, ...(memory.facts ? { facts: structuredClone(memory.facts) } : {}),
      ...(attempt.frozen.character ? { character_id: attempt.frozen.character.reference.artifact_id } : {}) };
    if (!caller || caller.purpose !== "task" || caller.session_id !== saved.ref.id
      || !isDeepStrictEqual(context(caller), requested)) return undefined;
    return caller;
  };
  const sourceRequest = (request: Parameters<MemorySourcePort["resolve"]>[0] | Parameters<MemorySourcePort["check"]>[0]): AgentMemorySourceRequest => ({
    app_id: request.appId, target: { scope: request.target.scope as AgentMemorySourceRequest["target"]["scope"], owner: request.target.owner,
      ...(request.target.namespace === undefined ? {} : { namespace: request.target.namespace }) }, ...(request.signal ? { signal: request.signal } : {}),
  });
  return {
    ...(options?.extractor ? { extractor: prologueMemoryExtractor(options.extractor, () => calls.getStore(), effects) } : {}),
    ...(options?.promotion ? { promotion: prologueMemoryPromotion(options.promotion, requested => {
      const bound = calls.getStore()?.caller;
      return requested ? callerFor(requested) : Promise.resolve(bound);
    }, effects) } : {}),
    binding: { context, run: (caller, work, formation, validateContext) => calls.run({ caller: Object.freeze(structuredClone(caller)),
      ...(formation ? { formation: structuredClone(formation) } : {}), ...(validateContext ? { validateContext } : {}) }, work) },
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
        // Empty projections carry no entries; query scope authority has its separate gate.
        if (requests.length === 0) return true;
        const caller = await callerFor(requests[0]!.context);
        if (!caller || requests.some(request => !isDeepStrictEqual(request.context, requests[0]!.context))) return false;
        return options.authorize(caller, requests);
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
