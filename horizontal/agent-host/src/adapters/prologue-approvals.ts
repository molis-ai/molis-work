import { agentErrors } from "../errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type {

  AgentReviewDocument,
  AgentReviewKind,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentRunRef,
  AgentReviewDecisionInput,
  ReviewReference,
  AgentActionReviewControl,
  ReviewDecisionSource,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { AgentReviewQueue, type ReviewDecisionCommit } from "../reviews.js";

/**
 * Bridges Prologue's pending effect approvals to the Host Review queue.
 *
 * Prologue stops and waits; the user decides in the Host's own review surface;
 * only then does this bridge answer Prologue. Nothing else may release an
 * effect, and the answer Prologue gives back — not our own record — decides
 * whether the effect was really authorized.
 */

interface ProloguePendingRef { kind: "pending"; id: string; revision: number }

export type ProloguePendingState = "open" | "settled" | "expired" | "cancelled";

/** The slice of Prologue's pending ledger this bridge uses. */
export interface ProloguePending {
  ref: ProloguePendingRef;
  kind: string;
  state: ProloguePendingState;
  /** Safe explanation prepared by Prologue. Never contains secrets. */
  why: string;
  effectRef?: { kind: "effect"; id: string; revision: number };
  origin?: { session?: string; run?: string; character?: string };
  /** Wall-clock deadline projected using the SDK clock, never its monotonic timestamp. */
  expiresAtWallMs: number;
}

export interface ProloguePendingPort {
  read(ref: ProloguePendingRef): Promise<ProloguePending | undefined>;
  /** Read the immutable review published by the effect owner; fail if unavailable. */
  document(pending: ProloguePending): Promise<AgentReviewDocument>;
  /** Synchronous tail: preserve refusal-only summaries, never publish stale live details after an await. */
  finalPresentation?(pending: ProloguePending, document: AgentReviewDocument): AgentReviewDocument;
  reference(pending: ProloguePending): Promise<ReviewReference>;
  /** Persistent original-owner authority, independent of the completed start request. */
  approvalAuthority(pending: ProloguePending): Promise<PrologueApprovalControl>;
  /** An open persisted pending without a live SDK waiter cannot resume execution. */
  canAnswer(ref: ProloguePendingRef): boolean;
  answer(
    ref: ProloguePendingRef,
    answer: { kind: "effect-approval"; answer: "allow" | "deny" | "later" },
    assertBeforeAnswer: () => void,
  ): Promise<{ authorized: boolean }>;
}

type PrologueApprovalControl = AgentActionReviewControl & {
  beforeAnswer?(): void;
  readonly workSelection?: boolean;
  readonly automatic?: { source: Extract<ReviewDecisionSource, { kind: "delegation" | "policy" }>; assertCurrent(): void; activate(): void };
};

export interface PrologueApprovalBridgeOptions {
  queue: AgentReviewQueue;
  pendings: ProloguePendingPort;
  now?: () => Date;
  /** Persist the Host's decision before waking SDK execution; not an effect receipt. */
  recordDecision?(pending: ProloguePending, receipt: AgentReviewReceipt): Promise<void>;
  /** The person allowed this run to act in the approved desktop action's app for the rest of the round (D06). */
  allowAppForRound?(pending: ProloguePending): Promise<void>;
  /** Preserve the original presentation before a later restart projects it. */
  recordRequest?(pending: ProloguePending, request: AgentReviewRequest): Promise<void>;
}

export interface MirrorPendingInput {
  pending: ProloguePending;
  owner: { project_id: string; plugin_id: string };
  run: AgentRunRef;
  kind: AgentReviewKind;
  document: AgentReviewDocument;
  reference: ReviewReference;
  approval: PrologueApprovalControl;
}

