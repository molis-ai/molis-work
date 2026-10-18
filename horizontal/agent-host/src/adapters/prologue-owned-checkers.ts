import type { CheckerResult } from "@prologue/sdk";
import type { AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";

/** Trusted session identity, read by the adapter; never supplied in checker parameters. */
export type OwnedCheckScope = AgentSessionView["owner"] & { session_id: string };

/**
 * A Host domain can prove a narrow read grant from its durable owner record after a restart. This is an App port,
 * never a plugin/model registration API. Both authorization and reading must be side-effect-free and model-free.
 */
export interface OwnedConditionChecker {
  readonly id: string;
  readonly version: "1";
  readonly params: Readonly<Record<string, unknown>>;
  checkParams(params: unknown): string | undefined;
  /** Recheck ownership and current grants at registration and before and after every read. Throws to refuse. */
  authorize(scope: OwnedCheckScope, params: unknown): Promise<void>;
  read(scope: OwnedCheckScope, params: unknown, signal: AbortSignal): Promise<{
    status: "pending" | "satisfied" | "failed" | "unknown"; note?: string; source?: { ref: string };
  }>;
}

export function ownedConditionChecks(checkers: readonly OwnedConditionChecker[], owner: (sessionId: string) => Promise<AgentSessionView["owner"] | undefined>) {
  const entries = new Map(checkers.map(checker => [checker.id, checker]));
  if (entries.size !== checkers.length || checkers.some(checker => !/^molis\.[a-z][a-z0-9-]*$/.test(checker.id)
    || ["molis.action-query", "molis.file-present"].includes(checker.id))) throw new Error("Host 检查器的名称重复或无效");
  const scopeOf = async (sessionId: string): Promise<OwnedCheckScope> => {
    const identity = await owner(sessionId);
    if (!identity) throw agentErrors.collaboration_check_refused("等待所属会话的身份已不可读");
    return { ...identity, session_id: sessionId };
  };
  return {
    entries,
    async authorize(id: string, sessionId: string, params: unknown): Promise<string | undefined> {
      try { await entries.get(id)!.authorize(await scopeOf(sessionId), params); return undefined; }
      catch { return "这个请求不属于当前会话，或当前读取授权已经失效"; }
    },
    async check(id: string, sessionId: string, params: unknown, signal: AbortSignal): Promise<CheckerResult> {
      const checker = entries.get(id)!;
      let scope: OwnedCheckScope;
      const denied: CheckerResult = { status: "unknown", refused: { code: agentErrors.collaboration_check_refused("").code }, note: "这个请求不属于当前会话，或当前读取授权已经失效" };
      try { scope = await scopeOf(sessionId); await checker.authorize(scope, params); }
      catch { signal.throwIfAborted(); return denied; }
      signal.throwIfAborted();
      let result: CheckerResult;
      try { result = await checker.read(scope, params, signal); }
      catch { signal.throwIfAborted(); return { status: "unknown", note: "暂时无法读取请求状态，稍后重试" }; }
      try { await checker.authorize(scope, params); }
      catch { signal.throwIfAborted(); return denied; }
      signal.throwIfAborted(); return result;
    },
  };
}
