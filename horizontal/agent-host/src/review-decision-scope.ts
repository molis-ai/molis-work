import { AsyncLocalStorage } from "node:async_hooks";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryExecutionControl, AgentReviewDecisionInput, AgentReviewReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

/** A trusted decision keeps its authority across the original handler, but cannot outlive or retarget that call. */
export class ReviewDecisionScope {
  readonly #frames = new AsyncLocalStorage<{ reviewId: string; active: boolean; control?: AgentMemoryExecutionControl }>();
  readonly #automatic = new Map<string, { set_by: string; set_at: string }>();
  automatic(reviewId: string) { return this.#automatic.get(reviewId); }
  applyRule(reviewId: string, rule: { set_by: string; set_at: string } | undefined, pending: () => boolean, respond: (input: AgentReviewDecisionInput) => Promise<AgentReviewReceipt>): void {
    if (!rule || !pending()) return;
    queueMicrotask(() => {
      if (!pending()) return;
      this.#automatic.set(reviewId, rule);
      void respond({ review_id: reviewId, decision: "approve", actor_id: rule.set_by,
        note: `按本会话规则批准：同一命令已由 ${rule.set_by} 于 ${rule.set_at} 允许本会话内不再询问` })
        .catch(() => { /* left pending for a person to decide */ })
        .finally(() => this.#automatic.delete(reviewId));
    });
  }
  run<T>(reviewId: string, control: AgentMemoryExecutionControl | undefined, work: () => Promise<T>): Promise<T> {
    const frame = { reviewId, active: true, control };
    return this.#frames.run(frame, async () => {
      try { await control?.beforeEffect(); return await work(); }
      finally { frame.active = false; }
    });
  }
  assertCurrent(reviewId: string): void {
    const frame = this.#frames.getStore();
    if (!frame) return;
    if (!frame.active || frame.reviewId !== reviewId) throw agentErrors.review_not_permitted("原审批调用已经结束或指向另一笔决定");
    if (frame.control) requireSynchronous(frame.control.assert_current(), "最终审批授权检查必须同步完成");
  }
}

export function mayRemember(control?: AgentMemoryExecutionControl): boolean {
  // The original decision is already accepted. Losing authority only prevents a new future grant.
  try { if (control) requireSynchronous(control.assert_current(), "后续授权检查必须同步完成"); return true; }
  catch { return false; }
}
