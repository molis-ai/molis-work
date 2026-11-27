import { randomUUID } from "node:crypto";
import { WORKSPACE_REWIND_KIND, type Effect, type ExactRef, type Runtime } from "@prologue/sdk";
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentCheckpoint, AgentCheckpointsCapability, AgentReviewDecisionInput, AgentReviewReceipt, AgentReviewRequest, AgentRewindReviewDocument, AgentWorkingDirectory } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentReviewQueue, ReviewDecisionCommit } from "../reviews.js";
import type { ReviewDecisionStore } from "../review-decisions.js";
import { prologueReviewReference } from "./prologue-review-decisions.js";
import { inspectReviewEffect } from "./prologue-review-effects.js";

/** Host-owned provenance only. Execution and content remain in SDK Effects/Resources. */
export interface PrologueRewindIntent {
  operation_id: string;
  checkpoint_id: string;
  directory: AgentWorkingDirectory;
  root_ref: ExactRef<"authorized-root">;
  requested_at: string;
}
interface CheckpointIndex {
  owner: { project_id: string; plugin_id: string; install_id: string };
  attempts: Array<{ frozen: { directory?: AgentWorkingDirectory }; run_id?: string }>;
  rewinds?: PrologueRewindIntent[];
  review_decisions?: Record<string, Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note">>;
}
interface Ports {
  runtime: Runtime;
  queue: AgentReviewQueue;
  decisionStore: ReviewDecisionStore;
  readIndex(id: string): Promise<CheckpointIndex | undefined>;
  remember(id: string, intent: PrologueRewindIntent): Promise<void>;
  decision(id: string, pendingId: string, receipt: AgentReviewReceipt): Promise<void>;
  readResource(ref: ExactRef<"resource">): Promise<unknown>;
}
const sameRef = (a: unknown, b: ExactRef<"authorized-root">) => {
  const value = a as Partial<ExactRef<"authorized-root">> | undefined;
  return value?.kind === b.kind && value.id === b.id && value.revision === b.revision;
};
const safePath = (path: unknown): path is string => typeof path === "string" && path.length > 0
  && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(part => part === ".." || part === "." || !part);

/** The full preview a person approves a rewind on, read back from the SDK's review resource and checked against the intent. */
async function rewindDocument(readResource: Ports["readResource"], effect: Effect, intent: PrologueRewindIntent, sessionId: string): Promise<AgentRewindReviewDocument> {
  if (!effect.proposal.reviewRef || effect.proposal.origin?.session !== sessionId || effect.proposal.origin.run !== undefined) throw new Error("手动回退归属不一致");
  const value = await readResource(effect.proposal.reviewRef) as Record<string, unknown>;
  if (!value || value.kind !== WORKSPACE_REWIND_KIND || value.version !== 1 || value.operationKey !== intent.operation_id
    || value.checkpointId !== intent.checkpoint_id || value.sessionId !== sessionId || !sameRef(value.rootRef, intent.root_ref)
    || typeof value.previewFingerprint !== "string" || !Array.isArray(value.files) || value.files.length === 0) throw new Error("检查点完整预览不可用，不能批准");
  const files = value.files.map((item: unknown) => {
    const file = item as { path?: unknown; current?: { exists?: unknown; text?: unknown }; restored?: { exists?: unknown; text?: unknown } };
    if (!safePath(file?.path) || typeof file.current?.exists !== "boolean" || typeof file.current.text !== "string"
      || typeof file.restored?.exists !== "boolean" || typeof file.restored.text !== "string") throw new Error("回退预览缺少完整正文，不能批准");
    return { path: file.path, change: !file.restored.exists ? "delete" as const : !file.current.exists ? "create" as const : "restore" as const,
      before_text: file.current.exists ? file.current.text : null, after_text: file.restored.exists ? file.restored.text : null };
  });
  return { kind: "rewind", checkpoint_id: intent.checkpoint_id, files };
}

