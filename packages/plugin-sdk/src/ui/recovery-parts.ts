import { renderButton, type MwButtonOptions } from "./button.js";
import { renderAlert, renderBadge, renderStatusMark, type MwStatusTone, type MwTone } from "./feedback.js";
import { cx, escapeHtml, renderAttrs, type AttrValue } from "./html.js";
import { icon, type PluginIconName } from "./icon.js";
import { renderStateRing } from "./state-ring.js";
import type { StateRingState } from "./state-ring-states.js";

export type MwBadgeTone = MwTone;

export function fileKindExtension(name: string): string {
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  if (/^\.env(?:\..+)?$/iu.test(base)) return "env";
  const dotfile = /^\.([^.]+)\.[^.]+$/u.exec(base);
  const dot = base.lastIndexOf(".");
  return (dotfile ? dotfile[1]! : dot > 0 ? base.slice(dot + 1) : "txt").toLowerCase().replace(/[^a-z0-9]/gu, "").slice(0, 4) || "txt";
}

export function renderFileKind(name: string): string {
  const extension = fileKindExtension(name);
  return `<span class="mw-file-kind mw-file-kind--${extension}" data-slot="file-kind">${escapeHtml(extension.toUpperCase())}</span>`;
}

export interface MwInlineRecoveryBlock {
  readonly title: string;
  readonly body: string;
  readonly tone?: "info" | "warning" | "danger";
  readonly actions?: readonly MwButtonOptions[];
}

export interface MwEnvCheckRowOptions {
  readonly state: StateRingState;
  readonly label: string;
  readonly value: string;
  readonly badge?: { readonly label: string; readonly tone?: MwBadgeTone };
  readonly status?: { readonly label: string; readonly tone: MwStatusTone; readonly icon?: PluginIconName };
  readonly recovery?: MwInlineRecoveryBlock;
}

export function renderEnvCheckRow(options: MwEnvCheckRowOptions): string {
  const trailing = options.badge
    ? renderBadge({ label: options.badge.label, tone: options.badge.tone ?? "neutral" })
    : options.status
      ? renderStatusMark({ label: options.status.label, tone: options.status.tone, icon: options.status.icon, plain: true })
      : "";
  const recovery = options.recovery
    ? `<div class="mw-rec-recovery" data-slot="env-recovery">${renderAlert({ title: options.recovery.title, body: options.recovery.body, tone: options.recovery.tone ?? "warning", actions: options.recovery.actions })}</div>`
    : "";
  return `<div class="mw-rec-row" data-slot="env-check-row">${renderStateRing({ state: options.state })}<span class="mw-rec-row__kv"><b>${escapeHtml(options.label)}</b><span title="${escapeHtml(options.value)}">${escapeHtml(options.value)}</span></span>${trailing}</div>${recovery}`;
}

export interface MwEnvChecklistOptions {
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone: MwStatusTone;
  readonly statusIcon?: PluginIconName;
  readonly rows: readonly MwEnvCheckRowOptions[];
  readonly footer?: { readonly title: string; readonly detail: string; readonly action?: MwButtonOptions };
  readonly attrs?: Record<string, AttrValue>;
}

export function renderEnvChecklist(options: MwEnvChecklistOptions): string {
  const foot = options.footer
    ? `<div class="mw-rec-list__foot"><b>${escapeHtml(options.footer.title)}</b><span>${escapeHtml(options.footer.detail)}</span>${options.footer.action ? renderButton({ ...options.footer.action, size: options.footer.action.size ?? "sm" }) : ""}</div>`
    : "";
  return `<div class="mw-rec-list" data-slot="env-checklist"${renderAttrs(options.attrs)}><div class="mw-rec-list__head"><span class="mw-rec-grow">${escapeHtml(options.title)}</span>${renderStatusMark({ label: options.statusLabel, tone: options.statusTone, icon: options.statusIcon, plain: true })}</div>${options.rows.map(renderEnvCheckRow).join("")}${foot}</div>`;
}

export interface MwTaskAttemptBudgetOptions {
  readonly headerText: string;
  readonly budgetPercent: number;
  readonly meterLabel?: string;
  readonly retryReasonLabel?: string;
  readonly retryReasonTone?: MwBadgeTone;
  readonly summaryText?: string;
  readonly pastSummaryLabel?: string;
  readonly pastAttempts?: ReadonlyArray<{ readonly state: StateRingState; readonly text: string }>;
  readonly actions?: readonly MwButtonOptions[];
  readonly attrs?: Record<string, AttrValue>;
}

