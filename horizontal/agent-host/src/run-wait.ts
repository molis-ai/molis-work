import { agentErrors } from "./errors.js";
import type { AgentRunRef, AgentRunView, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCollaborationSessionView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";

/**
 * A cheap, stable mark of what a surface would draw differently: phase, text growth, tool progress, questions, usage,
 * the files each turn wrote, a wait the Run sleeps in, a model switch asked for or taken, how far each supplement got.
 */
export function runViewVersion(view: AgentRunView): string {
  const last = view.turns[view.turns.length - 1];
  return [view.phase, view.turns.length, last?.text.length ?? 0, view.activity.length,
    view.activity.map(item => item.state[0] + (item.output?.length ?? 0)).join(""), view.awaiting_input.length,
    view.usage.tokens.input + view.usage.tokens.output, view.step_board?.version ?? 0,
    view.turn_changes?.length ?? 0, view.sleeping_until ?? "", view.retry_wait?.until ?? "", view.model_switch?.now ?? "", view.model_switch?.requested ?? "",
    view.turns.map(turn => turn.steer?.state ?? "").join(",")].join(":");
}

/**
 * Following a live round: wake on the first change, gather the deltas that arrive within 40 ms, answer with the latest. At the timeout
 * the latest view is the answer (a round still running is not a failure). A cancelled wait (its caller gone, its project closing) lets
 * go of the round at once and answers nothing.
 */
export function waitForRunChange(adapter: AgentRuntimeAdapter, run: AgentRunRef, since: string | null, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<{ version: string; view: AgentRunView }>((resolve, reject) => {
    let latest: AgentRunView | undefined, gather: ReturnType<typeof setTimeout> | undefined, stop: (() => void) | undefined, finished = false;
    // The published view only names pending questions; a full read resolves them into something a person can answer.
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(gather); stop?.(); signal?.removeEventListener("abort", cancel);
      const version = runViewVersion(latest!);
      if (!latest!.awaiting_input.length) { resolve({ version, view: latest! }); return; }
      adapter.read(run).then(view => resolve({ version, view }), () => resolve({ version, view: latest! })); };
    const timer = setTimeout(finish, timeoutMs), cancel = () => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(gather); stop?.(); reject(signal!.reason); };
    try {
      stop = adapter.observe(run, view => { latest = view; if (runViewVersion(view) !== since && !gather) gather = setTimeout(finish, 40); });
      if (finished) stop(); else if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

/**
 * How many waits each installation has open, held to `limit` (coordinator 10-23): the action service caps calls per minute, not calls
 * in flight, and every open page and every followed session holds one. `hold` refuses one over the limit; its release gives the place back.
 */
export function installationWaits(limit: number) {
  const open = new Map<string, number>();
  return {
    hold(installId: string): () => void {
      const held = open.get(installId) ?? 0;
      if (held >= limit) throw agentErrors.wait_limit_reached(`这个插件同时在等的执行已有 ${limit} 个，请先结束其中一个再等`);
      open.set(installId, held + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (open.get(installId) ?? 1) - 1;
        if (left > 0) open.set(installId, left); else open.delete(installId);
      };
    },
  };
}

/**
 * Waits for continuations of the caller's own sessions alone. Another's that are ready join `skipped` and the wait goes on, so they
 * neither show nor end it early; at the deadline the answer is what is the caller's (possibly nothing).
 */
export async function awaitOwnContinuations(awaitReady: (timeoutMs: number, exclude: string[], signal?: AbortSignal) => Promise<AgentCollaborationSessionView[]>,
  owns: (view: AgentCollaborationSessionView) => Promise<boolean>, timeoutMs: number, exclude: readonly string[], signal?: AbortSignal) {
  const skipped = [...exclude];
  for (const deadline = Date.now() + timeoutMs; ;) {
    const ready = await awaitReady(Math.max(0, deadline - Date.now()), skipped, signal);
    signal?.throwIfAborted();
    const own: AgentCollaborationSessionView[] = [];
    for (const view of ready) {
      if (await owns(view)) own.push(view);
      else if (view.continuation) skipped.push(view.continuation.request_key);
    }
    if (own.length || Date.now() >= deadline) return own;
  }
}
