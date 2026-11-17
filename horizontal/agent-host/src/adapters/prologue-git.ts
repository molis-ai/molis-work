import { createHash } from "node:crypto";
import type { Effect, ExactRef, Runtime } from "@prologue/sdk";
import type { AgentGitIntegrationReviewDocument, AgentGitIndexReviewDocument, AgentToolOperationReviewDocument, AgentReviewReceipt, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { AgentReviewQueue, ReviewAuthority, ReviewDecisionCommit } from "../reviews.js";
import type { ReviewDecisionStore } from "../review-decisions.js";
import { prologueReviewReference } from "./prologue-review-decisions.js";
import { inspectReviewEffect } from "./prologue-review-effects.js";
import { bindGitRecovery } from "./prologue-git-recovery.js";

type GitReviewIntent = { project_id: string; workspace_id: string; operation_id: string; proposal_fingerprint: string } & (
  | { operation_kind?: "git-index"; document: AgentGitIndexReviewDocument }
  | { operation_kind: "git-integration"; document: AgentGitIntegrationReviewDocument }
  | { operation_kind: "git-worktree"; document: AgentToolOperationReviewDocument }
  /** Commit, branch, push or pull request: one reviewed operation on the person's repository. */
  | { operation_kind: "git-operation"; document: AgentToolOperationReviewDocument }
);
const GIT_OPERATION_TOOLS = /^git-(commit|branch-create|branch-switch|push|pr-create|merge|pull|resolve|merge-abort)$/;
/** Who asked is stored, never inferred from the operation: a record without it is not read (no fallback for older ones). */
type StoredReview = GitReviewIntent & { kind: "molis-git-index-review"; requested_at: string; plugin_id: string; install_id: string };
type Decision = Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note" | "reconciliation"> & { failure_reason?: string };
export interface PrologueGitReviewPort {
  /** `authority` is the installation that asks; it must hold `review:<kind>` before anything is written and again before it runs. */
  prepare(intent: GitReviewIntent, execution: { authority: ReviewAuthority; check(): Promise<void>; execute(assertCurrent: () => void): Promise<void> }): Promise<AgentReviewRequest>;
  close(): Promise<void>;
}
interface Ports {
  runtime: Runtime;
  queue: AgentReviewQueue;
  decisionStore: ReviewDecisionStore;
  publish(value: unknown): Promise<ExactRef<"resource">>;
  read(ref: ExactRef<"resource">): Promise<unknown>;
  saveDecision(key: string, value: Decision): Promise<void>;
  saveFailure(key: string, reason: string): Promise<void>;
  saveReconciliation(key: string, value: NonNullable<AgentReviewReceipt["reconciliation"]>, decision: Decision): Promise<void>;
  readDecision(key: string): Promise<Decision | undefined>;
}
const SUBJECT = "molis.git.index";
const APPROVAL_TTL = 10 * 60 * 1000;
const assertHolds = (authority: ReviewAuthority, intent: GitReviewIntent) => {
  if (!authority.holds()) throw agentErrors.review_not_permitted(`插件 ${authority.plugin_id} 没有声明、没有获得或已不再持有 review:${intent.operation_kind ?? "git-index"}，这项 Git 操作不能发起，也不会执行`);
};
const fingerprint = (input: GitReviewIntent) => createHash("sha256").update(JSON.stringify([input.project_id, input.operation_id])).digest("hex");

function requestOf(effect: Effect, saved: StoredReview): AgentReviewRequest {
  if (!effect.pending) throw new Error("Git 操作缺少原审查等待");
  const reviewId = `prologue-git:${effect.pending.ref.id}`;
  return { review_id: reviewId, reference: prologueReviewReference(saved, reviewId, effect, { workspace_id: saved.workspace_id, operation_id: saved.operation_id, proposal_fingerprint: saved.proposal_fingerprint }), run: null,
    operation: { kind: saved.operation_kind ?? "git-index", operation_id: saved.operation_id, workspace_id: saved.workspace_id },
    project_id: saved.project_id, plugin_id: saved.plugin_id, kind: saved.document.kind, document: saved.document,
    requested_at: saved.requested_at, expires_at: new Date(Date.parse(saved.requested_at) + APPROVAL_TTL).toISOString() };
}
/** The stored review behind a Git effect; null for an effect that is not one, an error for one whose owner cannot be read. */
async function savedOf(ports: Ports, effect: Effect): Promise<StoredReview | null> {
  if (effect.proposal.subject.what !== "tool" || effect.proposal.subject.name !== SUBJECT || !effect.proposal.reviewRef) return null;
  const value = await ports.read(effect.proposal.reviewRef) as StoredReview;
  if (value?.kind !== "molis-git-index-review" || !value.project_id || !value.workspace_id || !value.operation_id || typeof value.plugin_id !== "string" || !value.plugin_id || typeof value.install_id !== "string" || !value.install_id
    || (value.operation_kind === "git-integration" ? value.document?.kind !== "git-integration"
      : value.operation_kind === "git-worktree" ? value.document?.kind !== "tool-operation" || value.document.tool !== "git-worktree-create"
      : value.operation_kind === "git-operation" ? value.document?.kind !== "tool-operation" || !GIT_OPERATION_TOOLS.test(value.document.tool)
      : value.document?.kind !== "git-index")) throw new Error("Git 审查归属不可读，不能猜测执行结果");
  return value;
}
/** Carry an effect's settled outcome onto its review; an outcome not yet known stays uncertain and is never retried. */
async function settleReview(ports: Ports, effect: Effect, request: AgentReviewRequest, error?: unknown, restored = false) {
  const { runtime, queue } = ports;
  const { effect: inspected, dispatch, inspectionFailure } = await inspectReviewEffect(runtime, effect.ref);
  let current = inspected;
  const receipt = queue.receipt(request.review_id);
  if ((restored || receipt?.delivery_error) && current && ["prepared", "awaiting-approval", "authorized"].includes(current.state) && dispatch.state === "not-dispatched") {
    try { await runtime.effects.cancel(effect.ref); } catch (failure) { error ??= failure; }
    current = runtime.effects.get(effect.ref);
  }
  const readProjection = () => ports.readDecision(effect.proposal.inputFingerprint);
  if (!current || dispatch.state === "unknown" || !["completed", "failed", "denied", "cancelled"].includes(current.state)) {
    const saved = receipt?.status === "approved" ? await readProjection().catch(() => undefined) : undefined;
    const reason = inspectionFailure instanceof Error ? inspectionFailure.message
      : error instanceof Error ? error.message : saved?.failure_reason ?? receipt?.effect_uncertain;
    const guidance = request.operation?.kind === "git-worktree"
      ? "工作树准备结果尚待核对；请检查本次审查列出的目录、分支和来源登记，不要重复创建"
      : "Git 操作结果尚未确定，请核对仓库；不会自动重复执行";
    queue.uncertain(request.review_id, reason ?? guidance, { restored });
    return;
  }
  if (receipt?.status === "approved") {
    // Only the original historical records still depend on this old decision read.
    const projection = readProjection();
    const saved = await (receipt.source ? projection.catch(() => undefined) : projection);
    const reconciled = current.state === "failed" && dispatch.state === "not-dispatched" ? saved?.reconciliation : undefined;
    const outcome = current.state === "completed" && dispatch.state === "dispatched" && dispatch.ok === true
      ? { ok: true } : { ok: false, error: reconciled ? "经核对，原操作未发生；不会自动重试"
        : error instanceof Error ? error.message : saved?.failure_reason ?? "这次 Git 操作没有完成；需要时重新预览，不会自动重试" };
    if (dispatch.state === "not-dispatched" && !reconciled) queue.settleNotDispatched(request.review_id, `确认未执行。${outcome.error ?? "原 Git 操作没有派出"}`);
    else queue.settle(request.review_id, outcome, { restored });
    if (reconciled) queue.recordReconciliation(request.review_id, reconciled);
  } else if (["cancelled", "denied", "failed"].includes(current.state)) {
    queue.cancel(request.review_id, "原操作未执行，已撤回"); queue.confirmDecisionClosed(request.review_id);
  }
}

/** SDK Effects owns dispatch/recovery. The Host retains review provenance and diagnostic text, never execution state. */
export function createPrologueGitReviews(ports: Ports): PrologueGitReviewPort {
  const { runtime, queue } = ports;
  const live = new Set<string>(), restored = new Set<string>(), working = new Map<string, Promise<AgentReviewRequest>>();
  const checking = new Map<string, { effect: Effect; restored: boolean }>();
  const refreshing = new Map<string, Promise<void>>();
  const settling = new Set<Promise<unknown>>();
  const busy = new Set<string>();
  const recovering = new Set<string>();
  let closed = false;
  const track = <T>(pending: Promise<T>): Promise<T> => {
    settling.add(pending);
    return pending.finally(() => settling.delete(pending));
  };
  const settle = (effect: Effect, request: AgentReviewRequest, error?: unknown, restored = false) => settleReview(ports, effect, request, error, restored);
  const bindRecovery = (effect: Effect, request: AgentReviewRequest): void => bindGitRecovery({ runtime, queue, saveReconciliation: (key, value, control) => {
    const receipt = queue.receipt(request.review_id)!;
    return ports.decisionStore.withControl(control, () => ports.saveReconciliation(key, value,
      { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note }));
  }, live, recovering, track, closed: () => closed, settle }, effect, request);
  // Git operations from before this process are brought back once per board; every later one is registered live here,
  // so rereading the whole execution ledger on each review refresh found nothing new and cost a disk read per record.
  const historyByProject = new Map<string, Promise<void>>();
  const loadHistory = async (projectId: string) => {
    const report = await runtime.effects.readRecovery();
    if (report.unavailable.length) throw new Error("执行记录暂不可读，不能发起新的 Git 操作");
    for (const effect of report.effects) {
      if (live.has(effect.ref.id) || restored.has(effect.ref.id)) continue;
      const saved = await savedOf(ports, effect);
      if (!saved || saved.project_id !== projectId) continue;
      const request = requestOf(effect, saved);
      let recorded, decision;
      try {
        recorded = await ports.decisionStore.read(request.reference);
        if (!recorded) decision = await ports.readDecision(fingerprint(saved));
      } catch {
        queue.restoreUnreadableDecision(request, async () => ({ request, decision: await ports.readDecision(fingerprint(saved)) ?? null }));
        checking.set(request.review_id, { effect, restored: true });
        bindRecovery(effect, request); restored.add(effect.ref.id); continue;
      }
      if (recorded) queue.restoreRecordedDecision(recorded);
      else queue.restoreDecision(request, decision ? { status: decision.status, decided_by: decision.decided_by, decided_at: decision.decided_at, note: decision.note } : null);
      await settle(effect, request, typeof decision?.failure_reason === "string" ? new Error(decision.failure_reason) : undefined, true);
      bindRecovery(effect, request);
      if (queue.receipt(request.review_id)?.effect_uncertain) checking.set(request.review_id, { effect, restored: true });
      restored.add(effect.ref.id);
    }
  };
  const restore = (projectId: string): Promise<void> => {
    const previous = historyByProject.get(projectId);
    if (previous) return previous;
    const read = loadHistory(projectId).catch(error => { historyByProject.delete(projectId); throw error; });
    historyByProject.set(projectId, read);
    return read;
  };
  const refresh = async (projectId: string) => {
    await restore(projectId);
    // Only live requests whose committed decision lost its return need checking.
    // They keep no execution authority after the store resolves the unknown save.
    for (const [reviewId, original] of checking) {
      const effect = runtime.effects.get(original.effect.ref);
      if (!effect || recovering.has(effect.ref.id)) continue;
      const request = queue.get(reviewId);
      const receipt = queue.receipt(reviewId);
      if (!request || request.project_id !== projectId || queue.isDeciding(reviewId) || receipt?.decision_save_error || !original.restored && !receipt?.delivery_error && !receipt?.effect_uncertain) continue;
      recovering.add(effect.ref.id);
      try {
        await settle(effect, request, undefined, original.restored); live.delete(effect.ref.id); restored.add(effect.ref.id);
        if (!queue.receipt(reviewId)?.effect_uncertain && ["completed", "failed", "denied", "cancelled"].includes(runtime.effects.get(effect.ref)?.state ?? "")) checking.delete(reviewId);
      } finally { recovering.delete(effect.ref.id); }
    }
  };
  const detach = queue.registerRefresh(projectId => {
    if (closed) return Promise.resolve();
    const previous = refreshing.get(projectId); if (previous) return previous;
    const pending = track(refresh(projectId)).finally(() => refreshing.delete(projectId));
    refreshing.set(projectId, pending); return pending;
  });
  return { async prepare(input, execution) {
    if (closed) throw new Error("应用正在关闭"); assertHolds(execution.authority, input);
    const intent = structuredClone(input), key = fingerprint(intent);
    if (!/^[a-f0-9]{64}$/.test(intent.proposal_fingerprint)) throw new Error("Git 操作缺少执行主人固定的参数与目标版本");
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(intent.operation_id)) throw new Error("Git 操作标识无效");
    const pending = working.get(key); if (pending) return pending;
    const task = (async () => {
      await restore(intent.project_id);
      const existing = runtime.effects.find(key);
      if (existing) {
        const old = await savedOf(ports, existing);
        if (!old || JSON.stringify({ ...old, requested_at: undefined, kind: undefined }) !== JSON.stringify({ ...intent, plugin_id: execution.authority.plugin_id, install_id: execution.authority.install_id })) throw new Error("这次操作标识已对应另一份审查，不能替换");
        const original = queue.list(intent.project_id).find(item => item.operation?.kind === (intent.operation_kind ?? "git-index") && item.operation.operation_id === intent.operation_id);
        if (!original) throw new Error("原 Git 审查记录尚不可读，不能重新派出");
        return original;
      }
      const workspaceKey = JSON.stringify([intent.project_id, intent.workspace_id]);
      if (busy.has(workspaceKey) || queue.list(intent.project_id).some(item => {
        if (item.operation?.workspace_id !== intent.workspace_id) return false;
        const receipt = queue.receipt(item.review_id);
        return receipt?.effect_uncertain || receipt?.status === "pending" || receipt?.status === "approved" && !receipt.effect_settled && !receipt.effect_error;
      })) throw new Error("工作区已有待审、执行中或结果未知的 Git 操作，请先处理原操作");
      busy.add(workspaceKey);
      try {
        await execution.check(); assertHolds(execution.authority, intent);
        const now = await runtime.readClock();
        const saved: StoredReview = { ...intent, plugin_id: execution.authority.plugin_id, install_id: execution.authority.install_id, kind: "molis-git-index-review", requested_at: new Date(now.wallTimeMs).toISOString() };
        const reviewRef = await ports.publish(saved);
        const effect = await runtime.effects.prepare({ kind: "mutate-local", subject: { what: "tool", name: SUBJECT, input: key },
          summary: intent.document.kind === "tool-operation" ? intent.document.summary : intent.document.kind === "git-integration" ? "将选定子任务成果整合到主工作区" : intent.document.action === "stage" ? "暂存已审查的文件版本" : "取消所选文件的暂存", inputFingerprint: key, reviewRef, approvalTtlMs: APPROVAL_TTL }, now, "ask");
        if (closed || effect.state !== "awaiting-approval" || !effect.pending) { await runtime.effects.cancel(effect.ref); throw new Error("Git 操作没有进入可批准状态，未执行"); }
        const request = requestOf(effect, saved); live.add(effect.ref.id); queue.request(request, execution.authority);
        checking.set(request.review_id, { effect, restored: false });
        bindRecovery(effect, request);
        const answerable = () => !closed && live.has(effect.ref.id) && runtime.effects.get(effect.ref)?.state === "awaiting-approval"
          && runtime.effects.pendings.get(effect.pending!.ref)?.state === "open";
        const decide = async (decision: Parameters<AgentReviewQueue["respond"]>[0], commit: ReviewDecisionCommit) => {
          if (!answerable()) throw new Error("原 Git 操作的等待已经结束，不能重新派出");
          const receipt = await commit();
          const assertCurrent = () => { commit.assertCurrent(); if (!answerable()) throw new Error("原 Git 等待已结束，决定不会送达"); };
          try {
            assertCurrent();
            const { status, decided_by, decided_at, note } = receipt;
            await commit.effect(() => ports.saveDecision(key, { status, decided_by, decided_at, note }), assertCurrent);
            assertCurrent();
            if (decision.decision === "approve") queue.consumeApproval(request.review_id);
            const answered = await commit.effect(async () => runtime.effects.pendings.answer(effect.pending!.ref, { kind: "effect-approval", answer: decision.decision === "approve" ? "allow" : "deny" }, await runtime.readClock(), { assertBeforeAnswer: assertCurrent }));
            if (decision.decision === "approve") {
              if (!answered.authorized) throw new Error("原执行方未接受批准，Git 操作未执行");
              let changed: unknown;
              try { await runtime.effects.dispatch(effect.ref, { recheck: async () => { try { assertHolds(execution.authority, intent); await execution.check(); commit.assertCurrent(); return true; } catch (error) { changed = error; return false; } },
                run: async () => {
                  const assertExecutionCurrent = () => { commit.assertCurrent(); assertHolds(execution.authority, intent); };
                  assertExecutionCurrent(); await execution.execute(assertExecutionCurrent);
                } }); }
              catch (error) {
                let failure = changed ?? error;
                if (failure instanceof Error) {
                  const message = failure.message;
                  try { await commit.effect(() => ports.saveFailure(key, message)); }
                  catch { failure = new Error(`${failure.message}（详细原因未能保存，重启后可能无法显示）`); }
                }
                await settle(effect, request, failure); return queue.receipt(request.review_id)!;
              }
            }
            await settle(effect, request); return queue.receipt(request.review_id)!;
          } catch (error) {
            const reason = error instanceof Error ? error.message : "决定未送达";
            queue.deliveryFailed(request.review_id, reason);
            try {
              if (["prepared", "awaiting-approval", "authorized"].includes(runtime.effects.get(effect.ref)?.state ?? "")) await runtime.effects.cancel(effect.ref);
            } finally { await settle(effect, request, error); }
            throw error;
          } finally {
            live.delete(effect.ref.id); restored.add(effect.ref.id);
            const receipt = queue.receipt(request.review_id);
            if (!receipt?.effect_uncertain && !receipt?.delivery_error && ["completed", "failed", "denied", "cancelled"].includes(runtime.effects.get(effect.ref)?.state ?? "")) checking.delete(request.review_id);
          }
        };
        queue.registerDecisionHandler(request.review_id, (decision, commit) => track(decide(decision, commit)), async () => answerable);
        return request;
      } finally { busy.delete(workspaceKey); }
    })();
    working.set(key, task);
    try { return await task; } finally { working.delete(key); }
  }, async close() {
    closed = true; detach();
    await Promise.allSettled(working.values());
    const report = await runtime.effects.readRecovery();
    for (const effect of report.effects) if (live.has(effect.ref.id) && ["prepared", "awaiting-approval", "authorized"].includes(effect.state)) {
      await runtime.effects.cancel(effect.ref); if (effect.pending) queue.cancel(`prologue-git:${effect.pending.ref.id}`, "应用关闭，待审 Git 操作已撤回");
    }
    // Decisions and recovery already in progress own their final receipts; keep storage and notification origins until they settle.
    await Promise.allSettled(settling);
  } };
}