export class PrologueApprovalBridge {
  readonly #queue: AgentReviewQueue;
  readonly #pendings: ProloguePendingPort;
  readonly #now: () => Date;
  readonly #recordDecision: PrologueApprovalBridgeOptions["recordDecision"];
  readonly #allowAppForRound: PrologueApprovalBridgeOptions["allowAppForRound"];
  readonly #recordRequest: PrologueApprovalBridgeOptions["recordRequest"];
  readonly #pendingByReview = new Map<string, ProloguePendingRef>();
  readonly #answered = new Set<(run: AgentRunRef, pendingId: string) => void>();
  readonly #working = new Set<Promise<unknown>>();
  #closed = false;

  #assertOpen(): void { if (this.#closed) throw agentErrors.pending_not_open("审查执行方正在关闭"); }

  #track<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(agentErrors.pending_not_open("审查执行方正在关闭"));
    const work = operation(); this.#working.add(work);
    return work.finally(() => this.#working.delete(work));
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.allSettled(this.#working);
    this.#pendingByReview.clear(); this.#answered.clear();
  }

  /** Execution accepted a decision; this does not assert the effect happened. */
  subscribeAnswered(listener: (run: AgentRunRef, pendingId: string) => void): () => void {
    this.#answered.add(listener);
    return () => { this.#answered.delete(listener); };
  }

  constructor(options: PrologueApprovalBridgeOptions) {
    this.#queue = options.queue;
    this.#pendings = options.pendings;
    this.#now = options.now ?? (() => new Date());
    this.#recordDecision = options.recordDecision;
    this.#allowAppForRound = options.allowAppForRound;
    this.#recordRequest = options.recordRequest;
  }

  /**
   * Put one Prologue pending in front of the user. The document comes from the
   * execution layer, which is the only place that knows what the effect is.
   */
  mirror(input: MirrorPendingInput): AgentReviewRequest {
    this.#assertOpen();
    if (input.pending.state !== "open" || !Number.isFinite(input.pending.expiresAtWallMs) || input.pending.expiresAtWallMs <= this.#now().getTime()) {
      throw agentErrors.pending_not_open("这笔待批已经结束，不能再放到审查面上");
    }
    if (input.pending.kind !== "effect-approval" || input.pending.origin?.session !== input.run.session_id
      || input.pending.origin?.run !== input.run.run_id || !input.owner.project_id || !input.owner.plugin_id) {
      throw agentErrors.pending_unknown("待批来源与执行归属不一致，不能替用户批准");
    }
    const reviewId = `prologue:${input.pending.ref.id}`;
    const previousRef = this.#pendingByReview.get(reviewId);
    if (previousRef && (previousRef.kind !== input.pending.ref.kind || previousRef.revision !== input.pending.ref.revision)) {
      throw agentErrors.pending_unknown("同一审查不能换成另一版本的待批引用");
    }
    const request = this.#queue.request({
      review_id: reviewId,
      reference: input.reference,
      run: { ...input.run },
      project_id: input.owner.project_id,
      plugin_id: input.owner.plugin_id,
      kind: input.kind,
      document: input.document,
      requested_at: this.#queue.get(reviewId)?.requested_at ?? this.#now().toISOString(),
      expires_at: new Date(input.pending.expiresAtWallMs).toISOString(),
    });
    if (!this.#pendingByReview.has(request.review_id)) {
      const pendingRef = { ...input.pending.ref };
      this.#queue.registerDecisionHandler(request.review_id, (decision, commit) => this.#track(() => this.#decide(decision, commit, input.approval)), async () => {
        if (this.#closed) return () => false;
        const pending = await this.#pendings.read(pendingRef);
        return () => {
          if (this.#closed) return false;
          if (!pending || pending.kind !== "effect-approval" || pending.ref.kind !== pendingRef.kind || pending.ref.id !== pendingRef.id || pending.ref.revision !== pendingRef.revision
            || pending.origin?.session !== request.run?.session_id || pending.origin?.run !== request.run?.run_id) return false;
          if (pending.state === "open" && this.#pendings.canAnswer(pendingRef)) return true;
          this.#queue.cancel(request.review_id, "原执行等待已结束");
          return false;
        };
      }, input.approval.assertCurrent, input.approval.beforeEffect, input.approval.workSelection !== true);
      this.#pendingByReview.set(request.review_id, pendingRef);
    }
    return request;
  }

  /**
   * Mirror a pending the Run announced, resolving it from the execution owner
   * first.
   *
   * The Run's event only carries a reference; what the effect actually is comes
   * from the pending itself, which is the execution owner's fact. A reference
   * that no longer resolves, or one already closed, raises rather than putting
   * a stale item in front of the user.
   */
  async mirrorPending(input: {
    pendingRef: ProloguePendingRef;
    owner: MirrorPendingInput["owner"];
    run: AgentRunRef;
  }): Promise<AgentReviewRequest> {
    return this.#track(async () => {
      const pending = await this.#pendings.read(input.pendingRef);
      if (!pending) {
        throw agentErrors.pending_unknown("执行主人那边找不到这笔待批");
      }
      const document = await this.#pendings.document(pending);
      const reference = await this.#pendings.reference(pending);
      let approval: PrologueApprovalControl;
      try { approval = await this.#pendings.approvalAuthority(pending); }
      catch (error) { approval = { assertCurrent: () => { throw error; }, beforeEffect: () => { throw error; } }; }
      // Reading the document and its authority can outlive the original waiter. Do not recreate a pending card after
      // cancellation already removed it; the execution owner's synchronous check is immediately before publication.
      if (!this.#pendings.canAnswer(pending.ref)) {
        const reviewId = `prologue:${pending.ref.id}`;
        if (this.#queue.get(reviewId)) this.#queue.cancel(reviewId, "原执行等待已结束");
        throw agentErrors.pending_not_open("原执行等待已结束，不能重新展示待批");
      }
      const request = this.mirror({
        pending,
        owner: input.owner,
        run: input.run,
        kind: document.kind,
        document: this.#pendings.finalPresentation?.(pending, document) ?? document,
        reference,
        approval,
    });
    if (approval.automatic) {
      try { await this.#queue.respondAutomatically(request, approval.automatic.source, approval.automatic.assertCurrent); }
      catch { /* An uncommitted automatic decision leaves the original wait for the person. */ }
    }
    if (this.#queue.receipt(request.review_id)?.status === "pending") await this.#recordRequest?.(pending, request);
    return request;
    });
  }

  /**
   * Record the user's decision, then tell Prologue.
   *
   * On approve the Host's one-time authority is consumed first, so a replayed
   * decision cannot authorize a second effect. Whether the effect is actually
   * authorized is read back from Prologue: if it disagrees, the receipt says
   * the effect did not settle rather than claiming success.
   */
  decide(input: AgentReviewDecisionInput, commit?: ReviewDecisionCommit): Promise<AgentReviewReceipt> {
    return this.#track(() => this.#decide(input, commit));
  }

  async #decide(input: AgentReviewDecisionInput, commit?: ReviewDecisionCommit, approval?: PrologueApprovalControl): Promise<AgentReviewReceipt> {
    if (!commit) return this.#queue.respond(input);
    const pendingRef = this.#pendingByReview.get(input.review_id);
    if (!pendingRef) {
      throw agentErrors.review_unknown("找不到这条待审操作");
    }
    const pending = await this.#pendings.read(pendingRef);
    if (!pending) {
      throw agentErrors.pending_unknown("执行主人那边找不到这笔待批");
    }

    const request = this.#queue.get(input.review_id);
    if (!request || !request.run || pending.ref.kind !== pendingRef.kind || pending.ref.revision !== pendingRef.revision || pending.ref.id !== pendingRef.id
      || pending.kind !== "effect-approval" || pending.origin?.session !== request?.run.session_id || pending.origin?.run !== request?.run.run_id) {
      throw agentErrors.pending_unknown("执行方返回的待批与原审查不一致");
    }
    if (pending.state !== "open") {
      // The execution owner already closed it. Our queue must not pretend the
      // user can still decide, and must not invent an approval.
      this.#queue.cancel(input.review_id, "执行主人已经结束了这笔待批");
      // The owner's refresh records cancellation; this late page request may already have lost its authority.
      throw agentErrors.pending_not_open("这笔待批已经结束，请刷新后按当前状态处理");
    }
    if (!this.#pendings.canAnswer(pendingRef)) {
      this.#queue.cancel(input.review_id, "执行已中断，原待批没有活动等待方；需核对后继续");
      throw agentErrors.pending_not_open("原执行已中断，不能通过批准旧待批恢复它");
    }
    if (input.remember && approval?.workSelection) throw agentErrors.review_not_permitted("已明确选择工作的权限方式，单次确认不能添加本轮或会话规则");
    if (input.remember === "app-this-round" && (input.decision !== "approve" || request.document.kind !== "tool-operation" || !request.document.round_allow)) {
      throw agentErrors.review_not_permitted("这张审查卡没有提供本轮应用许可");
    }
    const receipt = await commit(() => this.#assertOpen());
    const assertCurrent = () => {
      this.#assertOpen();
      commit.assertCurrent();
      if (!this.#pendings.canAnswer(pendingRef)) throw agentErrors.pending_not_open("原执行等待已结束，决定不会送达");
    };

    try {
      assertCurrent();
      await commit.effect(async () => { await this.#recordDecision?.(pending, receipt); }, assertCurrent);
      assertCurrent();
      if (input.decision === "approve") this.#queue.consumeApproval(input.review_id);
      const result = await commit.effect(() => this.#pendings.answer(pendingRef, {
        kind: "effect-approval", answer: input.decision === "approve" ? "allow" : "deny",
      }, () => {
        assertCurrent();
        if (input.decision === "approve") {
          requireSynchronous(approval?.beforeAnswer?.());
          if (receipt.source?.kind === "delegation" || receipt.source?.kind === "policy" && receipt.source.owner === "agent.assistant-reversible") {
            if (!approval?.automatic) throw agentErrors.review_not_permitted("原自动许可不可读取");
            approval.automatic.activate();
          }
        }
      }));
      if (input.decision === "approve" && result.authorized && input.remember === "app-this-round" && receipt.source?.kind === "person") {
        try {
          if (!approval || !this.#allowAppForRound) throw agentErrors.review_not_permitted("原应用许可不可读取");
          this.#assertOpen(); commit.assertCurrent();
          await approval.beforeEffect();
          this.#assertOpen(); commit.assertCurrent();
          await this.#allowAppForRound(pending);
        }
        catch { this.#queue.rememberFailed(input.review_id, "原决定已送达，但本轮应用许可未设置；后续操作仍按当前授权确认"); }
      }
      for (const listener of this.#answered) {
        // A view observer cannot turn accepted delivery into a delivery error.
        try { listener(request.run, pendingRef.id); } catch { /* observation only */ }
      }
      if (input.decision === "approve" && !result.authorized) {
        return this.#queue.settle(input.review_id, { ok: false, error: "执行主人没有把这次批准记为已授权" });
      }
      // Authorization wakes execution. It is not a write or command receipt.
      // Only the execution owner may subsequently settle the queue from facts.
      return this.#queue.receipt(input.review_id) ?? receipt;
    } catch (error) {
      // An interrupted answer may have committed. Do not label it not-executed
      // or retry it automatically; preserve the user's decision for recovery.
      return this.#queue.deliveryFailed(input.review_id,
        error instanceof Error ? error.message : "执行方尚未确认收到决定，结果待核对");
    }
  }

  /**
   * Leaving the surface changes no SDK state. SDK `later` closes the original
   * pending and creates a new exact reference, so it is not used as a UI defer.
   */
  async defer(reviewId: string): Promise<void> {
    return this.#track(async () => {
      const pendingRef = this.#pendingByReview.get(reviewId);
      if (!pendingRef) {
        throw agentErrors.review_unknown("找不到这条待审操作");
      }
      const pending = await this.#pendings.read(pendingRef);
      if (!pending || pending.state !== "open") throw agentErrors.pending_not_open("这笔待批已结束");
    });
  }
}
