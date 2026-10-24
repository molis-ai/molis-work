import { agentErrors } from "./errors.js";
import { isDeepStrictEqual } from "node:util";
import type {

  AgentReviewDecisionInput,
  AgentReviewQueueApi,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewStatus,
  AgentGitIndexObservation,
  AgentReviewRecoveryInput,
  AgentReviewRecoveryView,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { PLUGIN_REVIEW_KINDS } from "@molis-ai/molis-work-contracts/services/agent-host";

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

type ReviewSession = { project_id: string; plugin_id: string; session_id: string };
const belongsToSession = (request: AgentReviewRequest, owner: ReviewSession) => request.project_id === owner.project_id
  && request.plugin_id === owner.plugin_id && (request.run?.session_id ?? request.operation?.session_id) === owner.session_id;

/** Admit one immutable review document; repeated references cannot replace what the person saw. */
function admitReview(rows: Map<string, ReviewRow>, listeners: ReadonlySet<(request: AgentReviewRequest) => void>, request: AgentReviewRequest): AgentReviewRequest {
  assertOwned(request);
  const existing = rows.get(request.review_id);
  if (existing) {
    if (!isDeepStrictEqual(existing.request, request)) throw agentErrors.review_already_decided("审查引用已绑定另一份内容，不能替换用户看到的操作");
    return structuredClone(existing.request);
  }
  const stored = structuredClone(request);
  rows.set(stored.review_id, { request: stored,
    receipt: { review_id: stored.review_id, status: "pending", decided_by: null, decided_at: null, note: null, effect_settled: false, effect_error: null } });
  for (const listener of listeners) listener(structuredClone(stored));
  return structuredClone(stored);
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
  readonly #standing = new Map<string, { set_by: string; set_at: string }>();
  readonly #automatic = new Map<string, { set_by: string; set_at: string }>();
  readonly #rows = new Map<string, ReviewRow>();
  readonly #consumed = new Set<string>();
  readonly #settlements = new Set<ReviewSettlementListener>();
  readonly #listeners = new Set<(request: AgentReviewRequest) => void>();
  readonly #deciders = new Map<string, (input: AgentReviewDecisionInput) => Promise<AgentReviewReceipt>>();
  readonly #refreshers = new Set<(projectId: string) => Promise<void>>();
  readonly #recoverers = new Map<string, RecoveryHandler>();
  /** Only for a plugin's operation asked for in this process; a restored one has none, so it can never be approved. */
  readonly #authorities = new Map<string, ReviewAuthority>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  /** Query execution owners before presenting receipts; this never dispatches work. */
  registerRefresh(handler: (projectId: string) => Promise<void>): () => void {
    this.#refreshers.add(handler);
    return () => { this.#refreshers.delete(handler); };
  }

  async refresh(projectId: string): Promise<void> {
    await Promise.all([...this.#refreshers].map(handler => handler(projectId)));
  }

  registerRecoveryHandler(reviewId: string, handler: RecoveryHandler): void {
    if (!this.#rows.has(reviewId)) throw agentErrors.review_unknown("找不到这条待审操作");
    this.#recoverers.set(reviewId, handler);
  }

  async inspectRecovery(reviewId: string, observe: RecoveryObserver): Promise<AgentReviewRecoveryView> {
    const request = this.get(reviewId), handler = this.#recoverers.get(reviewId);
    if (!request || !handler) throw agentErrors.capability_unavailable("此操作的核对入口尚不可用");
    const result = await handler.inspect(() => observe(request));
    if (this.#recoverers.get(reviewId) !== handler) throw agentErrors.review_unknown("原审查已释放，不能发布旧恢复结果");
    return result;
  }

  async recover(input: AgentReviewRecoveryInput, observe: RecoveryObserver): Promise<AgentReviewRecoveryView> {
    const request = this.get(input.review_id), handler = this.#recoverers.get(input.review_id);
    if (!request || !handler) throw agentErrors.capability_unavailable("此操作的核对入口尚不可用");
    const result = await handler.resolve(input, () => observe(request));
    if (this.#recoverers.get(input.review_id) !== handler) throw agentErrors.review_unknown("原审查已释放，不能发布旧恢复结果");
    return result;
  }

  /** Host lifecycle already proved quiescence and fenced publishers. Never use for an unresolved execution. */
  forgetSession(owner: ReviewSession): string[] {
    const ids = [...this.#rows].filter(([, row]) => belongsToSession(row.request, owner)).map(([id]) => id);
    for (const id of ids) {
      const key = standingKey(this.#rows.get(id)!.request); if (key) this.#standing.delete(key);
      this.#rows.delete(id); this.#automatic.delete(id); this.#consumed.delete(id);
      this.#deciders.delete(id); this.#recoverers.delete(id); this.#authorities.delete(id);
    }
    return ids;
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
  restoreDecision(request: AgentReviewRequest, decision: Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note"> | null): void {
    if (decision && !["approved", "rejected", "cancelled", "expired"].includes(decision.status)) throw new Error("无效的历史审查决定");
    if (this.#rows.has(request.review_id)) return;
    admitReview(this.#rows, this.#listeners, request);
    if (!decision) return;
    const row = this.#rows.get(request.review_id)!;
    row.receipt = { ...row.receipt, ...structuredClone(decision) };
    // This authority has already been handed to the execution owner. Restoring
    // it only permits receipt projection, never consuming or dispatching again.
    if (decision.status === "approved") this.#consumed.add(request.review_id);
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
    const created = !this.#rows.has(request.review_id), stored = admitReview(this.#rows, this.#listeners, request);
    if (kind && created) this.#authorities.set(request.review_id, authority!);
    return stored;
  }

  /** Host-only dispatch to the execution owner; never exposed as a Plugin capability. */
  registerDecisionHandler(reviewId: string, handler: (input: AgentReviewDecisionInput) => Promise<AgentReviewReceipt>): void {
    const row = this.#rows.get(reviewId);
    if (!row) throw agentErrors.review_unknown("找不到这条待审操作");
    if (this.#deciders.has(reviewId)) throw agentErrors.review_already_decided("审查已有执行所有者，不能替换");
    this.#deciders.set(reviewId, handler);
    // An exact repeat of a command a person allowed for this session goes through the same decision path,
    // attributed to that person and marked as coming from their rule. If it cannot, it simply stays pending.
    const key = standingKey(row.request), rule = key ? this.#standing.get(key) : undefined;
    if (!rule || this.#status(row) !== "pending") return;
    queueMicrotask(() => {
      if (this.#rows.get(reviewId) !== row || this.#status(row) !== "pending") return;
      this.#automatic.set(reviewId, rule);
      void this.respond({ review_id: reviewId, decision: "approve", actor_id: rule.set_by,
        note: `按本会话规则批准：同一命令已由 ${rule.set_by} 于 ${rule.set_at} 允许本会话内不再询问` })
        .catch(() => { /* left pending for a person to decide */ })
        .finally(() => this.#automatic.delete(reviewId));
    });
  }

  async respond(input: AgentReviewDecisionInput): Promise<AgentReviewReceipt> {
    const handler = this.#deciders.get(input.review_id);
    if (!handler) throw agentErrors.capability_unavailable("执行方未接通或已中断，不能只在页面记录一次假批准");
    const row = this.#rows.get(input.review_id);
    const key = input.remember === "session" && row ? standingKey(row.request) : null;
    if (input.remember === "session" && (!key || input.decision !== "approve")) {
      throw agentErrors.capability_unavailable("只有在宿主执行边界内的命令可以设为本会话内不再询问");
    }
    const receipt = await handler(input);
    if (this.#rows.get(input.review_id) !== row) throw agentErrors.review_unknown("原审查已释放，不能恢复会话批准");
    if (key && row && this.#status(row) === "approved") this.#standing.set(key, { set_by: input.actor_id, set_at: row.receipt.decided_at ?? this.#now().toISOString() });
    return key && row ? structuredClone({ ...receipt, ...this.receipt(input.review_id) }) : receipt;
  }

  deliveryFailed(reviewId: string, message: string): AgentReviewReceipt {
    const row = this.#rows.get(reviewId);
    if (!row) throw agentErrors.review_unknown("找不到这条待审操作");
    row.receipt.delivery_error = message;
    return structuredClone(row.receipt);
  }

  /** One stale pending must not withdraw unrelated operations in the same run. */
  cancel(reviewId: string, reason: string): void {
    const row = this.#rows.get(reviewId);
    if (!row || this.#status(row) !== "pending") return;
    row.receipt = { ...row.receipt, status: "cancelled", decided_at: this.#now().toISOString(), note: reason };
  }

  list(projectId: string, status?: AgentReviewStatus): AgentReviewRequest[] {
    return [...this.#rows.values()]
      .filter((row) => row.request.project_id === projectId
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
      throw agentErrors.review_unknown("找不到这条待审操作");
    }
    const current = this.#status(row);
    if (current === "expired") {
      throw agentErrors.review_expired("这条待审操作已过期，请重新发起");
    }
    if (current !== "pending") {
      throw agentErrors.review_already_decided("这条待审操作已经有结论了");
    }
    // Rejecting is always the person's to do; approving needs the installation that asked to still hold its kind.
    const kind = input.decision === "approve" ? pluginOperation(row.request) : null;
    if (kind && !this.#authorities.get(input.review_id)?.holds()) {
      throw agentErrors.review_not_permitted(`发起这项操作的插件已不再持有 review:${kind}（撤权、停用、停止、升级或应用重启过），不能批准，只能拒绝`);
    }
    const automatic = input.decision === "approve" ? this.#automatic.get(input.review_id) : undefined;
    row.receipt = {
      ...row.receipt,
      status: input.decision === "approve" ? "approved" : "rejected",
      decided_by: input.actor_id,
      decided_at: this.#now().toISOString(),
      note: input.note ?? null,
      ...(automatic ? { standing_rule: { ...automatic } } : {}),
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
    if (!options?.restored) this.#notifySettlement(row);
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
