import type {
  AgentHostErrorCode,
  AgentReviewDecisionInput,
  AgentReviewQueueApi,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewStatus,
} from "@molis-ai/molis-work-contracts/services/agent-host";

export class AgentReviewError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.review_unknown"
      | "agent.review_already_decided"
      | "agent.review_expired"
      | "agent.review_not_approved">,
    message: string,
  ) {
    super(message);
    this.name = "AgentReviewError";
  }
}

interface ReviewRow {
  request: AgentReviewRequest;
  receipt: AgentReviewReceipt;
}

/**
 * Host-owned approval queue.
 *
 * Only a recorded decision releases an effect: an adapter asks, the user
 * decides here, and the adapter may act only after `consumeApproval` hands it
 * the one-time authority. A rejected, expired or already-consumed review can
 * never be turned into permission by asking a second way.
 */
export class AgentReviewQueue implements AgentReviewQueueApi {
  readonly #rows = new Map<string, ReviewRow>();
  readonly #consumed = new Set<string>();
  readonly #listeners = new Set<(request: AgentReviewRequest) => void>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  /** An adapter asks for permission. This never grants anything by itself. */
  request(request: AgentReviewRequest): AgentReviewRequest {
    const stored = structuredClone(request);
    this.#rows.set(stored.review_id, {
      request: stored,
      receipt: {
        review_id: stored.review_id,
        status: "pending",
        decided_by: null,
        decided_at: null,
        note: null,
        effect_settled: false,
        effect_error: null,
      },
    });
    for (const listener of this.#listeners) listener(structuredClone(stored));
    return structuredClone(stored);
  }

  list(boardId: string, status?: AgentReviewStatus): AgentReviewRequest[] {
    return [...this.#rows.values()]
      .filter((row) => row.request.board_id === boardId
        && (status === undefined || this.#status(row) === status))
      .map((row) => structuredClone(row.request))
      .sort((left, right) => left.requested_at.localeCompare(right.requested_at));
  }

  get(reviewId: string): AgentReviewRequest | null {
    const row = this.#rows.get(reviewId);
    return row ? structuredClone(row.request) : null;
  }

  decide(input: AgentReviewDecisionInput): AgentReviewReceipt {
    const row = this.#rows.get(input.review_id);
    if (!row) {
      throw new AgentReviewError("agent.review_unknown", "找不到这条待审操作");
    }
    const current = this.#status(row);
    if (current === "expired") {
      throw new AgentReviewError("agent.review_expired", "这条待审操作已过期，请重新发起");
    }
    if (current !== "pending") {
      throw new AgentReviewError("agent.review_already_decided", "这条待审操作已经有结论了");
    }
    row.receipt = {
      ...row.receipt,
      status: input.decision === "approve" ? "approved" : "rejected",
      decided_by: input.actor_id,
      decided_at: this.#now().toISOString(),
      note: input.note ?? null,
    };
    return structuredClone(row.receipt);
  }

  receipt(reviewId: string): AgentReviewReceipt | null {
    const row = this.#rows.get(reviewId);
    if (!row) return null;
    return structuredClone({ ...row.receipt, status: this.#status(row) });
  }

  observe(listener: (request: AgentReviewRequest) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * One-time authority to perform exactly the approved effect. Calling it twice
   * fails: a replayed approval must never authorize a second write.
   */
  consumeApproval(reviewId: string): AgentReviewRequest {
    const row = this.#rows.get(reviewId);
    if (!row) {
      throw new AgentReviewError("agent.review_unknown", "找不到这条待审操作");
    }
    if (this.#status(row) !== "approved" || this.#consumed.has(reviewId)) {
      throw new AgentReviewError(
        "agent.review_not_approved",
        "这条操作没有可用的批准；未经批准不得执行",
      );
    }
    this.#consumed.add(reviewId);
    return structuredClone(row.request);
  }

  /** Record what really happened after an approved effect ran. */
  settle(reviewId: string, outcome: { ok: boolean; error?: string }): AgentReviewReceipt {
    const row = this.#rows.get(reviewId);
    if (!row) {
      throw new AgentReviewError("agent.review_unknown", "找不到这条待审操作");
    }
    if (!this.#consumed.has(reviewId)) {
      throw new AgentReviewError(
        "agent.review_not_approved",
        "没有消费过批准的操作不能记录执行结果",
      );
    }
    row.receipt = {
      ...row.receipt,
      effect_settled: outcome.ok,
      effect_error: outcome.ok ? null : outcome.error ?? "执行失败",
    };
    return structuredClone(row.receipt);
  }

  /** Withdraw everything still pending for one run, e.g. when the user stops it. */
  cancelPending(runId: string, reason = "已取消"): number {
    let cancelled = 0;
    for (const row of this.#rows.values()) {
      if (row.request.run.run_id !== runId || this.#status(row) !== "pending") continue;
      row.receipt = {
        ...row.receipt,
        status: "cancelled",
        decided_at: this.#now().toISOString(),
        note: reason,
      };
      cancelled += 1;
    }
    return cancelled;
  }

  #status(row: ReviewRow): AgentReviewStatus {
    if (row.receipt.status !== "pending") return row.receipt.status;
    const expires = row.request.expires_at;
    if (expires !== null && Date.parse(expires) <= this.#now().getTime()) return "expired";
    return "pending";
  }
}