/** What the review queue says once the SDK's effect has an outcome; a session whose outcome cannot be proven is held uncertain. */
async function settleRewind(runtime: Runtime, queue: AgentReviewQueue, uncertain: Set<string>, effectRef: ExactRef<"effect">, reviewId: string, options: { failure?: unknown; restored?: boolean } = {}): Promise<void> {
  let { effect, dispatch } = await inspectReviewEffect(runtime, effectRef);
  const receipt = queue.receipt(reviewId);
  let failure = options.failure;
  if ((options.restored || receipt?.delivery_error) && effect && ["prepared", "awaiting-approval", "authorized"].includes(effect.state) && dispatch.state === "not-dispatched") {
    try { await runtime.effects.cancel(effectRef); } catch (error) { failure ??= error; }
    effect = runtime.effects.get(effectRef);
  }
  const sessionId = effect?.proposal.origin?.session;
  if (!effect || dispatch.state === "unknown" || effect?.state === "reconcile-required" || effect?.state === "dispatching") {
    if (sessionId) uncertain.add(sessionId);
    queue.uncertain(reviewId, "回退结果仍不确定。请核对文件，不能重复执行；命令和外部操作不会被撤销。");
  } else if (receipt?.status === "approved") {
    if (effect?.state === "completed" && dispatch.state === "dispatched" && dispatch.ok === true) queue.settle(reviewId, { ok: true });
    else if (["failed", "denied", "cancelled"].includes(effect?.state ?? "")) {
      const error = (failure as { code?: string })?.code === "CHECKPOINT_STALE" ? "预览后文件已变化，本次没有写入。请重新预览并核对最新内容。" : failure instanceof Error ? failure.message : "回退没有完成，不会自动重试；请重新核对当前文件";
      if (dispatch.state === "not-dispatched") queue.settleNotDispatched(reviewId, error);
      else queue.settle(reviewId, { ok: false, error });
    }
    else { if (sessionId) uncertain.add(sessionId); queue.uncertain(reviewId, "尚无可确认的回退结果，不能重复执行"); }
  } else if (["cancelled", "denied", "failed"].includes(effect?.state ?? "")) {
    if (receipt?.status === "pending") queue.cancel(reviewId, "回退已结束，未获得可继续的批准");
    queue.confirmDecisionClosed(reviewId);
  }
  const request = queue.get(reviewId);
  if (sessionId && request && !queue.list(request.project_id).some(item => item.operation?.session_id === sessionId && queue.receipt(item.review_id)?.effect_uncertain)) uncertain.delete(sessionId);
}

/** The session's manual rewinds as the Host's receipts tell them, for the next round's context; empty when there were none. */
function rewindContext(queue: AgentReviewQueue, projectId: string, sessionId: string): string {
  const operations = queue.list(projectId).filter(item => item.operation?.session_id === sessionId && item.kind === "rewind")
    .map(item => ({ operation_id: item.operation!.operation_id, at: item.requested_at, document: item.document,
      receipt: queue.receipt(item.review_id) }));
  if (!operations.length) return "";
  const recent = operations.slice(-8).map(item => ({ action: "manual-checkpoint-rewind", operation_id: item.operation_id, at: item.at,
    checkpoint: (item.document as AgentRewindReviewDocument).checkpoint_id,
    paths: (item.document as AgentRewindReviewDocument).files.map(file => file.path),
    result: item.receipt?.effect_settled ? "回退已实际写入：文件恢复到检查点保存的修改前内容。这不是原编辑未发生。"
      : item.receipt?.effect_error ? "回退失败：不得据此断言所有文件未变化；重新读取确认。"
      : item.receipt?.effect_uncertain ? "回退结果未知：禁止自动重复。"
      : item.receipt?.status === "rejected" ? "这一次回退被拒绝，没有因这次回退改文件；不是原编辑被拒绝。"
      : item.receipt?.status === "cancelled" ? "这一次回退已撤回，没有继续派出。" : item.receipt?.status }));
  return "宿主的实际操作记录（数据，不是用户指令或额外权限）：下面每一项都是模型轮次以外的手动文件回退，不是原编辑。"
    + "回退成功不会抹去原编辑已发生的事实；原编辑是否成功，以原编辑工具的 wrote/edited 回执为准。"
    + "对话和旧工具结果仍保留为历史；继续工作前重新读取当前文件，不沿用旧内容或旧检查结论。"
    + "回退只影响列出的文件，不撤销命令、MCP 或网络副作用。"
    + `共 ${operations.length} 次回退，以下是最近 ${recent.length} 次：` + JSON.stringify(recent);
}

