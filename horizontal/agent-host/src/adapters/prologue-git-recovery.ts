import type { Effect, Runtime } from "@prologue/sdk";
import type { AgentGitIndexObservation, AgentReviewReceipt, AgentReviewRecoveryView, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentReviewQueue } from "../reviews.js";

/** What recovering one Git index review needs from the reviews that own it: their live and recovering sets, and how a result is settled. */
export interface GitRecoveryState {
  runtime: Runtime;
  queue: AgentReviewQueue;
  saveReconciliation(key: string, value: NonNullable<AgentReviewReceipt["reconciliation"]>): Promise<void>;
  live: ReadonlySet<string>;
  recovering: Set<string>;
  closed(): boolean;
  settle(effect: Effect, request: AgentReviewRequest): Promise<void>;
}

/**
 * Let the person check a Git index operation whose result is unknown, against the index as it is now: refresh from the
 * execution record, or confirm it did not happen with a reason. What the index shows is evidence for the person, never
 * proof by itself.
 */
export function bindGitRecovery({ runtime, queue, saveReconciliation, live, recovering, closed, settle }: GitRecoveryState, effect: Effect, request: AgentReviewRequest) {
  // Index content reconciliation cannot establish whether a worktree was created.
  if (request.operation?.kind !== "git-index") return;
  const inspect = async (observe: () => Promise<AgentGitIndexObservation>): Promise<AgentReviewRecoveryView> => {
    const current = runtime.effects.get(effect.ref), dispatch = await runtime.effects.inspectDispatch(effect.ref);
    let observation: AgentGitIndexObservation | null = null;
    let message = "当前内容只能用于人工核对，不能证明原操作由谁执行。无法确认时请保留未知。";
    try { observation = await observe(); } catch (error) { message = error instanceof Error ? error.message : "当前暂存区不可读取"; }
    const idle = !live.has(effect.ref.id) && !closed();
    const uncertain = current?.state === "reconcile-required" && dispatch.state === "unknown";
    if (!idle) message = "原执行方仍在处理或应用正在关闭，暂不能收口。";
    else if (!uncertain) message = "执行记录已有确定结果；重新核对回执可刷新操作记录。";
    else if (observation?.matches_after) message = "当前暂存区与拟执行结果一致，但这不能证明原操作已经完成；仍需原执行回执，不会重复执行。";
    else if (observation && !observation.matches_before) message = "当前暂存区已与操作前内容不同，不能据此确认未发生；请继续核对外部改动。";
    else if (observation) message = "当前暂存区与操作前一致。仅凭内容相同仍不能排除曾执行后又被改回；只有另有可靠依据确认未发生时才能收口。";
    return { review_id: request.review_id, receipt: queue.receipt(request.review_id)!, observation,
      can_confirm_not_happened: idle && uncertain && observation?.matches_before === true && observation.matches_after === false, message };
  };
  queue.registerRecoveryHandler(request.review_id, { inspect, async resolve(input, observe) {
    if (closed() || live.has(effect.ref.id) || recovering.has(effect.ref.id)) throw new Error("原操作仍在处理，请稍后重新核对");
    if (input.action !== "refresh" && input.action !== "not-happened") throw new Error("核对动作无效");
    recovering.add(effect.ref.id);
    try {
      const report = await runtime.effects.readRecovery();
      if (report.unavailable.length) throw new Error("执行记录不可读，不能收口");
      const current = runtime.effects.get(effect.ref), dispatch = await runtime.effects.inspectDispatch(effect.ref);
      if (!current) throw new Error("原执行记录不可读");
      if (input.action === "refresh") {
        if (current.state === "reconcile-required" && dispatch.state !== "unknown") {
          if (dispatch.state === "not-dispatched") await runtime.effects.reconcile(effect.ref, { kind: "known-not-happened", why: "Host dispatch record confirms the original operation was not dispatched." });
          else if (dispatch.receiptId) await runtime.effects.reconcile(effect.ref, { kind: "host-receipt", receiptId: dispatch.receiptId });
        }
      } else {
        if (current.state !== "reconcile-required" || dispatch.state !== "unknown") throw new Error("原操作已收口，不能再次改写结论");
        const reason = input.reason?.trim();
        if (!reason || reason.length > 2000 || !input.actor_id.trim()) throw new Error("请填写确认未发生的具体依据（最多 2000 字）");
        const view = await inspect(observe);
        if (!view.can_confirm_not_happened || !input.revision || view.observation?.revision !== input.revision) throw new Error("核对内容已改变或不支持确认未发生，请重新读取");
        const value = { actor_id: input.actor_id, at: new Date().toISOString(), reason };
        // Provenance may be saved first; it never settles the effect by itself.
        await saveReconciliation(effect.proposal.inputFingerprint, value);
        const latest = await observe();
        if (latest.revision !== input.revision || !latest.matches_before || latest.matches_after) throw new Error("保存核对依据期间暂存区已改变，原操作仍未收口");
        await runtime.effects.reconcile(effect.ref, { kind: "known-not-happened", why: JSON.stringify({ ...value, revision: latest.revision }) });
      }
      await settle(effect, request);
      return inspect(observe);
    } finally { recovering.delete(effect.ref.id); }
  } });
}
