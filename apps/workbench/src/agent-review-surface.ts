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

export const AGENT_REVIEW_STYLES = `
.agent-review { min-width:0; padding:12px; border-top:1px solid var(--line); }
.agent-review-row { min-width:0; margin-bottom:20px; font-size:12px; line-height:1.6; }
.agent-review-head { display:flex; flex-wrap:wrap; gap:4px 10px; color:var(--muted); }
.agent-review-head svg { width:14px; height:14px; }
.agent-review-row > details > summary { cursor:pointer; }
.agent-review-row > details > summary .agent-review-head { display:inline-flex; vertical-align:top; }
.agent-review-plugin { display:none; }
.agent-review-doc { margin:10px 0; overflow-wrap:anywhere; }
.agent-review-doc pre { max-height:360px; overflow:auto; white-space:pre; padding:8px; background:var(--rail); border-radius:var(--radius-control); font-size:12px; }
.agent-review-target { color:var(--ink); }
.agent-review-actions { display:flex; justify-content:flex-end; gap:8px; }
.agent-review-error { color:var(--ink); border-left:2px solid var(--muted); padding-left:8px; }
`;

/**
 * What a row is really in, once the receipt is taken into account.
 *
 * `approved` and `done` are different states and the surface must not merge
 * them: an approval is permission for something to happen, not the thing
 * happening. A row stays `approved` until the Runtime returns a real receipt.
 */
export type AgentReviewPhase =
  | "reconcile"
  | "pending"
  | "approved"
  | "done"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

export function reviewPhase(row: AgentReviewRow): AgentReviewPhase {
  if (row.receipt?.effect_uncertain) return "reconcile";
  const status: AgentReviewStatus = row.receipt?.status ?? "pending";
  if (status !== "approved") return status;
  if (row.receipt?.effect_error !== null && row.receipt?.effect_error !== undefined) return "failed";
  return row.receipt?.effect_settled === true ? "done" : "approved";
}

/** Only a pending item can still be decided. Everything else is settled history. */
export function isDecidable(row: AgentReviewRow): boolean {
  return reviewPhase(row) === "pending" && readable(row.request.document);
}

function readable(document: AgentReviewDocument): boolean {
  switch (document.kind) {
    case "text-edit": return typeof document.target_path === "string" && typeof document.after_text === "string"
      && (document.exists ? typeof document.before_text === "string" : document.before_text === null);
    case "command": return typeof document.command === "string" && Array.isArray(document.args)
      && document.args.every(arg => typeof arg === "string") && typeof document.cwd === "string" && Number.isFinite(document.timeout_ms)
      && (document.env_allowlist === undefined || Array.isArray(document.env_allowlist) && document.env_allowlist.every(name => typeof name === "string"))
      && (document.escalate === undefined || typeof document.escalate === "boolean");
    case "tool-operation": return typeof document.summary === "string" && Array.isArray(document.fields);
    case "mcp": return typeof document.server === "string" && typeof document.tool === "string" && typeof document.arguments_json === "string";
    case "rewind": return typeof document.checkpoint_id === "string" && Array.isArray(document.files) && document.files.length > 0
      && document.files.every(file => typeof file.path === "string" && (file.before_text === null || typeof file.before_text === "string")
        && (file.after_text === null || typeof file.after_text === "string")
        && (file.change === "create" ? file.before_text === null && typeof file.after_text === "string"
          : file.change === "delete" ? typeof file.before_text === "string" && file.after_text === null
          : file.change === "restore" && typeof file.before_text === "string" && typeof file.after_text === "string"));
    default: return false;
  }
}

