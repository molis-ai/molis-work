import type {
  AgentReviewDocument,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewStatus,
  AgentReviewRecoveryView,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { compareTexts, textDiffRow, type TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

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
.agent-review-row { min-width:0; margin-bottom:14px; font-size:12px; line-height:1.6; }
.agent-review-row[data-agent-review-phase=pending] { padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--paper, #fff); box-shadow:0 1px 2px rgb(0 0 0 / .04); }
.agent-review-head { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; color:var(--muted); }
.agent-review-head svg { width:14px; height:14px; }
.agent-review-row:has(> details) { margin-bottom:2px; }
.agent-review-row > details > summary { display:flex; align-items:center; gap:6px; min-height:30px; margin:0 -6px; padding:3px 6px; border-radius:6px; list-style:none; cursor:pointer; }
.agent-review-row > details > summary::-webkit-details-marker { display:none; }
.agent-review-row > details > summary::before { content:""; flex:none; width:5px; height:5px; margin:0 3px 0 1px; border-right:1.5px solid var(--faint, var(--muted)); border-bottom:1.5px solid var(--faint, var(--muted)); transform:rotate(-45deg); transition:transform .15s ease; }
.agent-review-row > details[open] > summary::before { transform:rotate(45deg); }
.agent-review-row > details > summary:hover { background:var(--nav-hover, var(--rail)); }
.agent-review-row > details > summary .agent-review-head { flex:1 1 auto; min-width:0; flex-wrap:nowrap; }
.agent-review-row > details > summary .agent-review-head .mw-status,.agent-review-row > details > summary .agent-review-head time { flex:none; }
.agent-review-row > details[open] { padding-bottom:8px; }
.agent-review-plugin { display:none; }
.agent-review-title { min-width:0; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.agent-review-title--code { font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.agent-review-head time { margin-left:auto; font-size:11px; }
.agent-review-doc { margin:10px 0; overflow-wrap:anywhere; }
.agent-review-doc pre { max-height:360px; overflow:auto; white-space:pre; padding:8px; background:var(--rail); border-radius:var(--radius-control); font-size:12px; }
.agent-review-doc details { margin-top:6px; }
.agent-review-doc details > summary { cursor:pointer; color:var(--muted); font-size:12px; }
.agent-review-doc dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:2px 12px; margin:6px 0 0; }
.agent-review-doc dt { color:var(--muted); }
.agent-review-doc dd { margin:0; }
.agent-review-fields dd { white-space:pre-wrap; max-height:220px; overflow:auto; }
.agent-review-target { color:var(--ink); }
.agent-review-meta { color:var(--muted); margin:4px 0 0; }
.agent-review-command { white-space:pre-wrap !important; word-break:break-word; font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); color:var(--ink); }
.agent-review-prompt { color:var(--muted); user-select:none; }
.agent-review-file { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin:0; font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.agent-review-tag { font-family:inherit; font-size:11px; padding:0 6px; border-radius:999px; background:var(--rail); color:var(--muted); }
.agent-review-count[data-added] { color:var(--green, #1a7f37); }
.agent-review-count[data-removed] { color:var(--red, #cf222e); }
.agent-review-diff-wrap { margin-top:8px; max-height:420px; overflow:auto; border:1px solid var(--line); border-radius:8px; }
.agent-review-diff { width:100%; border-collapse:collapse; font:12px/1.55 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.agent-review-diff td { padding:0 8px; vertical-align:top; white-space:pre; }
.agent-review-ln { width:1%; min-width:28px; text-align:right; color:var(--muted); user-select:none; opacity:.7; }
.agent-review-code { width:100%; }
.agent-review-sign { display:inline-block; width:1.2em; color:var(--muted); user-select:none; }
.agent-review-diff tr[data-diff=insert] { background:color-mix(in srgb, var(--green, #1a7f37) 11%, transparent); }
.agent-review-diff tr[data-diff=delete] { background:color-mix(in srgb, var(--red, #cf222e) 10%, transparent); }
.agent-review-diff tr[data-diff=insert] .agent-review-sign { color:var(--green, #1a7f37); }
.agent-review-diff tr[data-diff=delete] .agent-review-sign { color:var(--red, #cf222e); }
.agent-review-gap td { color:var(--muted); background:var(--rail); text-align:center; font-family:inherit; padding:2px 8px; }
.agent-review-actions { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; }
.agent-review-actions [data-agent-review-approve]:focus::after { content:"↵"; margin-left:6px; font-size:11px; opacity:.72; }
.agent-review-remember { display:inline-flex; align-items:center; gap:6px; margin-right:auto; color:var(--muted); font-size:12px; cursor:pointer; }
.agent-review-remember input { margin:0; }
.agent-review-rule { color:var(--muted); }
.agent-review-feedback { margin-block:10px; }
.agent-review-feedback .mw-field__label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
/* Optional feedback stays one line until someone starts writing, so approve stays within reach. */
.agent-review-feedback textarea { min-height:36px; height:36px; resize:none; transition:height .16s ease; }
.agent-review-feedback textarea:focus,.agent-review-feedback textarea:not(:placeholder-shown) { height:84px; resize:vertical; }
.agent-review-feedback .mw-field__hint { display:none; }
.agent-review-feedback:focus-within .mw-field__hint,.agent-review-feedback:has(textarea:not(:placeholder-shown)) .mw-field__hint { display:block; }
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
    case "git-integration": return typeof document.source?.directory === "string" && typeof document.target_directory === "string"
      && typeof document.source?.base_commit === "string" && readable({ kind: "git-index", action: "stage", workspace_name: document.target_directory, files: document.files });
    case "git-index": return ["stage", "unstage"].includes(document.action) && typeof document.workspace_name === "string"
      && Array.isArray(document.files) && document.files.length > 0 && document.files.every(file => typeof file.path === "string"
        && (file.before_text === null ? file.before_mode === null : typeof file.before_text === "string" && ["100644", "100755"].includes(file.before_mode ?? ""))
        && (file.after_text === null ? file.after_mode === null : typeof file.after_text === "string" && ["100644", "100755"].includes(file.after_mode ?? "")));
    case "text-edit": return typeof document.target_path === "string" && typeof document.after_text === "string"
      && (document.workspace_path === undefined || typeof document.workspace_path === "string")
      && (document.exists ? typeof document.before_text === "string" : document.before_text === null);
    case "command": return typeof document.command === "string" && Array.isArray(document.args)
      && (document.workspace_path === undefined || typeof document.workspace_path === "string")
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
  reconcile: { icon: "alert", tone: "blocked", label: "结果待核对，不能重复执行" },
  pending: { icon: "circle-alert", tone: "attention", label: "等你决定" },
  approved: { icon: "clock", tone: "progress", label: "已批准，执行结果待确认" },
  done: { icon: "check", tone: "done", label: "已完成" },
  failed: { icon: "alert", tone: "blocked", label: "已批准，但执行未完成" },
  rejected: { icon: "x", tone: "blocked", label: "已拒绝" },
  cancelled: { icon: "blocked", tone: "idle", label: "已撤回" },
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
    ? { ...PHASE_MARK.done, label: "已执行" }
    : phase === "failed" && row.receipt?.reconciliation ? { ...PHASE_MARK.failed, label: "已核对：原操作未发生" } : PHASE_MARK[phase];
  const decidable = isDecidable(row);
  const history = ["done", "rejected", "cancelled", "expired"].includes(phase);
  const document = row.request.document;
  // The heading names the thing itself, so a history list reads without opening every row.
  const label = document.kind === "text-edit" ? document.target_path
    : document.kind === "command" && readable(document) ? [document.command, ...document.args].map(shellWord).join(" ")
    : document.kind === "git-index" ? (document.action === "stage" ? "暂存文件" : "取消暂存")
    : document.kind === "git-integration" ? "整合子任务成果"
    : document.kind === "rewind" ? "文件回退" : row.request.kind === "command" ? "命令执行"
    : document.kind === "tool-operation" && document.tool === "dispatch-subagent" ? "派出子任务" + (document.fields.find(field => field.label === "子任务角色") ? "：" + document.fields.find(field => field.label === "子任务角色")!.value : "")
    : document.kind === "tool-operation" && document.tool === "steer-subagent" ? "给子任务补充要求" : "工具操作";
  const labelClass = document.kind === "command" || document.kind === "text-edit" ? "agent-review-title agent-review-title--code" : "agent-review-title";
  return `<article class="agent-review-row" data-agent-review-item="${p.escape(row.request.review_id)}" data-agent-review-phase="${phase}">
    ${history ? '<details data-review-detail="history"><summary>' : ""}<header class="agent-review-head">
      <span class="mw-status" data-tone="${mark.tone}">${p.icon(mark.icon)}${p.escape(mark.label)}</span>
      <span class="${labelClass}">${p.escape(label)}</span><span class="agent-review-plugin">${p.escape(row.request.plugin_id)}</span>
      <time>${p.escape(p.formatDate(row.request.requested_at))}</time>
    </header>${history ? "</summary>" : ""}
    ${renderDocument(row.request.document, p)}
    ${renderFooter(row, decidable, p)}${history ? "</details>" : ""}
  </article>`;
}

function renderFooter(row: AgentReviewRow, decidable: boolean, p: AgentReviewPrimitives): string {
  if (decidable) {
    const reviewId = p.escape(row.request.review_id);
    return `${row.request.run && row.request.document.kind === "text-edit" && row.request.plugin_id === "io.molis.work.coding" ? `<label class="mw-field agent-review-feedback"><span class="mw-field__label">修改意见（可选）</span><textarea class="mw-textarea" data-slot="textarea" data-agent-review-feedback aria-label="修改意见（可选）" maxlength="2000" rows="1" placeholder="要改哪里？写下意见后点拒绝，交回给 Agent…"></textarea><span class="mw-field__hint">填写后随拒绝交给原任务；新提案仍需重新审查。</span></label>` : ""}<footer class="agent-review-actions">
      ${row.request.document.kind === "command" && row.request.document.escalate === false && row.request.run ? `<label class="agent-review-remember"><input type="checkbox" data-agent-review-remember>${p.escape("本会话内同样的命令不再询问")}</label>` : ""}
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
    ${row.receipt?.standing_rule ? `<p class="agent-review-rule">${p.escape(`按本会话规则批准 · ${row.receipt.standing_rule.set_by} 设定于 ${p.formatDate(row.receipt.standing_rule.set_at)}`)}</p>` : note === null || note === undefined ? "" : `<p>${p.escape(note)}</p>`}
    ${error === null || error === undefined ? "" : `<p class="agent-review-error">${p.escape(error)}</p>`}
    ${row.receipt?.effect_uncertain ? `<p class="agent-review-error">${p.escape(row.receipt.effect_uncertain)}</p>` : ""}
    ${row.receipt?.effect_uncertain && row.request.kind === "git-index" ? `<button class="mw-btn" type="button" data-agent-review-inspect="${p.escape(row.request.review_id)}">核对暂存区与回执</button><div data-review-recovery></div>` : ""}
    ${row.receipt?.reconciliation && !row.receipt.effect_uncertain ? `<p>${p.escape(row.receipt.reconciliation.actor_id)} · ${p.escape(p.formatDate(row.receipt.reconciliation.at))}</p><p>${p.escape("核对依据：" + row.receipt.reconciliation.reason)}</p>` : ""}
    ${row.receipt?.delivery_error ? `<p class="agent-review-error">${p.escape("决定已记录，但执行方尚未确认收到：" + row.receipt.delivery_error)}</p>` : ""}
  </footer>`;
}

export function renderAgentReviewRecovery(view: AgentReviewRecoveryView, escape: (value: string) => string): string {
  const observation = view.observation;
  return `<section class="agent-review-doc" aria-label="原操作结果核对" data-review-recovery-view data-review-revision="${escape(observation?.revision ?? "")}">
    <p role="status">${escape(view.message)}</p>
    ${observation ? `<p>${escape("当前暂存区读取于 " + observation.observed_at)}</p>${observation.files.map(file => `<details data-review-detail="${escape("recovery:" + file.path)}"><summary>${escape(file.path)} · ${escape(file.mode ?? "不存在")}</summary><pre>${escape(file.text === null ? "暂存区中不存在" : file.text || "（空文件）")}</pre></details>`).join("")}` : ""}
    <button class="mw-btn" type="button" data-review-recheck>重新核对回执与内容</button>
    ${view.receipt.effect_uncertain ? `<p>重新核对不会执行原操作。只有可靠依据确认未发生，才能解除这笔操作的阻塞；内容一致本身不是证明。</p>
      <label class="mw-field"><span class="mw-field__label">确认未发生的依据</span><textarea class="mw-textarea" data-slot="textarea" data-review-recovery-reason aria-label="确认未发生的依据" maxlength="2000" rows="3" ${view.can_confirm_not_happened ? "" : "disabled"}></textarea></label>
      <label class="mw-check-row"><input class="mw-check" type="checkbox" data-review-recovery-confirm ${view.can_confirm_not_happened ? "" : "disabled"}>我已核对原操作未发生，且并非执行后被其他操作改回</label>
      <button class="mw-btn" type="button" data-review-confirm-not ${view.can_confirm_not_happened ? "" : "disabled"}>按未发生收口</button>` : ""}
    <p data-review-recovery-error role="alert"></p>
  </section>`;
}

function renderDocument(document: AgentReviewDocument, p: AgentReviewPrimitives): string {
  if (!readable(document)) return `<div class="agent-review-doc" data-agent-review-kind="${p.escape(document.kind)}"><p>${p.escape("审查内容不完整，暂不能批准；原操作仍需核对。")}</p></div>`;
  switch (document.kind) {
    case "git-integration": return `<div class="agent-review-doc" data-agent-review-kind="git-integration">
      <p>整合选定成果到主工作区</p><dl><dt>来源目录</dt><dd>${p.escape(document.source.directory)}</dd><dt>目标目录</dt><dd>${p.escape(document.target_directory)}</dd><dt>来源分支与基线</dt><dd>${p.escape(document.source.branch)} · ${p.escape(document.source.base_commit)}</dd></dl>
      <p>仅修改以下文件；不暂存、不提交、不推送，保留子工作树。批准后重新核对来源与目标，变化或冲突时拒绝执行。</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)}</p><p>文件模式：${p.escape(file.before_mode ?? "不存在")} → ${p.escape(file.after_mode ?? "不存在")}</p>
      <details data-review-detail="${p.escape("before:" + file.path)}"><summary>主工作区修改前</summary><pre>${p.escape(file.before_text ?? "文件尚不存在")}</pre></details>
      <p>整合后的内容</p><pre>${p.escape(file.after_text === null ? "删除此文件" : file.after_text || "（空文件）")}</pre></section>`).join("")}</div>`;
    case "git-index": return `<div class="agent-review-doc" data-agent-review-kind="git-index">
      <p>${p.escape(document.workspace_name)} · ${document.action === "stage" ? "将以下固定内容放入暂存区" : "将以下暂存项恢复为 HEAD 版本"}</p><p>只更新暂存区，磁盘文件保持原样。批准后会重新核对预览版本；内容、分支或暂存区变化时拒绝执行。</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)}</p>
        <p>文件模式：${p.escape(file.before_mode ?? "不存在")} → ${p.escape(file.after_mode ?? "不存在")}</p>
        <details data-review-detail="${p.escape("before:" + file.path)}"><summary>审查时的暂存内容</summary><pre>${p.escape(file.before_text ?? "暂存区中不存在")}</pre></details>
        <p>操作后的暂存内容</p><pre>${p.escape(file.after_text === null ? "从暂存区移除，磁盘文件保留" : file.after_text || "（空文件）")}</pre></section>`).join("")}</div>`;
    case "text-edit": {
      const diff = renderTextDiff(document.before_text, document.after_text, p);
      return `<div class="agent-review-doc" data-agent-review-kind="text-edit">
        <p class="agent-review-file"><span class="agent-review-target">${p.escape(document.target_path)}</span>${document.exists ? "" : `<span class="agent-review-tag">${p.escape("新建文件")}</span>`}<span class="agent-review-count" data-added>+${diff.added}</span><span class="agent-review-count" data-removed>−${diff.removed}</span></p>
        ${document.workspace_path ? `<p class="agent-review-meta">${p.escape(document.workspace_path)}</p>` : ""}
        ${diff.html}
        <details class="agent-review-before" data-review-detail="before"><summary>${p.escape("修改前的完整内容")}</summary><pre>${p.escape(document.before_text ?? "文件尚不存在")}</pre></details>
        <details class="agent-review-after-full" data-review-detail="after"><summary>${p.escape("修改后的完整内容")}</summary><pre class="agent-review-after">${p.escape(document.after_text)}</pre></details>
      </div>`;
    }
    case "command":
      return `<div class="agent-review-doc" data-agent-review-kind="command">
        <pre class="agent-review-command"><span class="agent-review-prompt" aria-hidden="true">$</span> ${p.escape([document.command, ...document.args].map(shellWord).join(" "))}</pre>
        <p class="agent-review-meta">${p.escape(`在 ${document.cwd === "." ? "工作区根目录" : document.cwd} 运行 · ${document.escalate === undefined ? "执行范围未提供" : document.escalate ? "请求在沙箱外执行" : "在宿主执行边界内"}`)}</p>
        <details class="agent-review-bounds" data-review-detail="bounds"><summary>${p.escape("执行边界")}</summary><dl>
          ${document.workspace_path ? `<dt>${p.escape("所属工作区")}</dt><dd>${p.escape(document.workspace_path)}</dd>` : ""}
          <dt>${p.escape("工作目录")}</dt><dd>${p.escape(document.cwd)}</dd>
          <dt>${p.escape("超时")}</dt><dd>${p.escape(document.timeout_ms + " ms")}</dd>
          <dt>${p.escape("继承的环境变量")}</dt><dd>${p.escape(document.env_allowlist?.join(", ") ?? "运行时未提供")}</dd>
          <dt>${p.escape("执行范围")}</dt><dd>${p.escape(document.escalate === undefined ? "运行时未提供" : document.escalate ? "请求在沙箱外执行；批准仅适用于这一次操作" : "按本轮宿主执行边界运行")}</dd>
        </dl></details>
      </div>`;
    case "tool-operation": {
      // Exact arguments stay reviewable, folded under the readable fields rather than in front of them.
      const exact = document.fields.filter(field => field.label === "本次完整参数"), readable = document.fields.filter(field => field.label !== "本次完整参数");
      return `<div class="agent-review-doc" data-agent-review-kind="tool-operation"><p class="agent-review-meta">${p.escape(document.summary)}</p>${readable.length ? `<dl class="agent-review-fields">${readable.map(field => `<dt>${p.escape(field.label)}</dt><dd>${p.escape(field.value)}</dd>`).join("")}</dl>` : ""}${exact.map(field => `<details class="agent-review-bounds" data-review-detail="arguments"><summary>${p.escape("完整参数")}</summary><pre>${p.escape(field.value)}</pre></details>`).join("")}</div>`;
    }
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

/** Shell-style display of one argv word; the review still passes argv verbatim, this is only how it reads. */
function shellWord(word: string): string {
  return word !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

const DIFF_CONTEXT = 3;
const DIFF_ROW_LIMIT = 600;
/** A unified diff with context, so a reviewer reads what changes instead of two whole files. */
function renderTextDiff(before: string | null, after: string, p: AgentReviewPrimitives): { html: string; added: number; removed: number } {
  const diff = compareTexts(before ?? "", after);
  const rows = diff.ops.map(textDiffRow);
  const added = rows.filter(row => row.kind === "insert").length, removed = rows.filter(row => row.kind === "delete").length;
  if (diff.identical) return { html: `<p class="agent-review-meta">${p.escape("内容没有变化")}</p>`, added, removed };
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => { if (row.kind !== "equal") for (let near = Math.max(0, index - DIFF_CONTEXT); near <= Math.min(rows.length - 1, index + DIFF_CONTEXT); near += 1) keep[near] = true; });
  const body: string[] = [];
  let skipped = 0, shown = 0;
  const gap = () => { if (skipped) body.push(`<tr class="agent-review-gap"><td colspan="3">${p.escape(`⋯ ${skipped} 行未变`)}</td></tr>`); skipped = 0; };
  rows.forEach((row: TextDiffRow, index) => {
    if (!keep[index]) { skipped += 1; return; }
    gap();
    if (shown++ >= DIFF_ROW_LIMIT) return;
    const sign = row.kind === "insert" ? "+" : row.kind === "delete" ? "−" : " ";
    body.push(`<tr data-diff="${row.kind}"><td class="agent-review-ln">${row.before_number ?? ""}</td><td class="agent-review-ln">${row.after_number ?? ""}</td><td class="agent-review-code"><span class="agent-review-sign" aria-hidden="true">${sign}</span>${p.escape(row.text)}</td></tr>`);
  });
  gap();
  const more = shown > DIFF_ROW_LIMIT ? `<p class="agent-review-meta">${p.escape(`差异较长，已显示前 ${DIFF_ROW_LIMIT} 行；完整内容见下方`)}</p>` : "";
  const coarse = diff.coarse ? `<p class="agent-review-meta">${p.escape("改动范围很大，差异按整段删除与新增显示")}</p>` : "";
  return { html: `<div class="agent-review-diff-wrap"><table class="agent-review-diff" aria-label="${p.escape("修改差异")}"><tbody>${body.join("")}</tbody></table></div>${more}${coarse}`, added, removed };
}
