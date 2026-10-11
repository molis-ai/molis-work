import type { AgentControl, ModelEvent } from "@prologue/sdk";

/** Historical questions remain readable, but only their live owner can accept answers. */
export function questionUnavailable(pending: { state: string; expiresAtMs: number }, now: number, live: boolean) {
  return pending.state !== "open" ? "这条问题已经结束，不能再次回答"
    : now >= pending.expiresAtMs ? "这条问题已过期，不能提交原答案"
    : !live ? "原执行者已经停止或离线，不能通过回答重新启动" : undefined;
}

/** A malformed question or confirmation may be corrected once. Stop at the second failed receipt,
 * before the next model call; a prompt alone cannot enforce this limit. */
export function withInteractionRepairLimit(control: Pick<AgentControl, "stop">, listener: (event: ModelEvent) => void) {
  const failures = new Map<string, Set<string>>();
  return (event: ModelEvent) => {
    listener(event);
    if (event.type !== "tool-result" || !["ask-user", "suggest-action"].includes(event.name) || event.errorCode !== "TOOL_ARGUMENTS_INVALID") return;
    const calls = failures.get(event.name) ?? new Set<string>();
    calls.add(event.callId); failures.set(event.name, calls);
    if (calls.size >= 2) control.stop("stopped");
  };
}