const PHASE_MARK: Record<AgentReviewPhase, { icon: string; tone: string; label: string }> = {
  reconcile: { icon: "alert-triangle", tone: "blocked", label: "结果待核对，不能重复执行" },
  pending: { icon: "alert-circle", tone: "attention", label: "等你决定" },
  approved: { icon: "clock", tone: "progress", label: "已批准，执行结果待确认" },
  done: { icon: "check", tone: "done", label: "已完成" },
  failed: { icon: "alert-triangle", tone: "blocked", label: "已批准，但执行未完成" },
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
    ${[...model.rows].sort((a, b) => reviewPriority(a) - reviewPriority(b) || b.request.requested_at.localeCompare(a.request.requested_at)).map((row) => renderRow(row, p)).join("")}
  </section>`;
}

function reviewPriority(row: AgentReviewRow): number {
  return ["pending", "approved", "reconcile"].includes(reviewPhase(row)) ? 0 : reviewPhase(row) === "failed" ? 1 : 2;
}

function renderRow(row: AgentReviewRow, p: AgentReviewPrimitives): string {
  const phase = reviewPhase(row);
  const mark = phase === "done" && row.request.kind === "command"
    ? { ...PHASE_MARK.done, label: "已执行，检查结果见命令回执" } : PHASE_MARK[phase];
  const decidable = isDecidable(row);
  const history = ["done", "rejected", "cancelled", "expired"].includes(phase);
  const label = row.request.document.kind === "text-edit" ? row.request.document.target_path
    : row.request.document.kind === "rewind" ? "文件回退" : row.request.kind === "command" ? "命令执行" : "工具操作";
  return `<article class="agent-review-row" data-agent-review-item="${p.escape(row.request.review_id)}" data-agent-review-phase="${phase}">
    ${history ? '<details data-review-detail="history"><summary>' : ""}<header class="agent-review-head">
      <span class="mw-status" data-tone="${mark.tone}">${p.icon(mark.icon)}${p.escape(mark.label)}</span>
      <span>${p.escape(label)}</span><span class="agent-review-plugin">${p.escape(row.request.plugin_id)}</span>
      <time>${p.escape(p.formatDate(row.request.requested_at))}</time>
    </header>${history ? "</summary>" : ""}
    ${renderDocument(row.request.document, p)}
    ${renderFooter(row, decidable, p)}${history ? "</details>" : ""}
  </article>`;
}

function renderFooter(row: AgentReviewRow, decidable: boolean, p: AgentReviewPrimitives): string {
  if (decidable) {
    const reviewId = p.escape(row.request.review_id);
    return `<footer class="agent-review-actions">
      <button class="mw-btn" type="button" data-agent-review-reject="${reviewId}">${p.escape("拒绝")}</button>
      <button class="mw-btn mw-btn--primary" type="button" data-agent-review-approve="${reviewId}">${p.escape("批准这一次")}</button>
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
    ${row.receipt?.effect_uncertain ? `<p class="agent-review-error">${p.escape(row.receipt.effect_uncertain)}</p>` : ""}
    ${row.receipt?.delivery_error ? `<p class="agent-review-error">${p.escape("决定已记录，但执行方尚未确认收到：" + row.receipt.delivery_error)}</p>` : ""}
  </footer>`;
}

function renderDocument(document: AgentReviewDocument, p: AgentReviewPrimitives): string {
  if (!readable(document)) return `<div class="agent-review-doc" data-agent-review-kind="${p.escape(document.kind)}"><p>${p.escape("审查内容不完整，暂不能批准；原操作仍需核对。")}</p></div>`;
  switch (document.kind) {
    case "text-edit":
      return `<div class="agent-review-doc" data-agent-review-kind="text-edit">
        <p class="agent-review-target">${p.escape(document.target_path)}${document.exists ? "" : ` · ${p.escape("新建文件")}`}</p>
        <details class="agent-review-before" data-review-detail="before"><summary>${p.escape("修改前")}</summary><pre>${p.escape(document.before_text ?? "文件尚不存在")}</pre></details>
        <p>${p.escape("修改后")}</p>
        <pre class="agent-review-after">${p.escape(document.after_text)}</pre>
      </div>`;
    case "command":
      return `<div class="agent-review-doc" data-agent-review-kind="command">
        <p>${p.escape("程序")}</p><pre class="agent-review-command">${p.escape(document.command)}</pre>
        <p>${p.escape("参数（逐项）")}</p><pre>${p.escape(JSON.stringify(document.args, null, 2))}</pre>
        <p>${p.escape("工作目录：" + document.cwd)}</p><p>${p.escape("超时：" + document.timeout_ms + " ms")}</p>
        <p>${p.escape("继承的环境变量名称：" + (document.env_allowlist?.join(", ") ?? "运行时未提供"))}</p>
        <p>${p.escape(document.escalate === undefined ? "执行范围：运行时未提供" : document.escalate ? "请求在沙箱外执行；批准仅适用于这一次操作" : "按本轮宿主执行边界运行")}</p>
      </div>`;
    case "tool-operation": return `<div class="agent-review-doc" data-agent-review-kind="tool-operation"><p>${p.escape(document.tool)}</p><p>${p.escape(document.summary)}</p><dl>${document.fields.map(field => `<dt>${p.escape(field.label)}</dt><dd>${p.escape(field.value)}</dd>`).join("")}</dl></div>`;
    case "mcp": return `<div class="agent-review-doc" data-agent-review-kind="mcp"><p>${p.escape(document.server + " · " + document.tool)}</p><pre>${p.escape(document.arguments_json)}</pre></div>`;
    case "rewind": return `<div class="agent-review-doc" data-agent-review-kind="rewind">
      <p>${p.escape("回到检查点记录的修改前 · " + document.checkpoint_id)}</p>
      <p>只回退所列文件，不撤销命令、网络或 MCP 操作；对话记录会保留。</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)} · ${{create:"重新创建",delete:"删除",restore:"恢复内容"}[file.change]}</p>
        <details data-review-detail="${p.escape("before:" + file.path)}"><summary>当前内容</summary><pre>${p.escape(file.before_text === null ? "文件不存在" : file.before_text === "" ? "（空文件）" : file.before_text)}</pre></details>
        <p>回退后</p><pre>${p.escape(file.after_text === null ? "文件将不存在" : file.after_text === "" ? "（空文件）" : file.after_text)}</pre></section>`).join("")}</div>`;
    default:
      // An unknown document kind is shown as its kind, never silently dropped:
      // a user must not approve something the surface refused to describe.
      return "";
  }
}
