import type {
  AgentHostErrorCode,
  AgentReviewDocument,
  AgentReviewKind,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentRunRef,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { AgentReviewQueue } from "../reviews.js";

/**
 * Bridges Prologue's pending effect approvals to the Host Review queue.
 *
 * Prologue stops and waits; the user decides in the Host's own review surface;
 * only then does this bridge answer Prologue. Nothing else may release an
 * effect, and the answer Prologue gives back — not our own record — decides
 * whether the effect was really authorized.
 */

export interface ProloguePendingRef { kind: "pending"; id: string; revision: number }

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
  /** An open persisted pending without a live SDK waiter cannot resume execution. */
  canAnswer(ref: ProloguePendingRef): Promise<boolean>;
  answer(
    ref: ProloguePendingRef,
    answer: { kind: "effect-approval"; answer: "allow" | "deny" | "later" },
  ): Promise<{ authorized: boolean }>;
}

export class PrologueApprovalError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.pending_unknown"
      | "agent.pending_not_open"
      | "agent.review_unknown">,
    message: string,
  ) {
    super(message);
    this.name = "PrologueApprovalError";
  }
}

export interface PrologueApprovalBridgeOptions {
  queue: AgentReviewQueue;
  pendings: ProloguePendingPort;
  now?: () => Date;
  /** Persist the Host's decision before waking SDK execution; not an effect receipt. */
  recordDecision?(pending: ProloguePending, receipt: AgentReviewReceipt): Promise<void>;
}

export interface MirrorPendingInput {
  pending: ProloguePending;
  owner: { board_id: string; plugin_id: string };
  run: AgentRunRef;
  kind: AgentReviewKind;
  document: AgentReviewDocument;
}

export class PrologueApprovalBridge {
  readonly #queue: AgentReviewQueue;
  readonly #pendings: ProloguePendingPort;
  readonly #now: () => Date;
  readonly #recordDecision: PrologueApprovalBridgeOptions["recordDecision"];
  readonly #pendingByReview = new Map<string, ProloguePendingRef>();
  readonly #answered = new Set<(run: AgentRunRef, pendingId: string) => void>();

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
  }

  /**
   * Put one Prologue pending in front of the user. The document comes from the
   * execution layer, which is the only place that knows what the effect is.
   */
  mirror(input: MirrorPendingInput): AgentReviewRequest {
    if (input.pending.state !== "open") {
      throw new PrologueApprovalError(
        "agent.pending_not_open",
        "这笔待批已经结束，不能再放到审查面上",
      );
    }
    if (input.pending.kind !== "effect-approval" || input.pending.origin?.session !== input.run.session_id
      || input.pending.origin?.run !== input.run.run_id || !input.owner.board_id || !input.owner.plugin_id) {
      throw new PrologueApprovalError("agent.pending_unknown", "待批来源与执行归属不一致，不能替用户批准");
    }
    const reviewId = `prologue:${input.pending.ref.id}`;
    const previousRef = this.#pendingByReview.get(reviewId);
    if (previousRef && (previousRef.kind !== input.pending.ref.kind || previousRef.revision !== input.pending.ref.revision)) {
      throw new PrologueApprovalError("agent.pending_unknown", "同一审查不能换成另一版本的待批引用");
    }
    const request = this.#queue.request({
      review_id: reviewId,
      run: { ...input.run },
      board_id: input.owner.board_id,
      plugin_id: input.owner.plugin_id,
      kind: input.kind,
      document: input.document,
      requested_at: this.#queue.get(reviewId)?.requested_at ?? this.#now().toISOString(),
      expires_at: new Date(input.pending.expiresAtWallMs).toISOString(),
    });
    if (!this.#pendingByReview.has(request.review_id)) {
      this.#queue.registerDecisionHandler(request.review_id, decision => this.decide(decision));
      this.#pendingByReview.set(request.review_id, { ...input.pending.ref });
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
    const pending = await this.#pendings.read(input.pendingRef);
    if (!pending) {
      throw new PrologueApprovalError("agent.pending_unknown", "执行主人那边找不到这笔待批");
    }
    const document = await this.#pendings.document(pending);
    return this.mirror({
      pending,
      owner: input.owner,
      run: input.run,
      kind: document.kind,
      document,
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
  async decide(input: {
    review_id: string;
    decision: "approve" | "reject";
    actor_id: string;
    note?: string;
  }): Promise<AgentReviewReceipt> {
    const pendingRef = this.#pendingByReview.get(input.review_id);
    if (!pendingRef) {
      throw new PrologueApprovalError("agent.review_unknown", "找不到这条待审操作");
    }
    const pending = await this.#pendings.read(pendingRef);
    if (!pending) {
      throw new PrologueApprovalError("agent.pending_unknown", "执行主人那边找不到这笔待批");
    }
    if (pending.state !== "open") {
      // The execution owner already closed it. Our queue must not pretend the
      // user can still decide, and must not invent an approval.
      this.#queue.cancel(input.review_id, "执行主人已经结束了这笔待批");
      throw new PrologueApprovalError(
        "agent.pending_not_open",
        "这笔待批已经结束，请刷新后按当前状态处理",
      );
    }

    const request = this.#queue.get(input.review_id);
    if (!request || !request.run || pending.ref.kind !== pendingRef.kind || pending.ref.revision !== pendingRef.revision || pending.ref.id !== pendingRef.id
      || pending.kind !== "effect-approval" || pending.origin?.session !== request?.run.session_id || pending.origin?.run !== request?.run.run_id) {
      throw new PrologueApprovalError("agent.pending_unknown", "执行方返回的待批与原审查不一致");
    }
    if (!await this.#pendings.canAnswer(pendingRef)) {
      this.#queue.cancel(input.review_id, "执行已中断，原待批没有活动等待方；需核对后继续");
      throw new PrologueApprovalError("agent.pending_not_open", "原执行已中断，不能通过批准旧待批恢复它");
    }
    const receipt = this.#queue.decide({
      review_id: input.review_id,
      decision: input.decision,
      actor_id: input.actor_id,
      ...(input.note === undefined ? {} : { note: input.note }),
    });

    try {
      await this.#recordDecision?.(pending, receipt);
      if (input.decision === "approve") this.#queue.consumeApproval(input.review_id);
      const result = await this.#pendings.answer(pendingRef, {
        kind: "effect-approval", answer: input.decision === "approve" ? "allow" : "deny",
      });
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
    const pendingRef = this.#pendingByReview.get(reviewId);
    if (!pendingRef) {
      throw new PrologueApprovalError("agent.review_unknown", "找不到这条待审操作");
    }
    const pending = await this.#pendings.read(pendingRef);
    if (!pending || pending.state !== "open") throw new PrologueApprovalError("agent.pending_not_open", "这笔待批已结束");
  }
}
