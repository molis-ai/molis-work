import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryCaller, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryAuthority, MemoryCallerContext, MemoryPolicyConfig, MemorySourcePort } from "@prologue/sdk";
import { agentErrors } from "../errors.js";
import type { PrologueMemoryBinding } from "./prologue-memory.js";
import type { SessionIndexStore } from "./prologue-session-index.js";

/** App policy and live grants; SDK types occur only at this SDK adapter boundary. */
export interface PrologueMemoryOptions {
  policy: MemoryPolicyConfig;
  sources?: MemorySourcePort;
  authorize(caller: AgentMemoryCaller, requests: Parameters<MemoryAuthority["authorize"]>[0]): Promise<boolean>;
  authorizeRecall(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeRecall"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeRecall"]>>;
  authorizeManagement(caller: AgentMemoryCaller, request: Parameters<NonNullable<MemoryAuthority["authorizeManagement"]>>[0]): ReturnType<NonNullable<MemoryAuthority["authorizeManagement"]>>;
  /** Resolve a current trusted caller from the persistent owner, never from Agent query fields. */
  callerForSession(owner: AgentSessionView["owner"], sessionId: string): Promise<AgentMemoryCaller | undefined>;
}

export function createPrologueMemoryAuthority(options: PrologueMemoryOptions | undefined, index: SessionIndexStore): {
  authority: MemoryAuthority; binding: PrologueMemoryBinding;
} {
  const calls = new AsyncLocalStorage<AgentMemoryCaller>();
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
    const bound = calls.getStore();
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
  return {
    binding: { context, run: (caller, work) => calls.run(Object.freeze(structuredClone(caller)), work) },
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
