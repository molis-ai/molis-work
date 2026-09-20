import { isDeepStrictEqual } from "node:util";
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
      | "agent.review_not_approved"
      | "agent.capability_unavailable">,
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
  readonly #deciders = new Map<string, (input: AgentReviewDecisionInput) => Promise<AgentReviewReceipt>>();
  readonly #refreshers = new Set<(boardId: string) => Promise<void>>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  /** Query execution owners before presenting receipts; this never dispatches work. */
  registerRefresh(handler: (boardId: string) => Promise<void>): () => void {
    this.#refreshers.add(handler);
    return () => { this.#refreshers.delete(handler); };
  }

  async refresh(boardId: string): Promise<void> {
    await Promise.all([...this.#refreshers].map(handler => handler(boardId)));
  }

  /** Restore only the Host decision. Runtime receipts are independently queried afterwards. */
  restoreDecision(request: AgentReviewRequest, decision: Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note">): void {
    if (decision.status !== "approved" && decision.status !== "rejected") throw new Error("无效的历史审查决定");
    if (this.#rows.has(request.review_id)) return;
    this.request(request);
    const row = this.#rows.get(request.review_id)!;
    row.receipt = { ...row.receipt, ...structuredClone(decision) };
    // This authority has already been handed to the execution owner. Restoring
    // it only permits receipt projection, never consuming or dispatching again.
    if (decision.status === "approved") this.#consumed.add(request.review_id);
  }

  /** An adapter asks for permission. This never grants anything by itself. */
  request(request: AgentReviewRequest): AgentReviewRequest {
    if ((request.run === null) !== Boolean(request.operation) || request.operation &&
        (!request.operation.operation_id || !request.operation.session_id || request.operation.kind !== "checkpoint-rewind" || request.kind !== "rewind")) {
      throw new AgentReviewError("agent.review_unknown", "审查必须属于实际轮次或明确的手动回退操作");
    }
    const existing = this.#rows.get(request.review_id);
    if (existing) {
      if (!isDeepStrictEqual(existing.request, request)) {
        throw new AgentReviewError("agent.review_already_decided", "审查引用已绑定另一份内容，不能替换用户看到的操作");
      }
      return structuredClone(existing.request);
    }
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

  /** Host-only dispatch to the execution owner; never exposed as a Plugin capability. */
  registerDecisionHandler(reviewId: string, handler: (input: AgentReviewDecisionInput) => Promise<AgentReviewReceipt>): void {
    if (!this.#rows.has(reviewId)) throw new AgentReviewError("agent.review_unknown", "找不到这条待审操作");
    if (this.#deciders.has(reviewId)) throw new AgentReviewError("agent.review_already_decided", "审查已有执行所有者，不能替换");
    this.#deciders.set(reviewId, handler);
  }

  async respond(input: AgentReviewDecisionInput): Promise<AgentReviewReceipt> {
    const handler = this.#deciders.get(input.review_id);
    if (!handler) throw new AgentReviewError("agent.capability_unavailable", "执行方未接通或已中断，不能只在页面记录一次假批准");
    return handler(input);
  }

  deliveryFailed(reviewId: string, message: string): AgentReviewReceipt {
    const row = this.#rows.get(reviewId);
    if (!row) throw new AgentReviewError("agent.review_unknown", "找不到这条待审操作");
    row.receipt.delivery_error = message;
    return structuredClone(row.receipt);
  }

  /** One stale pending must not withdraw unrelated operations in the same run. */
  cancel(reviewId: string, reason: string): void {
    const row = this.#rows.get(reviewId);
    if (!row || this.#status(row) !== "pending") return;
    row.receipt = { ...row.receipt, status: "cancelled", decided_at: this.#now().toISOString(), note: reason };
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
    const effectError = outcome.ok ? null : outcome.error ?? "执行失败";
    if (row.receipt.effect_settled || row.receipt.effect_error !== null) {
      if (row.receipt.effect_settled !== outcome.ok || row.receipt.effect_error !== effectError) {
        throw new AgentReviewError("agent.review_already_decided", "实际执行回执已经落定，不能用另一结果覆盖");
      }
      return structuredClone(row.receipt);
    }
    delete row.receipt.delivery_error;
    delete row.receipt.effect_uncertain;
    row.receipt = {
      ...row.receipt,
      effect_settled: outcome.ok,
      effect_error: effectError,
    };
    return structuredClone(row.receipt);
  }

  uncertain(reviewId: string, reason: string): void {
    const row = this.#rows.get(reviewId);
    if (!row || row.receipt.effect_settled || row.receipt.effect_error !== null) return;
    row.receipt.effect_uncertain = reason;
  }

  /** Withdraw everything still pending for one run, e.g. when the user stops it. */
  cancelPending(runId: string, reason = "已取消"): number {
    let cancelled = 0;
    for (const row of this.#rows.values()) {
      if (row.request.run?.run_id !== runId || this.#status(row) !== "pending") continue;
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