export function renderTaskAttemptBudget(options: MwTaskAttemptBudgetOptions): string {
  const pct = Math.max(0, Math.min(100, Math.round(options.budgetPercent)));
  const hot = pct >= 85;
  const why = options.summaryText ? `<div class="mw-attempt__why">${escapeHtml(options.summaryText)}</div>` : "";
  const past = options.pastAttempts?.length && options.pastSummaryLabel
    ? `<details class="mw-disclosure"><summary>${escapeHtml(options.pastSummaryLabel)}</summary>${options.pastAttempts.map((item) => `<div class="mw-attempt__past">${renderStateRing({ state: item.state })}<span>${escapeHtml(item.text)}</span></div>`).join("")}</details>`
    : "";
  const acts = options.actions?.length
    ? `<div class="mw-attempt__acts">${options.actions.map((act) => renderButton({ ...act, size: act.size ?? "sm" })).join("")}</div>`
    : "";
  const meterAttr = options.meterLabel ? ` aria-label="${escapeHtml(options.meterLabel)}"` : "";
  return `<div class="mw-attempt" data-slot="task-attempt-budget"${renderAttrs(options.attrs)}><div class="mw-attempt__line"><span class="mw-rec-grow">${escapeHtml(options.headerText)}</span>${options.retryReasonLabel ? renderBadge({ label: options.retryReasonLabel, tone: options.retryReasonTone ?? "warning" }) : ""}</div><div class="mw-attempt__meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"${meterAttr}><i class="${cx(hot && "is-hot")}" style="width:${pct}%"></i></div>${why}${past}${acts}</div>`;
}

export interface MwRoundReportCheck {
  readonly state: StateRingState;
  readonly text: string;
  readonly quiet?: boolean;
  readonly codeRevision?: string;
  readonly badge?: { readonly label: string; readonly tone?: MwBadgeTone };
  readonly status?: { readonly label: string; readonly tone: MwStatusTone; readonly icon?: PluginIconName };
  readonly action?: MwButtonOptions;
}

export interface MwRoundReportCardOptions {
  readonly statusLabel: string;
  readonly statusTone: MwStatusTone;
  readonly statusIcon?: PluginIconName;
  readonly finishedAtLabel: string;
  readonly accepted?: boolean;
  readonly headings: {
    readonly delivered: string;
    readonly verified: string;
    readonly remaining: string;
    readonly cleanup?: string;
  };
  readonly codeRevisionTitle?: string;
  readonly delivered: readonly MwRoundReportCheck[];
  readonly verified: readonly MwRoundReportCheck[];
  readonly remaining: readonly MwRoundReportCheck[];
  readonly cleanup?: readonly MwRoundReportCheck[];
  readonly actions?: readonly MwButtonOptions[];
  readonly attrs?: Record<string, AttrValue>;
}

export function renderRoundReportCard(options: MwRoundReportCardOptions): string {
  const renderRow = (row: MwRoundReportCheck) => {
    const revTitle = options.codeRevisionTitle ?? row.codeRevision ?? "";
    const rev = row.codeRevision
      ? `<span class="mw-report-card__ver"${revTitle ? ` title="${escapeHtml(revTitle)}"` : ""}>${icon("hash")}${escapeHtml(row.codeRevision)}</span>`
      : "";
    const end = row.badge
      ? renderBadge({ label: row.badge.label, tone: row.badge.tone ?? "neutral" })
      : row.status
        ? renderStatusMark({ label: row.status.label, tone: row.status.tone, icon: row.status.icon, plain: true })
        : "";
    const act = row.action ? renderButton({ ...row.action, size: row.action.size ?? "sm" }) : "";
    return `<div class="${cx("mw-report-card__chk", row.quiet && "is-quiet")}">${renderStateRing({ state: row.state })}<span class="mw-rec-grow">${escapeHtml(row.text)}</span>${rev}${end}${act}</div>`;
  };
  const cleanupSec = options.cleanup?.length && options.headings.cleanup
    ? `<section><h3>${escapeHtml(options.headings.cleanup)}</h3>${options.cleanup.map(renderRow).join("")}</section>`
    : "";
  const acts = options.actions?.length
    ? `<div class="mw-report-card__acts">${options.actions.map((act) => renderButton(act)).join("")}</div>`
    : "";
  return `<div class="${cx("mw-report-card", options.accepted && "is-accepted")}" data-slot="round-report-card"${renderAttrs(options.attrs)}><div class="mw-report-card__head"><span class="mw-rec-grow">${renderStatusMark({ label: options.statusLabel, tone: options.statusTone, icon: options.statusIcon })}</span><span>${escapeHtml(options.finishedAtLabel)}</span></div><section><h3>${escapeHtml(options.headings.delivered)}</h3>${options.delivered.map(renderRow).join("")}</section><section><h3>${escapeHtml(options.headings.verified)}</h3>${options.verified.map(renderRow).join("")}</section><section><h3>${escapeHtml(options.headings.remaining)}</h3>${options.remaining.map(renderRow).join("")}</section>${cleanupSec}${acts}</div>`;
}

export function renderMaterialsFunnel(
  counts: ReadonlyArray<{ readonly label: string; readonly value: number | string }>,
  ariaLabel: string,
): string {
  return `<ol class="mw-mr-funnel" data-slot="materials-funnel" aria-label="${escapeHtml(ariaLabel)}">${counts.map((item) => `<li><b>${escapeHtml(String(item.value))}</b><span>${escapeHtml(item.label)}</span></li>`).join("")}</ol>`;
}

