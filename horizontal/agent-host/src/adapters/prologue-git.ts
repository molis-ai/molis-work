import { createHash } from "node:crypto";
import type { Effect, ExactRef, Runtime } from "@prologue/sdk";
import type { AgentGitIndexObservation, AgentGitIndexReviewDocument, AgentToolOperationReviewDocument, AgentReviewReceipt, AgentReviewRequest, AgentReviewRecoveryView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentReviewQueue } from "../reviews.js";

type GitReviewIntent = { board_id: string; workspace_id: string; operation_id: string } & (
  | { operation_kind?: "git-index"; document: AgentGitIndexReviewDocument }
  | { operation_kind: "git-worktree"; document: AgentToolOperationReviewDocument }
);
type StoredReview = GitReviewIntent & { kind: "molis-git-index-review"; requested_at: string };
type Decision = Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note" | "reconciliation"> & { failure_reason?: string };
export interface PrologueGitReviewPort {
  prepare(intent: GitReviewIntent, execution: { check(): Promise<void>; execute(): Promise<void> }): Promise<AgentReviewRequest>;
  close(): Promise<void>;
}
interface Ports {
  runtime: Runtime;
  queue: AgentReviewQueue;
  publish(value: unknown): Promise<ExactRef<"resource">>;
  read(ref: ExactRef<"resource">): Promise<unknown>;
  saveDecision(key: string, value: Decision): Promise<void>;
  saveFailure(key: string, reason: string): Promise<void>;
  saveReconciliation(key: string, value: NonNullable<AgentReviewReceipt["reconciliation"]>): Promise<void>;
  readDecision(key: string): Promise<Decision | undefined>;
}
const SUBJECT = "molis.git.index";
const APPROVAL_TTL = 10 * 60 * 1000;
const fingerprint = (input: GitReviewIntent) => createHash("sha256").update(JSON.stringify([input.board_id, input.operation_id])).digest("hex");

