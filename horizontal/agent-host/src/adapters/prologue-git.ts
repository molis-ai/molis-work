import { createHash } from "node:crypto";
import type { Effect, ExactRef, Runtime } from "@prologue/sdk";
import type { AgentGitIntegrationReviewDocument, AgentGitIndexReviewDocument, AgentToolOperationReviewDocument, AgentReviewReceipt, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { AgentReviewQueue, ReviewAuthority } from "../reviews.js";
import { bindGitRecovery } from "./prologue-git-recovery.js";

type GitReviewIntent = { project_id: string; workspace_id: string; operation_id: string } & (
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
  prepare(intent: GitReviewIntent, execution: { authority: ReviewAuthority; check(): Promise<void>; execute(): Promise<void> }): Promise<AgentReviewRequest>;
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
const assertHolds = (authority: ReviewAuthority, intent: GitReviewIntent) => {
  if (!authority.holds()) throw agentErrors.review_not_permitted(`插件 ${authority.plugin_id} 没有声明、没有获得或已不再持有 review:${intent.operation_kind ?? "git-index"}，这项 Git 操作不能发起，也不会执行`);
};
const fingerprint = (input: GitReviewIntent) => createHash("sha256").update(JSON.stringify([input.project_id, input.operation_id])).digest("hex");

function requestOf(effect: Effect, saved: StoredReview): AgentReviewRequest {
  if (!effect.pending) throw new Error("Git 操作缺少原审查等待");
  return { review_id: `prologue-git:${effect.pending.ref.id}`, run: null,
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
  const current = runtime.effects.get(effect.ref), dispatch = await runtime.effects.inspectDispatch(effect.ref);
  if (!current || dispatch.state === "unknown" || ["dispatching", "reconcile-required"].includes(current.state)) {
    queue.uncertain(request.review_id, "Git 操作结果尚未确定，请核对仓库；不会自动重复执行", { restored });
    return;
  }
  if (queue.receipt(request.review_id)?.status === "approved") {
    const saved = await ports.readDecision(effect.proposal.inputFingerprint);
    const reconciled = current.state === "failed" && dispatch.state === "not-dispatched" ? saved?.reconciliation : undefined;
    queue.settle(request.review_id, current.state === "completed" && dispatch.state === "dispatched" && dispatch.ok === true
      ? { ok: true } : { ok: false, error: reconciled ? "经核对，原操作未发生；不会自动重试"
        : error instanceof Error ? error.message : saved?.failure_reason ?? "这次 Git 操作没有完成；需要时重新预览，不会自动重试" }, { restored });
    if (reconciled) queue.recordReconciliation(request.review_id, reconciled);
  } else if (["cancelled", "denied", "failed"].includes(current.state)) queue.cancel(request.review_id, "原操作未执行，已撤回");
}

/** SDK Effects owns dispatch/recovery. The Host retains review provenance and diagnostic text, never execution state. */
export function createPrologueGitReviews(ports: Ports): PrologueGitReviewPort {
  const { runtime, queue } = ports;
  const live = new Set<string>(), restored = new Set<string>(), working = new Map<string, Promise<AgentReviewRequest>>();
  const busy = new Set<string>();
  const recovering = new Set<string>();
  let closed = false;
  const settle = (effect: Effect, request: AgentReviewRequest, error?: unknown, restored = false) => settleReview(ports, effect, request, error, restored);
  const bindRecovery = (effect: Effect, request: AgentReviewRequest) => bindGitRecovery({ runtime, queue, saveReconciliation: (key, value) => ports.saveReconciliation(key, value), live, recovering, closed: () => closed, settle }, effect, request);
  // Git operations from before this process are brought back once per board; every later one is registered live here,
  // so rereading the whole execution ledger on each review refresh found nothing new and cost a disk read per record.
  const settledBoards = new Set<string>();
  const restore = async (projectId: string) => {
    if (settledBoards.has(projectId)) return;
    const report = await runtime.effects.readRecovery();
    if (report.unavailable.length) throw new Error("执行记录暂不可读，不能发起新的 Git 操作");
    for (const effect of report.effects) {
      if (live.has(effect.ref.id) || restored.has(effect.ref.id)) continue;
      const saved = await savedOf(ports, effect);
      if (!saved || saved.project_id !== projectId) continue;
      const request = requestOf(effect, saved), decision = await ports.readDecision(fingerprint(saved));
      queue.restoreDecision(request, decision ? { status: decision.status, decided_by: decision.decided_by, decided_at: decision.decided_at, note: decision.note } : null);
      bindRecovery(effect, request);
      const dispatch = await runtime.effects.inspectDispatch(effect.ref);
      if (["prepared", "awaiting-approval", "authorized"].includes(effect.state) && dispatch.state === "not-dispatched") {
        await runtime.effects.cancel(effect.ref); queue.cancel(request.review_id, "应用已重启，原等待已撤回；原 Git 操作未执行，需要时重新预览");
      }
      await settle(effect, request, typeof decision?.failure_reason === "string" ? new Error(decision.failure_reason) : undefined, true);
      restored.add(effect.ref.id);
    }
    settledBoards.add(projectId);
  };
  const detach = queue.registerRefresh(restore);
  return { async prepare(input, execution) {
    if (closed) throw new Error("应用正在关闭"); assertHolds(execution.authority, input);
    const intent = structuredClone(input), key = fingerprint(intent);
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
              try { await runtime.effects.dispatch(effect.ref, { recheck: async () => { try { assertHolds(execution.authority, intent); await execution.check(); return true; } catch (error) { changed = error; return false; } }, run: execution.execute }); }
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