export interface MwMaterialsTrackOptions {
  readonly step: number;
  readonly stopAt?: number;
  readonly error?: boolean;
  readonly label: string;
  readonly tone?: MwStatusTone;
  readonly ariaLabel?: string;
  readonly title?: string;
}

export function renderMaterialsTrack(options: MwMaterialsTrackOptions): string {
  const cells = [1, 2, 3, 4, 5].map((index) => {
    const cls = options.stopAt === index ? "is-stop" : index <= options.step ? "is-on" : "";
    return `<i${cls ? ` class="${cls}"` : ""}></i>`;
  }).join("");
  const end = options.tone
    ? renderStatusMark({ label: options.label, tone: options.tone, plain: true })
    : `<span>${escapeHtml(options.label)}</span>`;
  return `<span class="mw-mr-cells" data-slot="materials-track"${options.ariaLabel ? ` role="group" aria-label="${escapeHtml(options.ariaLabel)}"` : ""}${options.title ? ` title="${escapeHtml(options.title)}"` : ""}><span class="${cx("mw-mr-track", options.error && "is-err")}" aria-hidden="true">${cells}</span>${end}</span>`;
}

export interface MwMaterialIssueRowOptions {
  readonly reason: string;
  readonly error?: boolean;
  readonly actions?: readonly MwButtonOptions[];
}

export function renderMaterialIssueRow(options: MwMaterialIssueRowOptions): string {
  const acts = options.actions?.length
    ? `<span class="mw-mr-why__acts">${options.actions.map((act) => renderButton({ ...act, size: act.size ?? "sm" })).join("")}</span>`
    : "";
  return `<li class="${cx("mw-mr-why", options.error && "is-err")}" data-slot="material-issue-row"><span>${escapeHtml(options.reason)}</span>${acts}</li>`;
}

export interface MwScopeDeltaItem {
  readonly kind: "add" | "rem" | "keep" | "redo";
  readonly glyph: PluginIconName;
  readonly title: string;
  readonly detail?: string;
}

export interface MwScopeDeltaCardOptions {
  readonly title: string;
  readonly subtitle?: string;
  readonly items: readonly MwScopeDeltaItem[];
  readonly attrs?: Record<string, AttrValue>;
}

export function renderScopeDeltaCard(options: MwScopeDeltaCardOptions): string {
  const rows = options.items.map((item) => `<div class="mw-mr-delta__row is-${item.kind}"><span class="mw-mr-delta__tile" aria-hidden="true">${icon(item.glyph)}</span><span class="mw-mr-delta__copy"><b>${escapeHtml(item.title)}</b>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</span></div>`).join("");
  return `<div class="mw-mr-delta" data-slot="scope-delta-card"${renderAttrs(options.attrs)}><div class="mw-mr-delta__head"><span>${escapeHtml(options.title)}</span>${options.subtitle ? `<small>${escapeHtml(options.subtitle)}</small>` : ""}</div>${rows}</div>`;
}

export interface MwCodingRoundMaterialItem {
  readonly state: StateRingState;
  readonly name: string;
  readonly how: string;
  readonly statusLabel: string;
  readonly statusTone: MwStatusTone;
  readonly statusIcon?: PluginIconName;
}

export interface MwCodingRoundMaterialsOptions {
  readonly title: string;
  readonly summaryLabel: string;
  readonly summaryTone: MwStatusTone;
  readonly items: readonly MwCodingRoundMaterialItem[];
  readonly recovery?: MwInlineRecoveryBlock;
  readonly footer?: { readonly title: string; readonly detail: string };
  readonly attrs?: Record<string, AttrValue>;
}

export function renderCodingRoundMaterials(options: MwCodingRoundMaterialsOptions): string {
  const rows = options.items.map((item) => `<div class="mw-rec-row">${renderStateRing({ state: item.state })}<span class="mw-rec-row__mrow"><b>${escapeHtml(item.name)}</b><span title="${escapeHtml(item.how)}">${escapeHtml(item.how)}</span></span>${renderStatusMark({ label: item.statusLabel, tone: item.statusTone, icon: item.statusIcon, plain: true })}</div>`).join("");
  const recovery = options.recovery
    ? `<div class="mw-rec-recovery" data-slot="materials-recovery">${renderAlert({ title: options.recovery.title, body: options.recovery.body, tone: options.recovery.tone ?? "warning", actions: options.recovery.actions })}</div>`
    : "";
  const foot = options.footer
    ? `<div class="mw-rec-list__foot"><b>${escapeHtml(options.footer.title)}</b><span>${escapeHtml(options.footer.detail)}</span></div>`
    : "";
  return `<div class="mw-rec-list" data-slot="coding-round-materials"${renderAttrs(options.attrs)}><div class="mw-rec-list__head"><span class="mw-rec-grow">${icon("file")}<span>${escapeHtml(options.title)}</span></span>${renderStatusMark({ label: options.summaryLabel, tone: options.summaryTone, plain: true })}</div>${rows}${recovery}${foot}</div>`;
}