/** SDK Effects owns dispatch/recovery. The Host retains review provenance and diagnostic text, never execution state. */
export function createPrologueGitReviews(ports: Ports): PrologueGitReviewPort {
  const { runtime, queue } = ports;
  const live = new Set<string>(), restored = new Set<string>(), working = new Map<string, Promise<AgentReviewRequest>>();
  const busy = new Set<string>();
  const recovering = new Set<string>();
  let closed = false;
  const requestOf = (effect: Effect, saved: StoredReview): AgentReviewRequest => {
    if (!effect.pending) throw new Error("Git 操作缺少原审查等待");
    return { review_id: `prologue-git:${effect.pending.ref.id}`, run: null,
      operation: { kind: saved.operation_kind ?? "git-index", operation_id: saved.operation_id, workspace_id: saved.workspace_id },
      board_id: saved.board_id, plugin_id: saved.operation_kind === "git-worktree" ? "io.molis.work.coding" : "io.molis.work.git", kind: saved.document.kind, document: saved.document,
      requested_at: saved.requested_at, expires_at: new Date(Date.parse(saved.requested_at) + APPROVAL_TTL).toISOString() };
  };
  const savedOf = async (effect: Effect): Promise<StoredReview | null> => {
    if (effect.proposal.subject.what !== "tool" || effect.proposal.subject.name !== SUBJECT || !effect.proposal.reviewRef) return null;
    const value = await ports.read(effect.proposal.reviewRef) as StoredReview;
    if (value?.kind !== "molis-git-index-review" || !value.board_id || !value.workspace_id || !value.operation_id
      || (value.operation_kind === "git-worktree" ? value.document?.kind !== "tool-operation" || value.document.tool !== "git-worktree-create" : value.document?.kind !== "git-index")) throw new Error("Git 审查归属不可读，不能猜测执行结果");
    return value;
  };
  const settle = async (effect: Effect, request: AgentReviewRequest, error?: unknown) => {
    const current = runtime.effects.get(effect.ref), dispatch = await runtime.effects.inspectDispatch(effect.ref);
    if (!current || dispatch.state === "unknown" || ["dispatching", "reconcile-required"].includes(current.state)) {
      queue.uncertain(request.review_id, "Git 操作结果尚未确定，请核对仓库；不会自动重复执行");
      return;
    }
    if (queue.receipt(request.review_id)?.status === "approved") {
      const saved = await ports.readDecision(effect.proposal.inputFingerprint);
      const reconciled = current.state === "failed" && dispatch.state === "not-dispatched" ? saved?.reconciliation : undefined;
      queue.settle(request.review_id, current.state === "completed" && dispatch.state === "dispatched" && dispatch.ok === true
        ? { ok: true } : { ok: false, error: reconciled ? "经核对，原操作未发生；不会自动重试"
          : error instanceof Error ? error.message : saved?.failure_reason ?? "这次 Git 操作没有完成；需要时重新预览，不会自动重试" });
      if (reconciled) queue.recordReconciliation(request.review_id, reconciled);
    } else if (["cancelled", "denied", "failed"].includes(current.state)) queue.cancel(request.review_id, "原操作未执行，已撤回");
  };
  const bindRecovery = (effect: Effect, request: AgentReviewRequest) => {
    // Index content reconciliation cannot establish whether a worktree was created.
    if (request.operation?.kind === "git-worktree") return;
    const inspect = async (observe: () => Promise<AgentGitIndexObservation>): Promise<AgentReviewRecoveryView> => {
      const current = runtime.effects.get(effect.ref), dispatch = await runtime.effects.inspectDispatch(effect.ref);
      let observation: AgentGitIndexObservation | null = null;
      let message = "当前内容只能用于人工核对，不能证明原操作由谁执行。无法确认时请保留未知。";
      try { observation = await observe(); } catch (error) { message = error instanceof Error ? error.message : "当前暂存区不可读取"; }
      const idle = !live.has(effect.ref.id) && !closed;
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
      if (closed || live.has(effect.ref.id) || recovering.has(effect.ref.id)) throw new Error("原操作仍在处理，请稍后重新核对");
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
          await ports.saveReconciliation(effect.proposal.inputFingerprint, value);
          const latest = await observe();
          if (latest.revision !== input.revision || !latest.matches_before || latest.matches_after) throw new Error("保存核对依据期间暂存区已改变，原操作仍未收口");
          await runtime.effects.reconcile(effect.ref, { kind: "known-not-happened", why: JSON.stringify({ ...value, revision: latest.revision }) });
        }
        await settle(effect, request);
        return inspect(observe);
      } finally { recovering.delete(effect.ref.id); }
    } });
  };
  const restore = async (boardId: string) => {
    const report = await runtime.effects.readRecovery();
    if (report.unavailable.length) throw new Error("执行记录暂不可读，不能发起新的 Git 操作");
    for (const effect of report.effects) {
      if (live.has(effect.ref.id) || restored.has(effect.ref.id)) continue;
      const saved = await savedOf(effect);
      if (!saved || saved.board_id !== boardId) continue;
      const request = requestOf(effect, saved), decision = await ports.readDecision(fingerprint(saved));
      if (decision) {
        const { status, decided_by, decided_at, note } = decision;
        queue.restoreDecision(request, { status, decided_by, decided_at, note });
      } else queue.request(request);
      bindRecovery(effect, request);
      const dispatch = await runtime.effects.inspectDispatch(effect.ref);
      if (["prepared", "awaiting-approval", "authorized"].includes(effect.state) && dispatch.state === "not-dispatched") {
        await runtime.effects.cancel(effect.ref); queue.cancel(request.review_id, "应用已重启，原等待已撤回；原 Git 操作未执行，需要时重新预览");
      }
      await settle(effect, request, typeof decision?.failure_reason === "string" ? new Error(decision.failure_reason) : undefined);
      restored.add(effect.ref.id);
    }
  };
  const detach = queue.registerRefresh(restore);
  return { async prepare(input, execution) {
    if (closed) throw new Error("应用正在关闭");
    const intent = structuredClone(input), key = fingerprint(intent);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(intent.operation_id)) throw new Error("Git 操作标识无效");
    const pending = working.get(key); if (pending) return pending;
    const task = (async () => {
      await restore(intent.board_id);
      const existing = runtime.effects.find(key);
      if (existing) {
        const old = await savedOf(existing);
        if (!old || JSON.stringify({ ...old, requested_at: undefined, kind: undefined }) !== JSON.stringify({ ...intent, requested_at: undefined, kind: undefined })) throw new Error("这次操作标识已对应另一份审查，不能替换");
        const original = queue.list(intent.board_id).find(item => item.operation?.kind === (intent.operation_kind ?? "git-index") && item.operation.operation_id === intent.operation_id);
        if (!original) throw new Error("原 Git 审查记录尚不可读，不能重新派出");
        return original;
      }
      const workspaceKey = JSON.stringify([intent.board_id, intent.workspace_id]);
      if (busy.has(workspaceKey) || queue.list(intent.board_id).some(item => {
        if (item.operation?.workspace_id !== intent.workspace_id) return false;
        const receipt = queue.receipt(item.review_id);
        return receipt?.effect_uncertain || receipt?.status === "pending" || receipt?.status === "approved" && !receipt.effect_settled && !receipt.effect_error;
      })) throw new Error("工作区已有待审、执行中或结果未知的 Git 操作，请先处理原操作");
      busy.add(workspaceKey);
      try {
        await execution.check();
        const now = await runtime.readClock();
        const saved: StoredReview = { ...intent, kind: "molis-git-index-review", requested_at: new Date(now.wallTimeMs).toISOString() };
        const reviewRef = await ports.publish(saved);
        const effect = await runtime.effects.prepare({ kind: "mutate-local", subject: { what: "tool", name: SUBJECT, input: key },
          summary: intent.document.kind === "tool-operation" ? intent.document.summary : intent.document.action === "stage" ? "暂存已审查的文件版本" : "取消所选文件的暂存", inputFingerprint: key, reviewRef, approvalTtlMs: APPROVAL_TTL }, now, "ask");
        if (closed || effect.state !== "awaiting-approval" || !effect.pending) { await runtime.effects.cancel(effect.ref); throw new Error("Git 操作没有进入可批准状态，未执行"); }
        const request = requestOf(effect, saved); live.add(effect.ref.id); queue.request(request);
        bindRecovery(effect, request);
        queue.registerDecisionHandler(request.review_id, async decision => {
          if (closed || runtime.effects.get(effect.ref)?.state !== "awaiting-approval") throw new Error("原 Git 操作的等待已经结束，不能重新派出");
          const receipt = queue.decide(decision);
          try {
            if (decision.decision === "approve") queue.consumeApproval(request.review_id);
            const { status, decided_by, decided_at, note } = receipt;
            await ports.saveDecision(key, { status, decided_by, decided_at, note });
            const answered = await runtime.effects.pendings.answer(effect.pending!.ref, { kind: "effect-approval", answer: decision.decision === "approve" ? "allow" : "deny" }, await runtime.readClock());
            if (decision.decision === "approve") {
              if (!answered.authorized) throw new Error("原执行方未接受批准，Git 操作未执行");
              let changed: unknown;
              try { await runtime.effects.dispatch(effect.ref, { recheck: async () => { try { await execution.check(); return true; } catch (error) { changed = error; return false; } }, run: execution.execute }); }
              catch (error) {
                let failure = changed ?? error;
                if (failure instanceof Error) {
                  try { await ports.saveFailure(key, failure.message); }
                  catch { failure = new Error(`${failure.message}（详细原因未能保存，重启后可能无法显示）`); }
                }
                await settle(effect, request, failure); return queue.receipt(request.review_id)!;
              }
            }
            await settle(effect, request); return queue.receipt(request.review_id)!;
          } catch (error) {
            queue.deliveryFailed(request.review_id, error instanceof Error ? error.message : "决定未送达");
            if (["prepared", "awaiting-approval", "authorized"].includes(runtime.effects.get(effect.ref)?.state ?? "")) await runtime.effects.cancel(effect.ref);
            throw error;
          } finally { live.delete(effect.ref.id); restored.add(effect.ref.id); }
        });
        return request;
      } finally { busy.delete(workspaceKey); }
    })();
    working.set(key, task);
    try { return await task; } finally { working.delete(key); }
  }, async close() {
    closed = true; detach();
    const report = await runtime.effects.readRecovery();
    for (const effect of report.effects) if (live.has(effect.ref.id) && ["prepared", "awaiting-approval", "authorized"].includes(effect.state)) {
      await runtime.effects.cancel(effect.ref); if (effect.pending) queue.cancel(`prologue-git:${effect.pending.ref.id}`, "应用关闭，待审 Git 操作已撤回");
    }
  } };
}