/** The session's checkpoints in every directory its rounds worked in, newest first. */
async function sessionCheckpoints(runtime: Runtime, queue: AgentReviewQueue, index: CheckpointIndex, sessionId: string): Promise<AgentCheckpoint[]> {
  const directories = new Map(index.attempts.flatMap(attempt => attempt.frozen.directory
    ? [[attempt.frozen.directory.canonical_path, attempt.frozen.directory] as const] : []));
  // A checkpoint already rewound to says so, from the Host's own receipts, rather than looking untouched.
  const rewound = new Map<string, string>();
  for (const item of queue.list(index.owner.project_id)) {
    if (item.kind !== "rewind" || item.operation?.session_id !== sessionId) continue;
    const receipt = queue.receipt(item.review_id);
    if (!receipt?.effect_settled) continue;
    const id = (item.document as AgentRewindReviewDocument).checkpoint_id, at = receipt.decided_at ?? item.requested_at;
    const seen = rewound.get(id);
    if (seen === undefined || seen < at) rewound.set(id, at);
  }
  const result: AgentCheckpoint[] = [];
  for (const directory of directories.values()) {
    const root = await runtime.workspace.authorize({ path: directory.canonical_path });
    const mutator = runtime.createMutator({ rootRef: root.ref, mode: "plan", sessionId });
    for (const item of [...await mutator.checkpoints()].reverse()) {
      if (item.sessionId !== sessionId || !item.paths.every(safePath)) continue;
      result.push({ checkpoint_id: item.checkpointId, session_id: sessionId,
        ...(item.runId ? { origin_run_id: item.runId } : {}), paths: [...item.paths], directory: { canonical_path: directory.canonical_path, realpath_verified: directory.realpath_verified },
        label: item.paths.join("、"), created_at: new Date(item.takenAtMs).toISOString(),
        ...(rewound.has(item.checkpointId) ? { rewound_at: rewound.get(item.checkpointId)! } : {}) });
    }
  }
  return result.sort((a, b) => compareCodeUnits(b.created_at, a.created_at));
}

/** Carries the person's decision to the SDK's pending approval: only while the round that asked still holds it and the effect still waits. */
async function answerRewind(ports: Ports, decision: AgentReviewDecisionInput, request: AgentReviewRequest, effect: Effect, currentPending: () => ReturnType<Runtime["effects"]["pendings"]["get"]>, sessionId: string, commit: ReviewDecisionCommit): Promise<AgentReviewReceipt> {
  const { runtime, queue } = ports;
  const pending = currentPending();
  if (!pending) throw new Error("这次回退已结束或原执行者不在，不能通过旧批准重新执行");
  const receipt = await commit();
  const assertCurrent = () => { commit.assertCurrent(); if (!currentPending()) throw new Error("原回退等待已结束，决定不会送达"); };
  try {
    assertCurrent();
    await commit.effect(() => ports.decision(sessionId, pending.ref.id, receipt), assertCurrent);
    assertCurrent();
    if (decision.decision === "approve") queue.consumeApproval(request.review_id);
    const answered = await commit.effect(async () => runtime.effects.pendings.answer(pending.ref,
      { kind: "effect-approval", answer: decision.decision === "approve" ? "allow" : "deny" }, await runtime.readClock(), { assertBeforeAnswer: assertCurrent }));
    if (!answered.authorized && decision.decision === "approve") throw new Error("执行方未接受本次批准，文件没有因此被确认回退");
    return queue.receipt(request.review_id)!;
  } catch (error) {
    queue.deliveryFailed(request.review_id, error instanceof Error ? error.message : "决定未送达执行方");
    await runtime.effects.cancel(effect.ref).catch(() => {});
    throw error;
  }
}

