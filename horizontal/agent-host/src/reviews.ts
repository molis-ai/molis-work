import { agentErrors } from "./errors.js";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type {

  AgentReviewDecisionInput,
  AgentReviewDecisions,
  AgentReviewQueueApi,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewRow,
  AgentReviewStatus,
  AgentGitIndexObservation,
  AgentReviewRecoveryInput,
  AgentReviewRecoveryView,
  ReviewDecisionSource,
  ReviewDecisionRecord,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { PLUGIN_REVIEW_KINDS } from "@molis-ai/molis-work-contracts/services/agent-host";
import { clonePresentedReview } from "./review-presentation.js";
import { ReviewDeadlines } from "./review-deadlines.js";
import type { ReviewDecisionStore, StoredReviewDecision } from "./review-decisions.js";

/** The owner commits first, then uses the same caller control for its recovery projection and SDK answer. */
export interface ReviewDecisionCommit {
  (assertOwnerCurrent?: () => void): Promise<AgentReviewReceipt>;
  assertCurrent(): void;
  effect<T>(write: () => Promise<T>, assertOwnerCurrent?: () => void): Promise<T>;
}
interface DecisionBoundary { beforeEffect?(): Promise<void>; assertCurrent?(request: AgentReviewRequest): void }

/**
 * The installation that started a plugin's person-reviewed Host operation (PG-009). It must declare and hold `review:<kind>`
 * when the operation is asked for, again when a person approves it and again right before it runs: one revoked, disabled,
 * stopped or replaced since no longer does, and the operation is refused, never run.
 */
export interface ReviewAuthority {
  readonly plugin_id: string;
  readonly install_id: string;
  holds(): boolean;
}

/**
 * `origin` is the authority of the installation that asked for a plugin operation, as recorded in this process; absent for
 * anything else, including a review restored from history. Its `holds()` says whether that very activation still runs.
 */
export type ReviewSettlementListener = (request: AgentReviewRequest, receipt: AgentReviewReceipt, origin?: ReviewAuthority) => void;

const pluginOperation = (request: AgentReviewRequest): string | null =>
  request.operation && (PLUGIN_REVIEW_KINDS as readonly string[]).includes(request.operation.kind) ? request.operation.kind : null;

/** A review belongs to a real round, or to one named Host operation whose document is of that operation's kind. */
function assertOwned(request: AgentReviewRequest): void {
  const operation = request.operation;
  const manual = operation?.operation_id && (operation.kind === "checkpoint-rewind" && operation.session_id && request.kind === "rewind"
    || operation.kind === "git-index" && operation.workspace_id && request.kind === "git-index" && request.document.kind === "git-index"
    || operation.kind === "git-integration" && operation.workspace_id && request.kind === "git-integration" && request.document.kind === "git-integration"
    || operation.kind === "git-worktree" && operation.workspace_id && request.kind === "tool-operation" && request.document.kind === "tool-operation" && request.document.tool === "git-worktree-create"
    || operation.kind === "git-operation" && operation.workspace_id && request.kind === "tool-operation" && request.document.kind === "tool-operation" && /^git-(commit|branch-create|branch-switch|push|pr-create|merge|pull|resolve|merge-abort)$/.test(request.document.tool));
  if ((request.run === null) !== Boolean(operation) || operation && !manual) {
    throw agentErrors.review_unknown("审查必须属于实际轮次或明确的宿主操作");
  }
}

/**
 * The identity of a command for a standing rule: same session, same plugin, same argv, directory,
 * environment and boundary. Anything outside the Host boundary, and anything that is not a command,
 * never qualifies — a file edit's content differs every time and must be read.
 */
function standingKey(request: AgentReviewRequest): string | null {
  const document = request.document;
  if (request.kind !== "command" || document.kind !== "command" || !request.run || document.escalate !== false) return null;
  // A command that names extra paths or the network is approved for exactly that, once: it is never a standing rule.
  if (document.grants !== undefined) return null;
  // Running a command and leaving it running in the background are different approvals.
  return JSON.stringify([request.project_id, request.plugin_id, request.run.session_id, document.command, document.args,
    document.cwd, document.workspace_path ?? null, document.env_allowlist ?? null, document.timeout_ms, document.background === true, document.outlives_run === true]);
}

interface ReviewRow {
  request: AgentReviewRequest;
  receipt: AgentReviewReceipt;
}
type HistoricalDecision = Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note">;
interface DecisionClaim {
  unknown: boolean;
  cancelled: boolean;
  responding: boolean;
  restoreMissing?: () => Promise<{ request: AgentReviewRequest; decision: HistoricalDecision | null }>;
  refreshing?: Promise<void>;
}

type RecoveryObserver = (request: AgentReviewRequest) => Promise<AgentGitIndexObservation>;
interface RecoveryHandler {
  inspect(observe: () => Promise<AgentGitIndexObservation>): Promise<AgentReviewRecoveryView>;
  resolve(input: AgentReviewRecoveryInput, observe: () => Promise<AgentGitIndexObservation>): Promise<AgentReviewRecoveryView>;
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
  /** "Allow this command for this session", keyed by the exact command and its session; in memory only. */
  readonly #standing = new Map<string, Extract<ReviewDecisionSource, { kind: "policy" }>>();
  readonly #claims = new Map<string, DecisionClaim>();
  #decisionStore?: ReviewDecisionStore;
  readonly #rows = new Map<string, ReviewRow>();
  readonly #consumed = new Set<string>();
  readonly #settlements = new Set<ReviewSettlementListener>();
  readonly #listeners = new Set<(request: AgentReviewRequest) => void>();
  readonly #deciders = new Map<string, { respond: (input: AgentReviewDecisionInput, commit: ReviewDecisionCommit) => Promise<AgentReviewReceipt>; available?: () => Promise<() => boolean>; assertApprovalCurrent?: () => void; beforeApprovalEffect?: () => void | Promise<void> }>();
  readonly #refreshers = new Set<(projectId: string) => Promise<void>>();
  readonly #recoverers = new Map<string, RecoveryHandler>();
  /** Only for a plugin's operation asked for in this process; a restored one has none, so it can never be approved. */
  readonly #authorities = new Map<string, ReviewAuthority>();
  readonly #now: () => Date;
  readonly #deadlines: ReviewDeadlines;
  #closed = false;

  constructor(options: { now?: () => Date; decisions?: ReviewDecisionStore } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#decisionStore = options.decisions;
    this.#deadlines = new ReviewDeadlines(this.#now, id => {
      const row = this.#rows.get(id);
      if (row) this.#status(row);
    });
  }

  /** Bound by the one Home execution owner; a queue without durable storage cannot accept decisions. */
  bindDecisionStore(store: ReviewDecisionStore): void { this.#decisionStore = store; }

  /** Only the final Host shutdown closes a shared queue, after execution owners finish settling. */
  close(): void {
    this.#closed = true;
    this.#deadlines.close();
    for (const row of this.#rows.values()) this.cancel(row.request.review_id, "宿主已关闭，原等待已结束");
    this.#deciders.clear();
    this.#authorities.clear();
    this.#recoverers.clear();
    this.#refreshers.clear();
    this.#listeners.clear();
    this.#settlements.clear();
    this.#standing.clear();
    this.#claims.clear();
  }

  /** Query execution owners before presenting receipts; this never dispatches work. */
  registerRefresh(handler: (projectId: string) => Promise<void>): () => void {
    this.#refreshers.add(handler);
    return () => { this.#refreshers.delete(handler); };
  }

  async refresh(projectId: string): Promise<void> {
    for (const [id, claim] of this.#claims) {
      const request = this.get(id);
      if (!claim.unknown || !request || request.project_id !== projectId || !this.#decisionStore) continue;
      claim.refreshing ??= this.#refreshDecision(request, claim).finally(() => { delete claim.refreshing; });
      await claim.refreshing;
    }
    await Promise.all([...this.#refreshers].map(handler => handler(projectId)));
  }

  async #refreshDecision(request: AgentReviewRequest, claim: DecisionClaim): Promise<void> {
    try {
      const saved = await this.#decisionStore!.read(request.reference);
      if (this.#claims.get(request.review_id) !== claim) return;
      if (saved) { this.restoreRecordedDecision(saved); return; }
      const historical = await claim.restoreMissing?.();
      if (this.#claims.get(request.review_id) !== claim) return;
      if (historical) {
        if (!isDeepStrictEqual(historical.request.reference, request.reference)) throw agentErrors.review_version_changed("历史决定与原请求不一致");
        this.#projectHistoricalDecision(historical.request, historical.decision);
      }
      this.#claims.delete(request.review_id); delete this.#rows.get(request.review_id)!.receipt.decision_save_error;
    } catch { /* This row stays blocked; other original operations can still be read. */ }
  }

  /** Only a Host caller supplies current facts; Plugins receive no recovery capability. */
  registerRecoveryHandler(reviewId: string, handler: RecoveryHandler): void {
    this.#recoverers.set(reviewId, handler);
  }

  async inspectRecovery(reviewId: string, observe: RecoveryObserver): Promise<AgentReviewRecoveryView> {
    const request = this.get(reviewId), handler = this.#recoverers.get(reviewId);
    if (!request || !handler) throw agentErrors.capability_unavailable("此操作的核对入口尚不可用");
    return handler.inspect(() => observe(request));
  }

  async recover(input: AgentReviewRecoveryInput, observe: RecoveryObserver): Promise<AgentReviewRecoveryView> {
    const request = this.get(input.review_id), handler = this.#recoverers.get(input.review_id);
    if (!request || !handler) throw agentErrors.capability_unavailable("此操作的核对入口尚不可用");
    return handler.resolve(input, () => observe(request));
  }

  recordReconciliation(reviewId: string, value: NonNullable<AgentReviewReceipt["reconciliation"]>): void {
    const row = this.#rows.get(reviewId);
    if (!row || row.receipt.effect_uncertain || !row.receipt.effect_error) return;
    row.receipt.reconciliation = structuredClone(value);
  }

  /**
   * Restore only the Host decision, or a pending review when none was recorded. Runtime receipts are independently queried
   * afterwards. The installation that asked belongs to an earlier process, so a plugin's operation brought back is never approved.
   */
  restoreDecision(request: AgentReviewRequest, decision: HistoricalDecision | null): void {
    if (this.#rows.has(request.review_id)) return;
    this.#admit(request);
    this.#projectHistoricalDecision(request, decision);
  }

  #projectHistoricalDecision(request: AgentReviewRequest, decision: HistoricalDecision | null): void {
    if (decision && !["approved", "rejected", "cancelled", "expired"].includes(decision.status)) throw new Error("无效的历史审查决定");
    const row = this.#rows.get(request.review_id)!;
    row.request = clonePresentedReview(request);
    if (!decision) return;
    const { status, decided_by, decided_at, note } = decision;
    row.receipt = { ...row.receipt, status, decided_by, decided_at, note };
    this.#release(request.review_id);
    // This authority has already been handed to the execution owner. Restoring
    // it only permits receipt projection, never consuming or dispatching again.
    if (decision.status === "approved") this.#consumed.add(request.review_id);
  }

  /** Recovery projects the atomic fact even over a stale in-process cancellation; it never restores delivery authority. */
  restoreRecordedDecision(saved: StoredReviewDecision): void {
    if (!this.#rows.has(saved.request.review_id)) this.#admit(saved.request);
    this.#projectDecision(saved.record);
    const row = this.#rows.get(saved.request.review_id)!;
    row.request = clonePresentedReview(saved.request);
    if (!row.receipt.effect_settled && !row.receipt.effect_error) row.receipt.delivery_error = "决定已保存，原执行方正在核对送达与执行结果；不会自动重试";
    this.#claims.delete(saved.request.review_id);
    if (saved.record.decision === "approve") this.#consumed.add(saved.request.review_id);
  }

  /** An unreadable decision is never an undecided operation. Keep it visible and retry the original key on refresh. */
  restoreUnreadableDecision(request: AgentReviewRequest, restoreMissing?: DecisionClaim["restoreMissing"]): void {
    if (this.#rows.has(request.review_id)) return;
    this.#admit(request);
    this.#rows.get(request.review_id)!.receipt.decision_save_error = "原决定暂不可读取，请刷新核对；不会重新批准或执行";
    this.#claims.set(request.review_id, { unknown: true, cancelled: true, responding: false, restoreMissing });
  }

  /**
   * An adapter asks for permission. This never grants anything by itself. A plugin's Host operation names the installation
   * that started it, which must hold `review:<kind>` now and again when a person approves (PG-009).
   */
  request(request: AgentReviewRequest, authority?: ReviewAuthority): AgentReviewRequest {
    const kind = pluginOperation(request);
    if (kind && (!authority || authority.plugin_id !== request.plugin_id || !authority.holds())) {
      throw agentErrors.review_not_permitted(`插件 ${request.plugin_id} 没有声明或没有获得 review:${kind}，不能发起这项需要人审查的操作`);
    }
    return this.#admit(request, kind ? authority : undefined);
  }

  #admit(request: AgentReviewRequest, authority?: ReviewAuthority): AgentReviewRequest {
    if (this.#closed) throw agentErrors.capability_unavailable("审查队列已关闭");
    assertOwned(request);
    if (request.reference?.id !== request.review_id || request.reference.owner.kind !== "agent-review"
      || request.reference.owner.project_id !== request.project_id || request.reference.owner.plugin_id !== request.plugin_id
      || !request.reference.owner.install_id || !request.reference.version
      || authority && request.reference.owner.install_id !== authority.install_id) throw agentErrors.review_unknown("审查缺少原执行归属或固定版本");
    const existing = this.#rows.get(request.review_id);
    if (existing) {
      if (!isDeepStrictEqual(existing.request, request)) {
        throw agentErrors.review_already_decided("审查引用已绑定另一份内容，不能替换用户看到的操作");
      }
      return structuredClone(existing.request);
    }
    const stored = clonePresentedReview(request);
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
    if (authority) this.#authorities.set(stored.review_id, authority);
    this.#deadlines.add(stored.review_id, stored.expires_at);
    for (const listener of this.#listeners) listener(structuredClone(stored));
    return structuredClone(stored);
  }

  /** Host-only dispatch to the execution owner; never exposed as a Plugin capability. */
  registerDecisionHandler(reviewId: string, handler: (input: AgentReviewDecisionInput, commit: ReviewDecisionCommit) => Promise<AgentReviewReceipt>, available?: () => Promise<() => boolean>, assertApprovalCurrent?: () => void, beforeApprovalEffect?: () => void | Promise<void>): void {
    const row = this.#pending(reviewId);
    if (this.#deciders.has(reviewId)) throw agentErrors.review_already_decided("审查已有执行所有者，不能替换");
    this.#deciders.set(reviewId, { respond: handler, available, assertApprovalCurrent, beforeApprovalEffect });
    // An exact repeat of a command a person allowed for this session goes through the same decision path,
    // attributed to that person and marked as coming from their rule. If it cannot, it simply stays pending.
    const key = standingKey(row.request), rule = key ? this.#standing.get(key) : undefined;
    if (!rule || this.#status(row) !== "pending") return;
    queueMicrotask(() => {
      if (this.#status(row) !== "pending") return;
      void this.#respond({ review_id: reviewId, version: row.request.reference.version, decision: "approve", actor_id: rule.set_by,
        note: `按本会话规则批准：同一命令已由 ${rule.set_by} 于 ${rule.set_at} 允许本会话内不再询问` }, rule)
        .catch(() => { /* A failed or uncertain save never grants execution. */ });
    });
  }

  respond(input: AgentReviewDecisionInput, boundary?: DecisionBoundary): Promise<AgentReviewReceipt> {
    return this.#respond(input, { kind: "person", actor_id: input.actor_id }, boundary);
  }

  /** The original handler owns settlement until it returns; refresh must not race its final receipt. */
  isDeciding(reviewId: string): boolean { return this.#claims.get(reviewId)?.responding === true; }

  async #respond(input: AgentReviewDecisionInput, source: ReviewDecisionSource, boundary?: DecisionBoundary): Promise<AgentReviewReceipt> {
    const row = this.#pending(input.review_id), request = row.request, store = this.#decisionStore;
    if (input.version !== request.reference.version) throw agentErrors.review_version_changed("审查版本已变化，请查看当前提案后再决定");
    if (!store) throw agentErrors.capability_unavailable("决定存储尚未就绪，不能批准或拒绝");
    if (this.#claims.has(input.review_id)) throw agentErrors.review_decision_pending("原决定正在保存或等待核对，不能再次决定");
    const handler = this.#deciders.get(input.review_id);
    if (!handler) throw agentErrors.capability_unavailable("执行方未接通或已中断，不能只在页面记录一次假批准");
    const decision = (await this.decisions(input.review_id))[input.decision];
    if (!decision.available) {
      const refuse = agentErrors[decision.code.slice("agent.".length) as keyof typeof agentErrors];
      throw refuse("原操作目前不能接受这项决定，请刷新后按当前状态处理", { review_decision: decision });
    }
    const key = input.remember === "session" ? standingKey(request) : null;
    if (input.remember === "session" && (!key || input.decision !== "approve")) {
      throw agentErrors.capability_unavailable("只有在宿主执行边界内的命令可以设为本会话内不再询问");
    }
    if (source.kind !== "person" && input.remember) throw agentErrors.review_not_permitted("只有本人的明确决定可以新增记住规则");
    await boundary?.beforeEffect?.();
    const answerable = await handler.available?.();
    this.#pending(input.review_id);
    if (this.#claims.has(input.review_id)) throw agentErrors.review_decision_pending("另一项决定已经开始保存");
    const claim = { unknown: false, cancelled: false, responding: true }; this.#claims.set(input.review_id, claim);
    let committed = false;
    const assertCurrent = () => {
      requireSynchronous(boundary?.assertCurrent?.(request));
      if (claim.cancelled) throw agentErrors.pending_not_open("原操作在决定保存期间被取消，决定不会送达");
      if (this.#closed || request.expires_at !== null && Date.parse(request.expires_at) <= this.#now().getTime()) throw agentErrors.review_expired("原审查已经结束或过期");
      if (input.decision === "approve") requireSynchronous(handler.assertApprovalCurrent?.());
      if (input.decision === "approve" && pluginOperation(request) && !this.#authorities.get(input.review_id)?.holds()) throw agentErrors.review_not_permitted("原安装的执行授权已结束");
    };
    const control = { beforeEffect: async () => { await boundary?.beforeEffect?.(); if (input.decision === "approve") await handler.beforeApprovalEffect?.(); }, assertCurrent };
    const commit: ReviewDecisionCommit = Object.assign(async (assertOwnerCurrent?: () => void) => {
      if (committed) throw agentErrors.review_already_decided("本次决定已经保存");
      const saved = await store.save({ reference: request.reference, decision: input.decision, actor_id: input.actor_id,
        decided_at: this.#now().toISOString(), note: input.note ?? null, source }, request, { ...control, assertCurrent: () => {
          assertCurrent(); requireSynchronous(assertOwnerCurrent?.()); this.#pending(input.review_id);
          if (this.#claims.get(input.review_id) !== claim || this.#deciders.get(input.review_id) !== handler || answerable && !answerable()) throw agentErrors.pending_not_open("原执行等待已经结束");
        } });
      if (saved.state === "not-saved") throw saved.error;
      if (saved.state === "unknown") {
        claim.unknown = true; row.receipt.decision_save_error = "决定保存待核对，不能再次批准或拒绝";
        throw agentErrors.review_decision_pending(row.receipt.decision_save_error);
      }
      if (saved.state === "conflict") {
        if (!isDeepStrictEqual(saved.record.reference, request.reference)) {
          claim.unknown = true; row.receipt.decision_save_error = "原操作的已存决定属于另一份提案，需核对原记录";
          throw agentErrors.review_version_changed(row.receipt.decision_save_error);
        }
        this.restoreRecordedDecision(saved); throw agentErrors.review_already_decided("原操作已有保存的决定，不会重复送达");
      }
      committed = true;
      this.#projectDecision(saved.record);
      try { assertCurrent(); }
      catch (error) { this.deliveryFailed(input.review_id, "决定已保存，送达情况待核对"); throw error; }
      return this.receipt(input.review_id)!;
    }, { assertCurrent, effect: <T>(write: () => Promise<T>, assertOwnerCurrent?: () => void) => store.withControl({ ...control,
      assertCurrent: () => { assertCurrent(); requireSynchronous(assertOwnerCurrent?.()); },
    }, write) });
    try {
      const receipt = await handler.respond(input, commit);
      if (key && committed && !receipt.delivery_error && !receipt.effect_error) this.#standing.set(key, {
        kind: "policy", owner: "agent.session-rule", id: randomUUID(), revision: 1, set_by: input.actor_id, set_at: row.receipt.decided_at!,
      });
      return receipt;
    } catch (error) {
      if (committed) this.#consumed.add(input.review_id);
      throw error;
    } finally { claim.responding = false; if (!claim.unknown && this.#claims.get(input.review_id) === claim) this.#claims.delete(input.review_id); }
  }

  deliveryFailed(reviewId: string, message: string): AgentReviewReceipt {
    const row = this.#rows.get(reviewId);
    if (!row) throw agentErrors.review_unknown("找不到这条待审操作");
    if (!row.receipt.effect_settled && row.receipt.effect_error === null) row.receipt.delivery_error = message;
    return structuredClone(row.receipt);
  }

  rememberFailed(reviewId: string, message: string): void {
    const row = this.#rows.get(reviewId);
    if (row) row.receipt.remember_error = message;
  }

  /** Only an owner observing the original pending/dispatch may confirm that a saved decision is closed. */
  confirmDecisionClosed(reviewId: string): void {
    const row = this.#rows.get(reviewId);
    if (row) { delete row.receipt.delivery_error; delete row.receipt.effect_uncertain; }
  }

  /** One stale pending must not withdraw unrelated operations in the same run. */
  cancel(reviewId: string, reason: string): void {
    const row = this.#rows.get(reviewId);
    if (!row || this.#status(row) !== "pending") return;
    const claim = this.#claims.get(reviewId); if (claim) claim.cancelled = true;
    row.receipt = { ...row.receipt, status: "cancelled", decided_at: this.#now().toISOString(), note: reason };
    this.#release(reviewId);
  }

  list(projectId: string, status?: AgentReviewStatus): AgentReviewRequest[] {
    return [...this.#rows.values()]
      .filter((row) => row.request.project_id === projectId
        && (status === undefined || this.#status(row) === status))
      .map((row) => clonePresentedReview(row.request))
      .sort((left, right) => left.requested_at.localeCompare(right.requested_at));
  }

  get(reviewId: string): AgentReviewRequest | null {
    const row = this.#rows.get(reviewId);
    return row ? clonePresentedReview(row.request) : null;
  }

  #projectDecision(record: ReviewDecisionRecord): void {
    const row = this.#rows.get(record.reference.id);
    if (!row || !isDeepStrictEqual(row.request.reference, record.reference)) throw agentErrors.review_version_changed("已保存的决定属于另一份提案，不能用于本次执行");
    row.receipt = {
      ...row.receipt,
      status: record.decision === "approve" ? "approved" : "rejected",
      decided_by: record.actor_id, decided_at: record.decided_at, note: record.note, source: structuredClone(record.source),
      ...(record.source.kind === "policy" && record.source.owner === "agent.session-rule" ? { standing_rule: { set_by: record.source.set_by, set_at: record.source.set_at } } : {}),
    };
    delete row.receipt.decision_save_error;
    this.#release(record.reference.id, record.decision === "approve");
  }

  receipt(reviewId: string): AgentReviewReceipt | null {
    const row = this.#rows.get(reviewId);
    if (!row) return null;
    return structuredClone({ ...row.receipt, status: this.#status(row) });
  }

  async decisions(reviewId: string): Promise<AgentReviewDecisions> {
    return (await this.#decisionProjection(reviewId))();
  }

  /** Reuse owner reads, then project all rows together against current queue, handler and installation facts. */
  async readMany(reviewIds: readonly string[]): Promise<AgentReviewRow[]> {
    const projections = await Promise.all(reviewIds.map(id => this.#decisionProjection(id)));
    return reviewIds.flatMap((id, index) => {
      const request = this.get(id);
      return request ? [{ request, decisions: projections[index]!(), receipt: this.receipt(id) ?? undefined }] : [];
    });
  }

  async #decisionProjection(reviewId: string): Promise<() => AgentReviewDecisions> {
    const unavailable = (code: string, key: string): AgentReviewDecisions => {
      const decision = { available: false as const, code, reason: { owner: "workbench", key } };
      return { approve: decision, reject: decision };
    };
    const row = this.#rows.get(reviewId);
    if (!row) return () => unavailable("agent.review_unknown", "workbench.agent-review.review-missing");
    const ended = () => unavailable(this.#status(row) === "expired" ? "agent.review_expired" : "agent.review_already_decided", "workbench.agent-review.cannot-decide");
    const handler = this.#deciders.get(reviewId);
    let answerable = () => true, readable = true;
    if (this.#status(row) === "pending" && handler?.available) {
      try { answerable = await handler.available(); } catch { readable = false; }
    }
    return () => {
      if (this.#status(row) !== "pending") return ended();
      if (this.#claims.has(reviewId)) return unavailable("agent.review_decision_pending", "workbench.agent-review.decision-saving");
      if (!handler || this.#deciders.get(reviewId) !== handler) return unavailable("agent.capability_unavailable", "workbench.agent-review.no-owner");
      if (!readable) return unavailable("agent.capability_unavailable", "workbench.agent-review.owner-unreadable");
      let current: boolean;
      try { current = answerable(); } catch { return unavailable("agent.capability_unavailable", "workbench.agent-review.owner-unreadable"); }
      if (this.#status(row) !== "pending") return ended();
      if (!current) return unavailable("agent.pending_not_open", "workbench.agent-review.no-waiter");
      const allowed = { available: true as const };
      try { requireSynchronous(handler.assertApprovalCurrent?.()); }
      catch { return { reject: allowed, approve: { available: false, code: "agent.review_not_permitted", reason: { owner: "workbench", key: "workbench.agent-review.authority-ended" } } }; }
      return { reject: allowed, approve: pluginOperation(row.request) && !this.#authorities.get(reviewId)?.holds()
        ? { available: false, code: "agent.review_not_permitted", reason: { owner: "workbench", key: "workbench.agent-review.authority-ended" } } : allowed };
    };
  }

  observe(listener: (request: AgentReviewRequest) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** UI invalidation after an execution owner records a new outcome; never replays history. */
  observeSettlement(listener: ReviewSettlementListener): () => void {
    this.#settlements.add(listener);
    return () => { this.#settlements.delete(listener); };
  }

  #notifySettlement(row: ReviewRow): void {
    for (const listener of this.#settlements) {
      try { listener(structuredClone(row.request), structuredClone(row.receipt), this.#authorities.get(row.request.review_id)); }
      catch { /* A projection failure cannot turn a committed Effect into an execution failure. */ }
    }
  }

  /**
   * One-time authority to perform exactly the approved effect. Calling it twice
   * fails: a replayed approval must never authorize a second write.
   */
  consumeApproval(reviewId: string): AgentReviewRequest {
    const row = this.#rows.get(reviewId);
    if (!row) {
      throw agentErrors.review_unknown("找不到这条待审操作");
    }
    if (this.#status(row) !== "approved" || this.#consumed.has(reviewId)) {
      throw agentErrors.review_not_approved("这条操作没有可用的批准；未经批准不得执行");
    }
    this.#consumed.add(reviewId);
    return structuredClone(row.request);
  }

  /** Record what really happened after an approved effect ran. */
  settle(reviewId: string, outcome: { ok: boolean; error?: string }, options?: { restored?: boolean }): AgentReviewReceipt {
    return this.#settle(reviewId, outcome, !options?.restored);
  }

  /** The execution owner verified cancellation AND a not-dispatched receipt; no workspace change was possible. */
  settleNotDispatched(reviewId: string, error: string): AgentReviewReceipt {
    if (this.#rows.get(reviewId)?.receipt.status === "approved") this.#consumed.add(reviewId);
    return this.#settle(reviewId, { ok: false, error }, false);
  }

  #settle(reviewId: string, outcome: { ok: boolean; error?: string }, notify: boolean): AgentReviewReceipt {
    const row = this.#rows.get(reviewId);
    if (!row) {
      throw agentErrors.review_unknown("找不到这条待审操作");
    }
    if (!this.#consumed.has(reviewId)) {
      throw agentErrors.review_not_approved("没有消费过批准的操作不能记录执行结果");
    }
    const effectError = outcome.ok ? null : outcome.error ?? "执行失败";
    if (row.receipt.effect_settled || row.receipt.effect_error !== null) {
      if (row.receipt.effect_settled !== outcome.ok || row.receipt.effect_error !== effectError) {
        throw agentErrors.review_already_decided("实际执行回执已经落定，不能用另一结果覆盖");
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
    try { if (notify) this.#notifySettlement(row); }
    finally { this.#release(reviewId); }
    return structuredClone(row.receipt);
  }

  uncertain(reviewId: string, reason: string, options?: { restored?: boolean }): void {
    const row = this.#rows.get(reviewId);
    if (!row || row.receipt.effect_settled || row.receipt.effect_error !== null) return;
    if (row.receipt.effect_uncertain === reason) return;
    row.receipt.effect_uncertain = reason;
    if (!options?.restored) this.#notifySettlement(row);
  }

  /** Withdraw everything still pending for one run, e.g. when the user stops it. */
  cancelPending(runId: string, reason = "已取消"): number {
    let cancelled = 0;
    for (const row of this.#rows.values()) {
      if (row.request.run?.run_id !== runId || this.#status(row) !== "pending") continue;
      this.cancel(row.request.review_id, reason);
      cancelled += 1;
    }
    return cancelled;
  }

  #status(row: ReviewRow): AgentReviewStatus {
    if (row.receipt.status !== "pending") return row.receipt.status;
    const expires = row.request.expires_at;
    if (expires !== null && Date.parse(expires) <= this.#now().getTime()) {
      const claim = this.#claims.get(row.request.review_id); if (claim) claim.cancelled = true;
      row.receipt.status = "expired";
      this.#release(row.request.review_id);
    }
    return row.receipt.status;
  }

  #pending(reviewId: string): ReviewRow {
    const row = this.#rows.get(reviewId);
    if (!row) throw agentErrors.review_unknown("找不到这条待审操作");
    const status = this.#status(row);
    if (status === "expired") throw agentErrors.review_expired("这条待审操作已过期，请重新发起");
    if (status !== "pending") throw agentErrors.review_already_decided("这条待审操作已经有结论了");
    return row;
  }

  #release(reviewId: string, awaitingEffect = false): void {
    this.#deadlines.delete(reviewId);
    this.#deciders.delete(reviewId);
    if (!awaitingEffect) this.#authorities.delete(reviewId);
  }
}
