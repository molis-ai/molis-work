import type {
  AgentReviewDocument,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewStatus,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The Host's review surface: where a user decides whether an Agent's side
 * effect may happen.
 *
 * Deciding lives here and nowhere else. It is deliberately not a Capability —
 * exposing it to Plugins would let a Plugin approve its own effect — so this
 * surface is the one place the decision exists.
 */

export interface AgentReviewPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  formatDate(value: string): string;
}

export interface AgentReviewRow {
  request: AgentReviewRequest;
  /** Absent while the item is still pending. */
  receipt?: AgentReviewReceipt;
}

export interface AgentReviewSurfaceModel {
  readonly rows: readonly AgentReviewRow[];
  readonly primitives: AgentReviewPrimitives;
}

/**
 * What a row is really in, once the receipt is taken into account.
 *
 * `approved` and `done` are different states and the surface must not merge
 * them: an approval is permission for something to happen, not the thing
 * happening. A row stays `approved` until the Runtime returns a real receipt.
 */
export type AgentReviewPhase =
  | "pending"
  | "approved"
  | "done"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

export function reviewPhase(row: AgentReviewRow): AgentReviewPhase {
  const status: AgentReviewStatus = row.receipt?.status ?? "pending";
  if (status !== "approved") return status;
  if (row.receipt?.effect_error !== null && row.receipt?.effect_error !== undefined) return "failed";
  return row.receipt?.effect_settled === true ? "done" : "approved";
}

/** Only a pending item can still be decided. Everything else is settled history. */
export function isDecidable(row: AgentReviewRow): boolean {
  return reviewPhase(row) === "pending";
}

const PHASE_MARK: Record<AgentReviewPhase, { icon: string; tone: string; label: string }> = {
  pending: { icon: "alert-circle", tone: "attention", label: "等你决定" },
  approved: { icon: "clock", tone: "progress", label: "已批准，尚未发生" },
  done: { icon: "check", tone: "done", label: "已完成" },
  failed: { icon: "alert-triangle", tone: "blocked", label: "已批准，但执行失败" },
  rejected: { icon: "x", tone: "blocked", label: "已拒绝" },
  cancelled: { icon: "slash", tone: "idle", label: "已撤回" },
  expired: { icon: "clock", tone: "idle", label: "已过期" },
};

export function renderAgentReviewSurface(model: AgentReviewSurfaceModel): string {
  const { primitives: p } = model;
  if (model.rows.length === 0) {
    return `<section class="agent-review" data-agent-review>
      <div class="mw-empty" data-agent-review-empty>${p.icon("check")}<p>${p.escape("没有待决定的操作")}</p></div>
    </section>`;
  }
  return `<section class="agent-review" data-agent-review>
    ${model.rows.map((row) => renderRow(row, p)).join("")}
  </section>`;
}

function renderRow(row: AgentReviewRow, p: AgentReviewPrimitives): string {
  const phase = reviewPhase(row);
  const mark = PHASE_MARK[phase];
  const decidable = isDecidable(row);
  return `<article class="agent-review-row" data-agent-review-item="${p.escape(row.request.review_id)}" data-agent-review-phase="${phase}">
    <header class="agent-review-head">
      <span class="mw-status" data-tone="${mark.tone}">${p.icon(mark.icon)}${p.escape(mark.label)}</span>
      <span class="agent-review-plugin">${p.escape(row.request.plugin_id)}</span>
      <time>${p.escape(p.formatDate(row.request.requested_at))}</time>
    </header>
    ${renderDocument(row.request.document, p)}
    ${renderFooter(row, decidable, p)}
  </article>`;
}

function renderFooter(row: AgentReviewRow, decidable: boolean, p: AgentReviewPrimitives): string {
  if (decidable) {
    const reviewId = p.escape(row.request.review_id);
    return `<footer class="agent-review-actions">
      <button type="button" data-agent-review-reject="${reviewId}">${p.escape("拒绝")}</button>
      <button type="button" data-agent-review-approve="${reviewId}">${p.escape("批准这一次")}</button>
    </footer>`;
  }
  // A settled item offers no action: a decision already consumed cannot be
  // re-granted from another entry point.
  const note = row.receipt?.note;
  const error = row.receipt?.effect_error;
  return `<footer class="agent-review-settled">
    ${row.receipt?.decided_by === null || row.receipt?.decided_by === undefined
      ? ""
      : `<span>${p.escape(row.receipt.decided_by)}</span>`}
    ${note === null || note === undefined ? "" : `<p>${p.escape(note)}</p>`}
    ${error === null || error === undefined ? "" : `<p class="agent-review-error">${p.escape(error)}</p>`}
  </footer>`;
}

function renderDocument(document: AgentReviewDocument, p: AgentReviewPrimitives): string {
  switch (document.kind) {
    case "text-edit":
      return `<div class="agent-review-doc" data-agent-review-kind="text-edit">
        <p class="agent-review-target">${p.escape(document.target_path)}${document.exists ? "" : ` · ${p.escape("新建文件")}`}</p>
        <pre class="agent-review-after">${p.escape(document.after_text)}</pre>
      </div>`;
    case "command":
      return `<div class="agent-review-doc" data-agent-review-kind="command">
        <pre class="agent-review-command">${p.escape((document as { command: string }).command)}</pre>
      </div>`;
    default:
      // An unknown document kind is shown as its kind, never silently dropped:
      // a user must not approve something the surface refused to describe.
      return `<div class="agent-review-doc" data-agent-review-kind="${p.escape(document.kind)}">
        <p>${p.escape(`这个操作类型（${document.kind}）暂时无法展开，批准前请先确认`)}</p>
      </div>`;
  }
}