export function createPrologueCheckpoints(ports: Ports): AgentCheckpointsCapability & {
  restore(sessionId: string): Promise<void>;
  close(): Promise<void>;
  context(sessionId: string): Promise<string>;
} {
  const { runtime, queue } = ports;
  let closed = false;
  const active = new Map<string, { operationId: string; effect?: Effect; work?: Promise<void> }>();
  const restored = new Set<string>();
  const uncertain = new Set<string>();
  const checking = new Map<string, { effect: Effect; restored: boolean }>();
  const refreshing = new Map<string, Promise<void>>();
  const restoring = new Map<string, Promise<void>>();
  const deciding = new Map<string, Promise<AgentReviewReceipt>>();
  const requireIndex = async (id: string) => {
    const index = await ports.readIndex(id);
    if (!index) throw new Error("检查点缺少原会话归属，不能回退");
    return index;
  };
  const requestOf = async (sessionId: string, effect: Effect, intent: PrologueRewindIntent, expiresAt: string | null): Promise<AgentReviewRequest> => {
    const index = await requireIndex(sessionId);
    if (!effect.pending) throw new Error("回退没有待审引用，不能批准");
    const reviewId = `prologue:${effect.pending.ref.id}`;
    return { review_id: reviewId, reference: prologueReviewReference(index.owner, reviewId, effect, {
      session_id: sessionId, operation_id: intent.operation_id, checkpoint_id: intent.checkpoint_id, root_ref: intent.root_ref, directory: intent.directory.canonical_path,
    }), run: null,
      operation: { operation_id: intent.operation_id, session_id: sessionId, kind: "checkpoint-rewind" },
      ...index.owner, kind: "rewind", document: await rewindDocument(ports.readResource, effect, intent, sessionId), requested_at: intent.requested_at, expires_at: expiresAt };
  };
  // Rewinds from before this process are brought back once per session; every later one is live here, so rereading
  // the whole execution ledger on each refresh and each round's start found nothing new and cost a disk read per record.
  const settledSessions = new Set<string>(), settledBoards = new Set<string>();
  const restoreHistory = (sessionId: string): Promise<void> => {
    if (settledSessions.has(sessionId)) return Promise.resolve();
    const held = restoring.get(sessionId);
    if (held) return held;
    const work = (async () => {
      const index = await requireIndex(sessionId);
      if (!index.rewinds?.length) return;
      const recovery = await runtime.effects.readRecovery();
      if (recovery.unavailable.length) throw new Error("回退执行账暂不可读，不能猜测结果");
      for (const effect of recovery.effects) {
        if (effect.proposal.origin?.session !== sessionId || effect.proposal.origin.run !== undefined || !effect.pending || !effect.proposal.reviewRef) continue;
        const resource = await ports.readResource(effect.proposal.reviewRef) as { operationKey?: string };
        const intent = index.rewinds.find(item => item.operation_id === resource.operationKey);
        if (!intent || restored.has(intent.operation_id) || active.get(sessionId)?.operationId === intent.operation_id) continue;
        const request = queue.get(`prologue:${effect.pending.ref.id}`) ?? await requestOf(sessionId, effect, intent, null);
        let recorded;
        try { recorded = await ports.decisionStore.read(request.reference); }
        catch {
          queue.restoreUnreadableDecision(request, async () => ({ request, decision: (await requireIndex(sessionId)).review_decisions?.[effect.pending!.ref.id] ?? null }));
          checking.set(request.review_id, { effect, restored: true }); restored.add(intent.operation_id); continue;
        }
        const decision = index.review_decisions?.[effect.pending.ref.id];
        if (recorded) queue.restoreRecordedDecision(recorded);
        else if (decision) queue.restoreDecision(request, decision); else queue.request(request);
        await settleRewind(runtime, queue, uncertain, effect.ref, request.review_id, { restored: true });
        if (queue.receipt(request.review_id)?.effect_uncertain) checking.set(request.review_id, { effect, restored: true });
        restored.add(intent.operation_id);
      }
    })().then(() => { settledSessions.add(sessionId); }).finally(() => restoring.delete(sessionId));
    restoring.set(sessionId, work);
    return work;
  };
  const restore = (sessionId: string): Promise<void> => closed ? Promise.reject(new Error("执行引擎正在关闭")) : restoreHistory(sessionId);
  const refresh = async (projectId: string) => {
    if (!settledBoards.has(projectId)) {
      const report = await runtime.effects.readRecovery();
      if (report.unavailable.length) throw new Error("执行账暂不可读");
      const sessions = new Set(report.effects.flatMap(effect => effect.proposal.origin?.session ? [effect.proposal.origin.session] : []));
      for (const id of sessions) if ((await ports.readIndex(id))?.owner.project_id === projectId) await restoreHistory(id);
      settledBoards.add(projectId);
    }
    for (const [id, { effect, restored: historical }] of checking) {
      const receipt = queue.receipt(id);
      if (queue.get(id)?.project_id !== projectId || queue.isDeciding(id) || receipt?.decision_save_error || !historical && !receipt?.delivery_error && !receipt?.effect_uncertain) continue;
      await settleRewind(runtime, queue, uncertain, effect.ref, id, { restored: historical });
      if (!queue.receipt(id)?.effect_uncertain && ["completed", "failed", "denied", "cancelled"].includes(runtime.effects.get(effect.ref)?.state ?? "")) checking.delete(id);
    }
  };
  const detach = queue.registerRefresh(projectId => {
    if (closed) return Promise.resolve();
    const previous = refreshing.get(projectId); if (previous) return previous;
    const pending = refresh(projectId).finally(() => refreshing.delete(projectId));
    refreshing.set(projectId, pending); return pending;
  });
  const capability: AgentCheckpointsCapability & { restore: typeof restore; close(): Promise<void>; context(sessionId: string): Promise<string> } = {
    busy: session => active.has(session.session_id) || uncertain.has(session.session_id) || [...checking.values()].some(item => item.effect.proposal.origin?.session === session.session_id),
    restore,
    async context(sessionId) {
      await restore(sessionId);
      return rewindContext(queue, (await requireIndex(sessionId)).owner.project_id, sessionId);
    },
    async list(session) {
      await restore(session.session_id);
      const index = await requireIndex(session.session_id);
      return sessionCheckpoints(runtime, queue, index, session.session_id);
    },
    async prepareRewind(session, checkpointId) {
      if (closed) throw new Error("执行引擎正在关闭");
      if (capability.busy!(session)) throw new Error("这个会话已有回退在准备或等待审查");
      const operationId = randomUUID();
      const held: { operationId: string; effect?: Effect; work?: Promise<void> } = { operationId };
      active.set(session.session_id, held);
      let resolve!: (value: AgentReviewRequest) => void, reject!: (error: unknown) => void;
      const ready = new Promise<AgentReviewRequest>((res, rej) => { resolve = res; reject = rej; });
      held.work = (async () => {
        let reviewId: string | undefined;
        try {
          const checkpoints = await capability.list(session);
          const item = checkpoints.find(entry => entry.checkpoint_id === checkpointId);
          if (!item?.directory) throw new Error("当前会话没有这个检查点");
          const open = await runtime.listOpenWork();
          if (open.unavailable.length || open.items.some(work => work.origin.session === session.session_id)) throw new Error("会话有未结束或未知操作，核对后才能回退");
          const root = await runtime.workspace.authorize({ path: item.directory.canonical_path });
          const now = await runtime.readClock();
          const intent: PrologueRewindIntent = { operation_id: operationId, checkpoint_id: checkpointId, directory: item.directory, root_ref: root.ref, requested_at: new Date(now.wallTimeMs).toISOString() };
          await ports.remember(session.session_id, intent);
          const mutator = runtime.createMutator({ rootRef: root.ref, mode: "build", sessionId: session.session_id });
          const receipt = await mutator.rewind(checkpointId, now, undefined, {
            restrict: "ask",
            awaitApproval: async (effect, at) => {
              held.effect = effect;
              if (closed) { await runtime.effects.cancel(effect.ref); throw new Error("应用正在关闭，回退已撤回"); }
              if (!effect.pending || effect.state !== "awaiting-approval") throw new Error("回退没有活动审查等待");
              const clock = await runtime.readClock();
              const expires = new Date(clock.wallTimeMs + Math.max(0, effect.pending.expiresAtMs - clock.monotonicMs)).toISOString();
              const request = await requestOf(session.session_id, effect, intent, expires);
              reviewId = request.review_id;
              queue.request(request);
              checking.set(reviewId, { effect, restored: false });
              const currentPending = () => {
                const pending = runtime.effects.pendings.get(effect.pending!.ref);
                return !closed && active.get(session.session_id) === held && runtime.effects.get(effect.ref)?.state === "awaiting-approval"
                  && pending?.state === "open" ? pending : undefined;
              };
              queue.registerDecisionHandler(reviewId, (decision, commit) => {
                const answering = answerRewind(ports, decision, request, effect, currentPending, session.session_id, commit);
                deciding.set(request.review_id, answering); return answering.finally(() => deciding.delete(request.review_id));
              }, async () => () => Boolean(currentPending()));
              resolve(request);
              return runtime.effects.whenSettled(effect.ref, at);
            },
          }, operationId);
          if (reviewId) { await deciding.get(reviewId)?.catch(() => undefined); await settleRewind(runtime, queue, uncertain, receipt.effectRef, reviewId); }
        } catch (error) {
          if (held.effect && ["prepared", "awaiting-approval", "authorized"].includes(runtime.effects.get(held.effect.ref)?.state ?? "")) {
            try { await runtime.effects.cancel(held.effect.ref); } catch { uncertain.add(session.session_id); }
          }
          if (reviewId && held.effect) { await deciding.get(reviewId)?.catch(() => undefined); await settleRewind(runtime, queue, uncertain, held.effect.ref, reviewId, { failure: error }); }
          reject(error);
        } finally { restored.add(operationId); active.delete(session.session_id); if (reviewId && !queue.receipt(reviewId)?.effect_uncertain) checking.delete(reviewId); }
      })();
      // The returned promise represents preparation; the SDK owns subsequent execution.
      void held.work.catch(reject);
      return ready;
    },
    async close() {
      closed = true;detach();
      for (const held of active.values()) if (held.effect && ["prepared", "awaiting-approval", "authorized"].includes(runtime.effects.get(held.effect.ref)?.state ?? "")) await runtime.effects.cancel(held.effect.ref);
      await Promise.allSettled([...active.values()].map(item => item.work).concat([...restoring.values(), ...refreshing.values()]));
      await Promise.allSettled(deciding.values());
    },
  };
  return capability;
}
