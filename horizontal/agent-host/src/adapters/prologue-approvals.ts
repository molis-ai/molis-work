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

export type ProloguePendingState = "open" | "settled" | "expired" | "cancelled";

/** The slice of Prologue's pending ledger this bridge uses. */
export interface ProloguePending {
  ref: { id: string };
  kind: string;
  state: ProloguePendingState;
  /** Safe explanation prepared by Prologue. Never contains secrets. */
  why: string;
  effectRef?: { id: string };
  origin?: { session?: string; run?: string; character?: string };
  expiresAtMs: number;
}

export interface ProloguePendingPort {
  read(ref: { id: string }): Promise<ProloguePending | undefined>;
  answer(
    ref: { id: string },
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
  boardId: string;
  pluginId: string;
  now?: () => Date;
}

export interface MirrorPendingInput {
  pending: ProloguePending;
  run: AgentRunRef;
  kind: AgentReviewKind;
  document: AgentReviewDocument;
}

export class PrologueApprovalBridge {
  readonly #queue: AgentReviewQueue;
  readonly #pendings: ProloguePendingPort;
  readonly #boardId: string;
  readonly #pluginId: string;
  readonly #now: () => Date;
  readonly #pendingByReview = new Map<string, { id: string }>();

  constructor(options: PrologueApprovalBridgeOptions) {
    this.#queue = options.queue;
    this.#pendings = options.pendings;
    this.#boardId = options.boardId;
    this.#pluginId = options.pluginId;
    this.#now = options.now ?? (() => new Date());
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
    const request = this.#queue.request({
      review_id: `prologue:${input.pending.ref.id}`,
      run: { ...input.run },
      board_id: this.#boardId,
      plugin_id: this.#pluginId,
      kind: input.kind,
      document: input.document,
      requested_at: this.#now().toISOString(),
      expires_at: new Date(input.pending.expiresAtMs).toISOString(),
    });
    this.#pendingByReview.set(request.review_id, { id: input.pending.ref.id });
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
    pendingRef: { id: string };
    run: AgentRunRef;
    kind: AgentReviewKind;
    document: AgentReviewDocument;
  }): Promise<AgentReviewRequest> {
    const pending = await this.#pendings.read(input.pendingRef);
    if (!pending) {
      throw new PrologueApprovalError("agent.pending_unknown", "执行主人那边找不到这笔待批");
    }
    return this.mirror({
      pending,
      run: input.run,
      kind: input.kind,
      document: input.document,
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
      this.#queue.cancelPending(
        this.#queue.get(input.review_id)?.run.run_id ?? "",
        "执行主人已经结束了这笔待批",
      );
      throw new PrologueApprovalError(
        "agent.pending_not_open",
        "这笔待批已经结束，请刷新后按当前状态处理",
      );
    }

    const receipt = this.#queue.decide({
      review_id: input.review_id,
      decision: input.decision,
      actor_id: input.actor_id,
      ...(input.note === undefined ? {} : { note: input.note }),
    });

    if (input.decision === "reject") {
      await this.#pendings.answer(pendingRef, { kind: "effect-approval", answer: "deny" });
      return receipt;
    }

    this.#queue.consumeApproval(input.review_id);
    let authorized = false;
    let failure: string | undefined;
    try {
      ({ authorized } = await this.#pendings.answer(
        pendingRef,
        { kind: "effect-approval", answer: "allow" },
      ));
    } catch (error) {
      failure = error instanceof Error ? error.message : "执行主人拒绝了这次授权";
    }
    return this.#queue.settle(input.review_id, authorized
      ? { ok: true }
      : { ok: false, error: failure ?? "执行主人没有把这次批准记为已授权" });
  }

  /**
   * Leave a pending open without approving it. `later` is not a release: the
   * effect stays unauthorized and the user can still come back to it.
   */
  async defer(reviewId: string): Promise<void> {
    const pendingRef = this.#pendingByReview.get(reviewId);
    if (!pendingRef) {
      throw new PrologueApprovalError("agent.review_unknown", "找不到这条待审操作");
    }
    await this.#pendings.answer(pendingRef, { kind: "effect-approval", answer: "later" });
  }
}
