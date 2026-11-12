import { dateArg, t as uiText, renderStateRing, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {
  AgentReviewDocument,
  AgentReviewReceipt,
  AgentReviewRequest,
  AgentReviewStatus,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { compareTexts, textDiffRow } from "@molis-ai/molis-work-plugin-sdk";

/**
 * The Host's review surface: where a user decides whether an Agent's side
 * effect may happen.
 *
 * Deciding lives here and nowhere else. It is deliberately not a Capability —
 * exposing it to Plugins would let a Plugin approve its own effect — so this
 * surface is the one place the decision exists.
 */

const GIT_TOOL_TITLES: Record<string, string> = { "git-commit": "workbench.agent-review.git-commit", "git-branch-create": "workbench.agent-review.new-branch", "git-branch-switch": "workbench.agent-review.switch-branch", "git-push": "workbench.agent-review.push", "git-pr-create": "workbench.agent-review.create-pr" };

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
.agent-review-row { min-width:0; margin-bottom:16px; font-size:12px; line-height:1.6; }
.agent-review-row[data-agent-review-phase=pending] { padding:12px 16px; border:1px solid var(--line); border-radius:10px; background:var(--paper, #fff); box-shadow:var(--lift-1); }
.agent-review-head { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; color:var(--muted); }
.agent-review-head svg { width:14px; height:14px; }
.agent-review-row:has(> details) { margin-bottom:4px; }
.agent-review-row > details > summary { display:flex; align-items:center; gap:8px; min-height:30px; margin:0 -8px; padding:4px 8px; border-radius:6px; list-style:none; cursor:pointer; }
.agent-review-row > details > summary::-webkit-details-marker { display:none; }
.agent-review-row > details > summary::before { content:""; flex:none; width:5px; height:5px; margin:0 4px 0 1px; border-right:1.5px solid var(--faint, var(--muted)); border-bottom:1.5px solid var(--faint, var(--muted)); transform:rotate(-45deg); transition:transform 130ms var(--ease-quint); }
.agent-review-row > details[open] > summary::before { transform:rotate(45deg); }
.agent-review-row > details > summary:hover { background:var(--nav-hover, var(--rail)); }
.agent-review-row > details > summary .agent-review-head { flex:1 1 auto; min-width:0; flex-wrap:nowrap; }
.agent-review-row > details > summary .agent-review-head .mw-status,.agent-review-row > details > summary .agent-review-head time { flex:none; }
.agent-review-row > details[open] { padding-bottom:8px; }
.agent-review-plugin { display:none; }
.agent-review-title { min-width:0; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.agent-review-title--code { font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.agent-review-head time { margin-left:auto; font-size:11px; }
.agent-review-doc { margin:12px 0; overflow-wrap:anywhere; }
.agent-review-doc pre { max-height:360px; overflow:auto; white-space:pre; padding:8px; background:var(--rail); border-radius:var(--radius-control); font-size:12px; }
.agent-review-doc details { margin-top:8px; }
.agent-review-doc details > summary { cursor:pointer; color:var(--muted); font-size:12px; }
.agent-review-doc dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:4px 12px; margin:8px 0 0; }
.agent-review-doc dt { color:var(--muted); }
.agent-review-doc dd { margin:0; }
.agent-review-fields dd { white-space:pre-wrap; max-height:220px; overflow:auto; }
.agent-review-target { color:var(--ink); }
.agent-review-meta { color:var(--muted); margin:4px 0 0; }
.agent-review-concurrent { margin:8px 0 0; padding:8px 8px; border-radius:6px; color:var(--ink); background:color-mix(in srgb, var(--amber) 14%, transparent); }
.agent-review-grants { margin:8px 0 0; padding:8px 12px; border-radius:6px; color:var(--ink); background:color-mix(in srgb, var(--amber) 14%, transparent); }
.agent-review-grants p { margin:0; }
.agent-review-grants ul { margin:4px 0 0; padding:0; list-style:none; display:grid; gap:4px; }
.agent-review-grants code { font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); word-break:break-all; }
.agent-review-background { margin:8px 0 0; padding:8px 8px; border-radius:6px; color:var(--ink); background:color-mix(in srgb, var(--accent) 10%, transparent); }
.agent-review-warning { margin:8px 0 0; padding:8px 12px; border-radius:6px; color:var(--text); background:color-mix(in srgb,var(--amber,#b7791f) 14%,transparent); font-size:13px; }
.agent-review-command { white-space:pre-wrap !important; word-break:break-word; font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); color:var(--ink); }
.agent-review-prompt { color:var(--muted); user-select:none; }
.agent-review-file { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; margin:0; font:12px/1.6 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.agent-review-tag { font-family:inherit; font-size:11px; padding:0 8px; border-radius:999px; background:var(--rail); color:var(--muted); }
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
.agent-review-gap td { color:var(--muted); background:var(--rail); text-align:center; font-family:inherit; padding:4px 8px; }
.agent-review-actions { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:8px; }
.agent-review-actions [data-agent-review-approve]:focus::after { content:"↵"; margin-left:8px; font-size:11px; opacity:.72; }
.agent-review-remember { display:inline-flex; align-items:center; gap:8px; margin-right:auto; color:var(--muted); font-size:12px; cursor:pointer; }
.agent-review-remember input { margin:0; }
.agent-review-rule { color:var(--muted); }
.agent-review-feedback { margin-block:12px; }
.agent-review-feedback .mw-field__label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
/* Optional feedback stays one line until someone starts writing, so approve stays within reach. */
.agent-review-feedback textarea { min-height:36px; height:36px; resize:none; transition:none; }
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
      && (document.escalate === undefined || typeof document.escalate === "boolean")
      && (document.after_write_check === undefined || typeof document.after_write_check?.display_name === "string" && Number.isSafeInteger(document.after_write_check.version))
      && (document.grants === undefined || typeof document.grants.network === "boolean" && Array.isArray(document.grants.paths)
        && document.grants.paths.every(grant => typeof grant.path === "string" && (grant.access === "read" || grant.access === "write")));
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

const PHASE_MARK: Record<AgentReviewPhase, { state: StateRingState; tone: string; label: string }> = {
  reconcile: { state: "verify", tone: "blocked", label: "workbench.agent-review.reconcile" },
  pending: { state: "approval", tone: "attention", label: "workbench.agent-review.pending" },
  approved: { state: "waiting", tone: "progress", label: "workbench.agent-review.approved-pending" },
  done: { state: "done", tone: "done", label: "workbench.agent-review.completed" },
  failed: { state: "failed", tone: "blocked", label: "workbench.agent-review.approved-failed" },
  rejected: { state: "cancelled", tone: "blocked", label: "workbench.agent-review.rejected" },
  cancelled: { state: "cancelled", tone: "idle", label: "workbench.agent-review.withdrawn" },
  expired: { state: "stale", tone: "idle", label: "workbench.agent-review.expired" },
};

export function renderAgentReviewSurface(model: AgentReviewSurfaceModel): string {
  const { primitives: p } = model;
  if (model.rows.length === 0) {
    return `<section class="agent-review" data-agent-review>
      <div class="mw-empty" data-agent-review-empty><span class="mw-empty__mark">${p.icon("check")}</span><p>${p.escape(uiText.text("workbench.agent-review.empty"))}</p></div>
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
    ? { ...PHASE_MARK.done, label: "workbench.agent-review.executed" }
    : phase === "failed" && row.receipt?.reconciliation ? { ...PHASE_MARK.failed, label: "workbench.agent-review.not-happened" } : PHASE_MARK[phase];
  const decidable = isDecidable(row);
  const history = ["done", "rejected", "cancelled", "expired"].includes(phase);
  const document = row.request.document;
  // The heading names the thing itself, so a history list reads without opening every row.
  const label = document.kind === "text-edit" ? document.target_path
    : document.kind === "command" && readable(document) ? [document.command, ...document.args].map(shellWord).join(" ")
    : document.kind === "git-index" ? (document.action === "stage" ? uiText.text("workbench.agent-review.stage") : uiText.text("workbench.agent-review.unstage"))
    : document.kind === "git-integration" ? uiText.text("workbench.agent-review.integrate")
    : document.kind === "rewind" ? uiText.text("workbench.agent-review.rewind") : row.request.kind === "command" ? uiText.text("workbench.agent-review.execute-command")
    : document.kind === "tool-operation" && document.tool === "dispatch-subagent" ? uiText.text("workbench.agent-review.dispatch") + (document.fields.find(field => field.label === "子任务角色") ? " · " + document.fields.find(field => field.label === "子任务角色")!.value : "")
    : document.kind === "tool-operation" && document.tool === "steer-subagent" ? uiText.text("workbench.agent-review.steer")
    // A Git operation is named by what it does, with its own summary (branch, remote, file count) beside it.
    : document.kind === "tool-operation" && GIT_TOOL_TITLES[document.tool] ? uiText.text("workbench.agent-review.tool-with-summary", { name: uiText.text(GIT_TOOL_TITLES[document.tool]!), summary: document.summary })
    : document.kind === "tool-operation" && document.tool === "git-worktree-create" ? uiText.text("workbench.agent-review.worktree") : uiText.text("workbench.agent-review.tool");
  const labelClass = document.kind === "command" || document.kind === "text-edit" ? "agent-review-title agent-review-title--code" : "agent-review-title";
  return `<article class="agent-review-row" data-agent-review-item="${p.escape(row.request.review_id)}" data-agent-review-phase="${phase}">
    ${history ? '<details data-review-detail="history"><summary>' : ""}<header class="agent-review-head">
      <span class="mw-status" data-tone="${mark.tone}">${renderStateRing({ state: mark.state })}${p.escape(uiText.text(mark.label))}</span>
      <span class="${labelClass}"${document.kind === "command" || document.kind === "text-edit" ? ' translate="no"' : ""}>${p.escape(label)}</span><span class="agent-review-plugin">${p.escape(row.request.plugin_id)}</span>
      <time>${p.escape(p.formatDate(row.request.requested_at))}</time>
    </header>${history ? "</summary>" : ""}
    ${renderDocument(row.request.document, p)}
    ${renderFooter(row, decidable, p)}${history ? "</details>" : ""}
  </article>`;
}

/**
 * Text that looks like a model's own tool-call markup, leaked into a command (seen with MiniMax: "</argml:arbgt></item>").
 * Only a hint for the person deciding; the command is shown and decided exactly as proposed.
 */
export function leakedMarkup(text: string): boolean {
  return /<\/?(?:[a-z]+:)?(?:arg[a-z_]*|item|invoke|parameter|tool_call|tool_use|function_calls?|antml[a-z_:]*)\b[^>]*>/i.test(text);
}

function renderFooter(row: AgentReviewRow, decidable: boolean, p: AgentReviewPrimitives): string {
  if (decidable) {
    const reviewId = p.escape(row.request.review_id);
    // A round's own proposals (edits, commands, dispatches, MCP calls) of any plugin can be refused with a reason the round receives.
    return `${row.request.run && ["text-edit", "command", "tool-operation", "mcp"].includes(row.request.document.kind) ? `<label class="mw-field agent-review-feedback"><span class="mw-field__label">${uiText("workbench.agent-review.feedback")}</span><textarea class="mw-textarea" data-slot="textarea" data-agent-review-feedback aria-label="${uiText("workbench.agent-review.feedback")}" maxlength="2000" rows="1" placeholder="${uiText("workbench.agent-review.feedback-placeholder")}"></textarea><span class="mw-field__hint">${uiText("workbench.agent-review.feedback-hint")}</span></label>` : ""}<footer class="agent-review-actions">
      ${row.request.document.kind === "command" && row.request.document.escalate === false && row.request.document.grants === undefined && row.request.run ? `<label class="agent-review-remember"><input type="checkbox" data-agent-review-remember>${p.escape(uiText.text("workbench.agent-review.remember-session"))}</label>` : ""}
      <button class="mw-btn" type="button" data-agent-review-reject="${reviewId}">${p.escape(uiText.text("workbench.agent-review.reject"))}</button>
      <button class="mw-btn mw-btn--primary" type="button" data-agent-review-approve="${reviewId}">${p.escape(uiText.text("workbench.agent-review.approve-once"))}</button>
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
    ${row.receipt?.standing_rule ? `<p class="agent-review-rule">${p.escape(uiText.text("workbench.agent-review.standing-rule", { actor: row.receipt.standing_rule.set_by, time: dateArg(row.receipt.standing_rule.set_at, "datetime") }))}</p>` : note === null || note === undefined ? "" : `<p>${p.escape(note)}</p>`}
    ${error === null || error === undefined ? "" : `<p class="agent-review-error">${p.escape(error)}</p>`}
    ${row.receipt?.effect_uncertain ? `<p class="agent-review-error">${p.escape(row.receipt.effect_uncertain)}</p>` : ""}
    ${row.receipt?.effect_uncertain && row.request.kind === "git-index" ? `<button class="mw-btn" type="button" data-agent-review-inspect="${p.escape(row.request.review_id)}">${uiText("workbench.agent-review.check-index")}</button><div data-review-recovery></div>` : ""}
    ${row.receipt?.reconciliation && !row.receipt.effect_uncertain ? `<p>${p.escape(row.receipt.reconciliation.actor_id)} · ${p.escape(p.formatDate(row.receipt.reconciliation.at))}</p><p>${p.escape(uiText.text("workbench.agent-review.evidence") + row.receipt.reconciliation.reason)}</p>` : ""}
    ${row.receipt?.delivery_error ? `<p class="agent-review-error">${p.escape(uiText.text("workbench.agent-review.not-delivered") + row.receipt.delivery_error)}</p>` : ""}
  </footer>`;
}

function renderDocument(document: AgentReviewDocument, p: AgentReviewPrimitives): string {
  if (!readable(document)) return `<div class="agent-review-doc" data-agent-review-kind="${p.escape(document.kind)}"><p>${p.escape(uiText.text("workbench.agent-review.unreadable"))}</p></div>`;
  switch (document.kind) {
    case "git-integration": return `<div class="agent-review-doc" data-agent-review-kind="git-integration">
      <p>${uiText("workbench.agent-review.integrate-workspace")}</p><dl><dt>${uiText("workbench.agent-review.source-directory")}</dt><dd>${p.escape(document.source.directory)}</dd><dt>${uiText("workbench.agent-review.destination-directory")}</dt><dd>${p.escape(document.target_directory)}</dd><dt>${uiText("workbench.agent-review.source-base")}</dt><dd>${p.escape(document.source.branch)} · ${p.escape(document.source.base_commit)}</dd></dl>
      <p>${uiText("workbench.agent-review.integrate-boundary")}</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)}</p><p>${uiText("workbench.agent-review.file-mode")}${p.escape(file.before_mode ?? uiText.text("workbench.agent-review.missing"))} → ${p.escape(file.after_mode ?? uiText.text("workbench.agent-review.missing"))}</p>
      <details data-review-detail="${p.escape("before:" + file.path)}"><summary>${uiText("workbench.agent-review.workspace-before")}</summary><pre>${p.escape(file.before_text ?? uiText.text("workbench.agent-review.before-no-file"))}</pre></details>
      <p>${uiText("workbench.agent-review.integrated-content")}</p><pre>${p.escape(file.after_text === null ? uiText.text("workbench.agent-review.delete-file") : file.after_text || uiText.text("workbench.agent-review.empty-file"))}</pre></section>`).join("")}</div>`;
    case "git-index": return `<div class="agent-review-doc" data-agent-review-kind="git-index">
      <p>${p.escape(document.workspace_name)} · ${document.action === "stage" ? uiText.text("workbench.agent-review.stage-fixed") : uiText.text("workbench.agent-review.unstage-to-head")}</p><p>${uiText("workbench.agent-review.index-boundary")}</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)}</p>
        <p>${uiText("workbench.agent-review.file-mode")}${p.escape(file.before_mode ?? uiText.text("workbench.agent-review.missing"))} → ${p.escape(file.after_mode ?? uiText.text("workbench.agent-review.missing"))}</p>
        <details data-review-detail="${p.escape("before:" + file.path)}"><summary>${uiText("workbench.agent-review.index-before")}</summary><pre>${p.escape(file.before_text ?? uiText.text("workbench.agent-review.not-staged"))}</pre></details>
        <p>${uiText("workbench.agent-review.index-after")}</p><pre>${p.escape(file.after_text === null ? uiText.text("workbench.agent-review.unstage-keep-disk") : file.after_text || uiText.text("workbench.agent-review.empty-file"))}</pre></section>`).join("")}</div>`;
    case "text-edit": {
      const diff = renderTextDiff(document.before_text, document.after_text, p);
      return `<div class="agent-review-doc" data-agent-review-kind="text-edit">
        <p class="agent-review-file"><span class="agent-review-target">${p.escape(document.target_path)}</span>${document.exists ? "" : `<span class="agent-review-tag">${p.escape(uiText.text("workbench.agent-review.new-file"))}</span>`}<span class="agent-review-count" data-added>+${diff.added}</span><span class="agent-review-count" data-removed>−${diff.removed}</span></p>
        ${document.workspace_path ? `<p class="agent-review-meta">${p.escape(document.workspace_path)}</p>` : ""}
        ${document.concurrent?.length ? `<p class="agent-review-concurrent" role="note">${p.escape(uiText.text("workbench.agent-review.concurrent", { sessions: document.concurrent.join(uiText.text("common.list.separator")) }))}</p>` : ""}
        ${diff.html}
        <details class="agent-review-before" data-review-detail="before"><summary>${p.escape(uiText.text("workbench.agent-review.before-full"))}</summary><pre>${p.escape(document.before_text ?? uiText.text("workbench.agent-review.before-no-file"))}</pre></details>
        <details class="agent-review-after-full" data-review-detail="after"><summary>${p.escape(uiText.text("workbench.agent-review.after-full"))}</summary><pre class="agent-review-after" translate="no">${p.escape(document.after_text)}</pre></details>
      </div>`;
    }
    case "command":
      return `<div class="agent-review-doc" data-agent-review-kind="command">
        <pre class="agent-review-command" translate="no"><span class="agent-review-prompt" aria-hidden="true">$</span> ${p.escape([document.command, ...document.args].map(shellWord).join(" "))}</pre>
        ${document.after_write_check ? `<p class="agent-review-meta" data-agent-review-check>${p.escape(uiText.text("workbench.agent-review.after-write-check", { name: document.after_write_check.display_name, version: document.after_write_check.version }))}</p>` : ""}
        ${leakedMarkup([document.command, ...document.args].join(" ")) ? `<p class="agent-review-warning" role="note">${p.escape(uiText.text("workbench.agent-review.leaked-markup", { example: "</arg…>, <item>" }))}</p>` : ""}
        <p class="agent-review-meta">${p.escape(uiText.text("workbench.agent-review.command-scope", { directory: document.cwd === "." ? uiText.text("workbench.agent-review.workspace-root") : document.cwd, scope: uiText.text(document.escalate === undefined ? "workbench.agent-review.scope-missing" : document.escalate ? "workbench.agent-review.outside-sandbox" : document.grants ? "workbench.agent-review.extra-scope" : "workbench.agent-review.within-scope") }))}</p>
        ${document.grants ? `<div class="agent-review-grants" role="note" data-agent-review-grants><p>${p.escape(uiText.text("workbench.agent-review.asks-access"))}</p><ul>${document.grants.paths.map(grant => `<li><span class="agent-review-tag">${p.escape(grant.access === "write" ? uiText.text("workbench.agent-review.write") : uiText.text("workbench.agent-review.read"))}</span> <code>${p.escape(grant.path)}</code></li>`).join("")}${document.grants.network ? `<li><span class="agent-review-tag">${p.escape(uiText.text("workbench.agent-review.network"))}</span> ${p.escape(uiText.text("workbench.agent-review.requests-network"))}</li>` : ""}</ul><p class="agent-review-meta">${p.escape(uiText.text("workbench.agent-review.no-isolation"))}</p></div>` : ""}
        ${document.background ? `<p class="agent-review-background" role="note">${p.escape(document.outlives_run ? uiText.text("workbench.agent-review.background-outlives") : uiText.text("workbench.agent-review.background-ends"))}</p>` : ""}
        <details class="agent-review-bounds" data-review-detail="bounds"><summary>${p.escape(uiText.text("workbench.agent-review.execution-bounds"))}</summary><dl>
          ${document.workspace_path ? `<dt>${p.escape(uiText.text("workbench.agent-review.workspace"))}</dt><dd>${p.escape(document.workspace_path)}</dd>` : ""}
          <dt>${p.escape(uiText.text("workbench.agent-review.working-dir"))}</dt><dd>${p.escape(document.cwd)}</dd>
          <dt>${p.escape(uiText.text("workbench.agent-review.timeout"))}</dt><dd>${p.escape(document.background ? uiText.text("workbench.agent-review.background-no-limit") : uiText.text("workbench.agent-review.timeout-ms", { milliseconds: document.timeout_ms }))}</dd>
          <dt>${p.escape(uiText.text("workbench.agent-review.inherited-env"))}</dt><dd>${p.escape(document.env_allowlist?.join(", ") ?? uiText.text("workbench.agent-review.not-supplied"))}</dd>
          <dt>${p.escape(uiText.text("workbench.agent-review.execution-scope"))}</dt><dd>${p.escape(document.escalate === undefined ? uiText.text("workbench.agent-review.not-supplied") : document.escalate ? uiText.text("workbench.agent-review.outside-once") : document.grants ? uiText.text("workbench.agent-review.extra-scope-once") : uiText.text("workbench.agent-review.within-turn"))}</dd>
        </dl></details>
      </div>`;
    case "tool-operation": {
      // Exact arguments stay reviewable, folded under the readable fields rather than in front of them.
      const exact = document.fields.filter(field => field.label === "本次完整参数"), readable = document.fields.filter(field => field.label !== "本次完整参数");
      return `<div class="agent-review-doc" data-agent-review-kind="tool-operation"><p class="agent-review-meta">${p.escape(document.summary)}</p>${readable.length ? `<dl class="agent-review-fields">${readable.map(field => `<dt>${p.escape(field.label)}</dt><dd>${p.escape(field.value)}</dd>`).join("")}</dl>` : ""}${exact.map(field => `<details class="agent-review-bounds" data-review-detail="arguments"><summary>${p.escape(uiText.text("workbench.agent-review.arguments"))}</summary><pre>${p.escape(field.value)}</pre></details>`).join("")}</div>`;
    }
    case "mcp": return `<div class="agent-review-doc" data-agent-review-kind="mcp"><p>${p.escape(document.server + " · " + document.tool)}</p><pre translate="no">${p.escape(document.arguments_json)}</pre></div>`;
    case "rewind": return `<div class="agent-review-doc" data-agent-review-kind="rewind">
      <p>${p.escape(uiText.text("workbench.agent-review.checkpoint", { id: document.checkpoint_id }))}</p>
      <p>${uiText("workbench.agent-review.rewind-boundary")}</p>
      ${document.files.map(file => `<section><p class="agent-review-target">${p.escape(file.path)} · ${uiText({create:"workbench.agent-review.restore-create",delete:"workbench.agent-review.restore-delete",restore:"workbench.agent-review.restore-text"}[file.change])}</p>
        <details data-review-detail="${p.escape("before:" + file.path)}"><summary>${uiText("workbench.agent-review.current-contents")}</summary><pre>${p.escape(file.before_text === null ? uiText.text("workbench.agent-review.file-missing") : file.before_text === "" ? uiText.text("workbench.agent-review.empty-file") : file.before_text)}</pre></details>
        <p>${uiText("workbench.agent-review.after-rewind")}</p><pre>${p.escape(file.after_text === null ? uiText.text("workbench.agent-review.file-will-be-missing") : file.after_text === "" ? uiText.text("workbench.agent-review.empty-file") : file.after_text)}</pre></section>`).join("")}</div>`;
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
  if (diff.identical) return { html: `<p class="agent-review-meta">${p.escape(uiText.text("workbench.agent-review.unchanged"))}</p>`, added, removed };
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => { if (row.kind !== "equal") for (let near = Math.max(0, index - DIFF_CONTEXT); near <= Math.min(rows.length - 1, index + DIFF_CONTEXT); near += 1) keep[near] = true; });
  const body: string[] = [];
  let skipped = 0, shown = 0;
  const gap = () => { if (skipped) body.push(`<tr class="agent-review-gap"><td colspan="3">${p.escape(uiText.text("workbench.agent-review.unchanged-lines", { count: skipped }))}</td></tr>`); skipped = 0; };
  rows.forEach((row: TextDiffRow, index) => {
    if (!keep[index]) { skipped += 1; return; }
    gap();
    if (shown++ >= DIFF_ROW_LIMIT) return;
    const sign = row.kind === "insert" ? "+" : row.kind === "delete" ? "−" : " ";
    body.push(`<tr data-diff="${row.kind}"><td class="agent-review-ln">${row.before_number ?? ""}</td><td class="agent-review-ln">${row.after_number ?? ""}</td><td class="agent-review-code" translate="no"><span class="agent-review-sign" aria-hidden="true">${sign}</span>${p.escape(row.text)}</td></tr>`);
  });
  gap();
  const more = shown > DIFF_ROW_LIMIT ? `<p class="agent-review-meta">${p.escape(uiText.text("workbench.agent-review.diff-long", { count: DIFF_ROW_LIMIT }))}</p>` : "";
  const coarse = diff.coarse ? `<p class="agent-review-meta">${p.escape(uiText.text("workbench.agent-review.diff-coarse"))}</p>` : "";
  return { html: `<div class="agent-review-diff-wrap"><table class="agent-review-diff" aria-label="${p.escape(uiText.text("workbench.agent-review.diff"))}"><tbody>${body.join("")}</tbody></table></div>${more}${coarse}`, added, removed };
}
