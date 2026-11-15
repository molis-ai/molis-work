// The component board's parts for Batch 33 (Coding environment & recovery, and materials verification & scope/model recovery):
// decided in docs/design/coding-env-recovery/README.md (A/A/A/A) and docs/design/materials-recovery/README.md (B/A/A).
// Every control inside them is an existing one (state ring, status mark, badge, button, file row); the rules only place them, on tokens only.
import {
  cx,
  escapeHtml,
  icon,
  renderAttrs,
  renderBadge,
  renderButton,
  renderStateRing,
  renderStatusMark,
  type AttrValue,
  type MwButtonOptions,
  type MwStatusTone,
  type PluginIconName,
  type StateRingState,
} from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderFileRow } from "./arrival.js";
import { mark, section, specimen } from "./catalog-parts.js";

export type MwBadgeTone = NonNullable<Parameters<typeof renderBadge>[0]["tone"]>;

export const RECOVERY_PARTS_STYLES = `
  /* 1 · Environment checklist & round materials list: a paper list with key-value or material rows and a quiet footer. */
  .mw-rec-list { border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent), var(--shadow-soft); overflow: hidden; }
  .mw-rec-list__head { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px 0 16px; font-size: 12px; font-weight: var(--weight-control, 500); color: var(--muted); }
  .mw-rec-list__head > .mw-rec-grow { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
  .mw-rec-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 4px 12px 4px 16px; box-shadow: inset 0 1px 0 var(--line); min-width: 0; }
  .mw-rec-row > .mw-state-ring { flex: none; }
  .mw-rec-row__kv { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-rec-row__kv > b { flex: none; width: 96px; font-weight: var(--weight-control, 500); color: var(--ink-soft); }
  .mw-rec-row__kv > span, .mw-rec-row__mrow > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
  .mw-rec-row__mrow { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-rec-row__mrow > b { flex: none; font-weight: var(--weight-control, 500); color: var(--ink); }
  .mw-rec-list__foot { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; box-shadow: inset 0 1px 0 var(--line); font-size: 12px; color: var(--muted); min-width: 0; }
  .mw-rec-list__foot > b { color: var(--ink-soft); font-weight: var(--weight-control, 500); }
  .mw-rec-list__foot > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 2 · Task card attempt & budget strip: two quiet lines + a thin meter that turns amber at >= 85%. */
  .mw-attempt { display: grid; gap: 8px; padding: 8px 12px 12px; font-size: 12px; color: var(--muted); border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent), var(--shadow-soft); }
  .mw-attempt__line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .mw-attempt__line > .mw-rec-grow { flex: 1; min-width: 0; }
  .mw-attempt__meter { height: 4px; border-radius: 999px; background: var(--rail); overflow: hidden; display: flex; }
  .mw-attempt__meter > i { display: block; height: 100%; background: var(--green); transition: width var(--dur-arrive, 420ms) var(--ease-quint); }
  .mw-attempt__meter > i.is-hot { background: var(--amber); }
  .mw-attempt__why { line-height: 1.5; color: var(--muted); }
  .mw-attempt summary { min-height: 32px; display: flex; align-items: center; cursor: pointer; }
  .mw-attempt__past { display: flex; align-items: center; gap: 6px; padding-top: 4px; color: var(--muted); }
  .mw-attempt__acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  /* 3 · Round report card & code revision badge: three compact sections and monospace commit/time on each check. */
  .mw-report-card { display: grid; gap: 4px; padding: 8px 16px 16px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent), var(--shadow-soft); }
  .mw-report-card.is-accepted { box-shadow: 0 0 0 1px color-mix(in srgb, var(--green) 40%, transparent), var(--shadow-soft); }
  .mw-report-card__head { display: flex; align-items: center; gap: 8px; min-height: 40px; font-size: 12px; color: var(--muted); }
  .mw-report-card__head > .mw-rec-grow { flex: 1; min-width: 0; }
  .mw-report-card > section { display: grid; gap: 2px; padding: 8px 0 4px; box-shadow: inset 0 1px 0 var(--line); }
  .mw-report-card h3 { margin: 0 0 4px; font-size: 12px; font-weight: var(--weight-control, 500); color: var(--muted); }
  .mw-report-card__chk { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 13px; color: var(--ink-soft); min-width: 0; }
  .mw-report-card__chk > .mw-rec-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-report-card__chk.is-quiet { color: var(--muted); }
  .mw-report-card__ver { display: inline-flex; align-items: center; gap: 4px; flex: none; font: 500 11px var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
  .mw-report-card__acts { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 8px; }

  /* 4 · Materials 5-number funnel, 5-cell progress track & issue reason row (materials-recovery B). */
  .mw-mr-funnel { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; padding: 8px 10px; border-radius: var(--r-row, 10px); background: var(--surface-soft); margin: 0; list-style: none; }
  .mw-mr-funnel > li { display: grid; gap: 2px; min-width: 0; padding: 4px 6px; border-radius: var(--r-tag, 6px); font-size: 11px; color: var(--muted); }
  .mw-mr-funnel > li > b { font-size: 15px; font-weight: var(--weight-title, 600); color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.2; }
  .mw-mr-funnel > li > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-mr-cells { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .mw-mr-track { display: inline-flex; gap: 3px; align-items: center; }
  .mw-mr-track > i { width: 8px; height: 4px; border-radius: 2px; background: var(--line-strong); transition: background-color var(--dur-move, 250ms) var(--ease-quint); }
  .mw-mr-track > i.is-on { background: var(--ink-soft); }
  .mw-mr-track > i.is-stop { background: var(--amber); }
  .mw-mr-track.is-err > i.is-stop { background: var(--red); }
  .mw-mr-why { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 2px 4px 10px 44px; margin-left: -8px; font-size: 12px; color: var(--ink-soft); line-height: 1.5; list-style: none; }
  .mw-mr-why.is-err { color: var(--red); }
  .mw-mr-why > span { flex: 1 1 18em; min-width: 0; }
  .mw-mr-why__acts { display: inline-flex; flex-wrap: wrap; gap: 6px; }

  /* 5 · Scope & model delta card ("这次只做这些", materials-recovery A). */
  .mw-mr-delta { display: grid; gap: 6px; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-mr-delta__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: var(--weight-title, 600); color: var(--ink); }
  .mw-mr-delta__head > small { font-weight: var(--weight-body, 400); color: var(--muted); }
  .mw-mr-delta__row { display: flex; align-items: center; gap: 8px; min-height: 26px; font-size: 12px; color: var(--ink-soft); min-width: 0; }
  .mw-mr-delta__tile { width: 20px; height: 20px; border-radius: var(--r-tag, 6px); display: grid; place-items: center; flex: none; background: var(--rail); color: var(--ink-soft); }
  .mw-mr-delta__tile > svg { width: 12px; height: 12px; }
  .mw-mr-delta__row.is-add .mw-mr-delta__tile { background: var(--accent-soft); color: var(--accent-strong); }
  .mw-mr-delta__row.is-rem .mw-mr-delta__tile { background: var(--amber-soft); color: var(--amber); }
  .mw-mr-delta__row.is-keep .mw-mr-delta__tile { background: var(--green-soft); color: var(--green); }
  .mw-mr-delta__row.is-redo .mw-mr-delta__tile { background: var(--accent-soft); color: var(--accent-strong); }
  .mw-mr-delta__copy { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; }
  .mw-mr-delta__copy > b { font-weight: var(--weight-control, 500); color: var(--ink); white-space: nowrap; }
  .mw-mr-delta__copy > small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 760px) {
    .mw-rec-row__kv > b { width: 72px; }
    .mw-mr-funnel { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-attempt__meter > i, .mw-mr-track > i { transition: none; }
  }
`;

export const RECOVERY_BOARD_STYLES = RECOVERY_PARTS_STYLES + `
  #recovery-closures .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); align-items: start; }
  #recovery-closures .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
`;

export interface MwEnvCheckRowOptions {
  readonly state: StateRingState;
  readonly label: string;
  readonly value: string;
  readonly badge?: { readonly label: string; readonly tone?: MwBadgeTone };
  readonly status?: { readonly label: string; readonly tone: MwStatusTone; readonly icon?: PluginIconName };
}

export function renderEnvCheckRow(options: MwEnvCheckRowOptions): string {
  const trailing = options.badge
    ? renderBadge({ label: options.badge.label, tone: options.badge.tone ?? "neutral" })
    : options.status
      ? renderStatusMark({ label: options.status.label, tone: options.status.tone, icon: options.status.icon, plain: true })
      : "";
  return `<div class="mw-rec-row" data-slot="env-check-row">${renderStateRing({ state: options.state })}<span class="mw-rec-row__kv"><b>${escapeHtml(options.label)}</b><span title="${escapeHtml(options.value)}">${escapeHtml(options.value)}</span></span>${trailing}</div>`;
}

export function renderEnvChecklist(options: {
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone: MwStatusTone;
  readonly statusIcon?: PluginIconName;
  readonly rows: readonly MwEnvCheckRowOptions[];
  readonly footer?: { readonly title: string; readonly detail: string; readonly action?: MwButtonOptions };
  readonly attrs?: Record<string, AttrValue>;
}): string {
  const foot = options.footer
    ? `<div class="mw-rec-list__foot"><b>${escapeHtml(options.footer.title)}</b><span>${escapeHtml(options.footer.detail)}</span>${options.footer.action ? renderButton({ ...options.footer.action, size: options.footer.action.size ?? "sm" }) : ""}</div>`
    : "";
  return `<div class="mw-rec-list" data-slot="env-checklist"${renderAttrs(options.attrs)}><div class="mw-rec-list__head"><span class="mw-rec-grow">${escapeHtml(options.title)}</span>${renderStatusMark({ label: options.statusLabel, tone: options.statusTone, icon: options.statusIcon, plain: true })}</div>${options.rows.map(renderEnvCheckRow).join("")}${foot}</div>`;
}

export interface MwTaskAttemptBudgetOptions {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly budgetPercent: number;
  readonly retryReasonLabel?: string;
  readonly retryReasonTone?: MwBadgeTone;
  readonly summaryText: string;
  readonly pastAttempts?: ReadonlyArray<{ readonly state: StateRingState; readonly text: string }>;
  readonly actions?: readonly MwButtonOptions[];
  readonly attrs?: Record<string, AttrValue>;
}

export function renderTaskAttemptBudget(options: MwTaskAttemptBudgetOptions): string {
  const pct = Math.max(0, Math.min(100, Math.round(options.budgetPercent)));
  const hot = pct >= 85;
  const past = options.pastAttempts?.length
    ? `<details class="mw-disclosure"><summary>前 ${options.pastAttempts.length} 次尝试</summary>${options.pastAttempts.map((item) => `<div class="mw-attempt__past">${renderStateRing({ state: item.state })}<span>${escapeHtml(item.text)}</span></div>`).join("")}</details>`
    : "";
  const acts = options.actions?.length
    ? `<div class="mw-attempt__acts">${options.actions.map((act) => renderButton({ ...act, size: act.size ?? "sm" })).join("")}</div>`
    : "";
  return `<div class="mw-attempt" data-slot="task-attempt-budget"${renderAttrs(options.attrs)}><div class="mw-attempt__line"><span class="mw-rec-grow">第 ${options.attempt} 次 · 最多 ${options.maxAttempts} 次 · 额度用了 ${pct}%</span>${options.retryReasonLabel ? renderBadge({ label: options.retryReasonLabel, tone: options.retryReasonTone ?? "warning" }) : ""}</div><div class="mw-attempt__meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i class="${cx(hot && "is-hot")}" style="width:${pct}%"></i></div><div class="mw-attempt__why">${escapeHtml(options.summaryText)}</div>${past}${acts}</div>`;
}

export interface MwRoundReportCheck {
  readonly state: StateRingState;
  readonly text: string;
  readonly quiet?: boolean;
  readonly codeRevision?: string;
  readonly badge?: { readonly label: string; readonly tone?: MwBadgeTone };
  readonly status?: { readonly label: string; readonly tone: MwStatusTone; readonly icon?: PluginIconName };
}

export function renderRoundReportCard(options: {
  readonly statusLabel: string;
  readonly statusTone: MwStatusTone;
  readonly statusIcon?: PluginIconName;
  readonly finishedAtLabel: string;
  readonly accepted?: boolean;
  readonly delivered: readonly MwRoundReportCheck[];
  readonly verified: readonly MwRoundReportCheck[];
  readonly remaining: readonly MwRoundReportCheck[];
  readonly actions?: readonly MwButtonOptions[];
  readonly attrs?: Record<string, AttrValue>;
}): string {
  const renderRow = (row: MwRoundReportCheck) => {
    const rev = row.codeRevision ? `<span class="mw-report-card__ver" title="测试跑在这个代码版本上">${icon("hash")}${escapeHtml(row.codeRevision)}</span>` : "";
    const end = row.badge
      ? renderBadge({ label: row.badge.label, tone: row.badge.tone ?? "neutral" })
      : row.status
        ? renderStatusMark({ label: row.status.label, tone: row.status.tone, icon: row.status.icon, plain: true })
        : "";
    return `<div class="${cx("mw-report-card__chk", row.quiet && "is-quiet")}">${renderStateRing({ state: row.state })}<span class="mw-rec-grow">${escapeHtml(row.text)}</span>${rev}${end}</div>`;
  };
  const acts = options.actions?.length
    ? `<div class="mw-report-card__acts">${options.actions.map((act) => renderButton(act)).join("")}</div>`
    : "";
  return `<div class="${cx("mw-report-card", options.accepted && "is-accepted")}" data-slot="round-report-card"${renderAttrs(options.attrs)}><div class="mw-report-card__head"><span class="mw-rec-grow">${renderStatusMark({ label: options.statusLabel, tone: options.statusTone, icon: options.statusIcon })}</span><span>${escapeHtml(options.finishedAtLabel)}</span></div><section><h3>交付了什么</h3>${options.delivered.map(renderRow).join("")}</section><section><h3>怎么验证的</h3>${options.verified.map(renderRow).join("")}</section><section><h3>没做完的</h3>${options.remaining.map(renderRow).join("")}</section>${acts}</div>`;
}

export function renderMaterialsFunnel(counts: ReadonlyArray<{ readonly label: string; readonly value: number }>, ariaLabel = "材料经过的五步"): string {
  return `<ol class="mw-mr-funnel" data-slot="materials-funnel" aria-label="${escapeHtml(ariaLabel)}">${counts.map((item) => `<li><b>${item.value}</b><span>${escapeHtml(item.label)}</span></li>`).join("")}</ol>`;
}

export function renderMaterialsTrack(options: {
  readonly step: number;
  readonly stopAt?: number;
  readonly error?: boolean;
  readonly label: string;
  readonly title?: string;
}): string {
  const cells = [1, 2, 3, 4, 5].map((index) => {
    const cls = options.stopAt === index ? "is-stop" : index <= options.step ? "is-on" : "";
    return `<i${cls ? ` class="${cls}"` : ""}></i>`;
  }).join("");
  return `<span class="mw-mr-cells" data-slot="materials-track"${options.title ? ` title="${escapeHtml(options.title)}"` : ""}><span class="${cx("mw-mr-track", options.error && "is-err")}" aria-hidden="true">${cells}</span><span>${escapeHtml(options.label)}</span></span>`;
}

export function renderMaterialIssueRow(options: {
  readonly reason: string;
  readonly error?: boolean;
  readonly actions?: readonly MwButtonOptions[];
}): string {
  const acts = options.actions?.length
    ? `<span class="mw-mr-why__acts">${options.actions.map((act) => renderButton({ ...act, size: act.size ?? "sm" })).join("")}</span>`
    : "";
  return `<li class="${cx("mw-mr-why", options.error && "is-err")}" data-slot="material-issue-row"><span>${escapeHtml(options.reason)}</span>${acts}</li>`;
}

export interface MwScopeDeltaItem {
  readonly kind: "add" | "rem" | "keep" | "redo";
  readonly glyph: PluginIconName;
  readonly title: string;
  readonly detail: string;
}

export function renderScopeDeltaCard(options: {
  readonly title: string;
  readonly subtitle?: string;
  readonly items: readonly MwScopeDeltaItem[];
  readonly attrs?: Record<string, AttrValue>;
}): string {
  const rows = options.items.map((item) => `<div class="mw-mr-delta__row is-${item.kind}"><span class="mw-mr-delta__tile" aria-hidden="true">${icon(item.glyph)}</span><span class="mw-mr-delta__copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span></div>`).join("");
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

export function renderCodingRoundMaterials(options: {
  readonly title: string;
  readonly summaryLabel: string;
  readonly summaryTone: MwStatusTone;
  readonly items: readonly MwCodingRoundMaterialItem[];
  readonly footer?: { readonly title: string; readonly detail: string };
  readonly attrs?: Record<string, AttrValue>;
}): string {
  const rows = options.items.map((item) => `<div class="mw-rec-row">${renderStateRing({ state: item.state })}<span class="mw-rec-row__mrow"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.how)}</span></span>${renderStatusMark({ label: item.statusLabel, tone: item.statusTone, icon: item.statusIcon, plain: true })}</div>`).join("");
  const foot = options.footer
    ? `<div class="mw-rec-list__foot"><b>${escapeHtml(options.footer.title)}</b><span>${escapeHtml(options.footer.detail)}</span></div>`
    : "";
  return `<div class="mw-rec-list" data-slot="coding-round-materials"${renderAttrs(options.attrs)}><div class="mw-rec-list__head"><span class="mw-rec-grow">${icon("file")}<span>${escapeHtml(options.title)}</span></span>${renderStatusMark({ label: options.summaryLabel, tone: options.summaryTone, plain: true })}</div>${rows}${foot}</div>`;
}

export function recoverySections(): string {
  const envChecklist = renderEnvChecklist({
    title: "本轮准备",
    statusLabel: "可开始 · 1 项改之前就有",
    statusTone: "done",
    statusIcon: "status-done",
    rows: [
      { state: "done", label: "工作区与改动", value: "独立工作树 worktrees/round-4 · 你的 2 处未提交改动留在原目录", status: { label: "已隔离", tone: "done" } },
      { state: "done", label: "依赖与端口", value: "3000 被你开着的服务占用，本轮改用 3001", status: { label: "已让开", tone: "done" } },
      { state: "waiting", label: "开始前的测试", value: "tests/csv-export.test.ts 本来就失败，不拦本轮", badge: { label: "改之前就有", tone: "neutral" } },
    ],
    footer: { title: "结束时已收拾", detail: "停掉 3001 上的临时服务 · 删掉临时工作树 · 你的原目录没动" },
  });

  const attemptBudget = renderTaskAttemptBudget({
    attempt: 2,
    maxAttempts: 3,
    budgetPercent: 86,
    retryReasonLabel: "验证没过",
    retryReasonTone: "warning",
    summaryText: "第 1 次改完后过期会话 cookie 仍返回 401；这一轮只补 signCookie 的空值校验分支。",
    pastAttempts: [{ state: "blocked", text: "第 1 次 · 验证没过：tests/session.test.ts 退出码 1" }],
    actions: [{ label: "再给 3 次", variant: "secondary" }],
  });

  const reportCard = renderRoundReportCard({
    statusLabel: "已完成并验证",
    statusTone: "done",
    statusIcon: "status-done",
    finishedAtLabel: "本轮结束 · 14:32",
    delivered: [
      { state: "done", text: "更新 src/auth/cookie.ts、tests/session.test.ts（2 个文件，+42 −9）" },
    ],
    verified: [
      { state: "done", text: "pnpm test tests/session.test.ts（18 个用例通过，在最后一次改文件之后跑）", codeRevision: "a18c4f2 · 14:32", status: { label: "通过", tone: "done" } },
    ],
    remaining: [
      { state: "idle", text: "tests/csv-export.test.ts 仍失败", quiet: true, badge: { label: "改之前就有", tone: "neutral" } },
    ],
    actions: [
      { label: "接受这一轮", variant: "primary", icon: "check" },
      { label: "现在重跑测试", variant: "secondary", icon: "refresh" },
    ],
  });

  const funnel = renderMaterialsFunnel([
    { label: "发现", value: 18 },
    { label: "选中", value: 11 },
    { label: "读好", value: 9 },
    { label: "用到摘要", value: 8 },
    { label: "带进项目", value: 8 },
  ]);
  const trackRows = `<ul class="mw-file-list is-receipts">${
    renderFileRow({
      name: "首版功能范围.md",
      size: "12 KB",
      state: renderMaterialsTrack({ step: 5, label: "已带入", title: "发现 → 选中 → 读好 → 用到摘要 → 带进项目" }),
      check: { checked: true },
    })
    + renderFileRow({
      name: ".env.local",
      size: "2 KB",
      state: renderMaterialsTrack({ step: 2, stopAt: 3, label: "等你决定", title: "在「读好」这一步停住：含疑似密钥" }),
      check: { checked: true },
      className: "is-issue",
    })
    + renderMaterialIssueRow({
      reason: "检测到 API_KEY、DATABASE_URL 等 4 项疑似密钥，默认已拦截，不会把原值发给模型。",
      actions: [
        { label: "只发变量名（推荐）", variant: "primary" },
        { label: "不发这份", variant: "secondary" },
        { label: "原样发送", variant: "ghost" },
      ],
    })
  }</ul>`;

  const scopeDelta = renderScopeDeltaCard({
    title: "这次只做这些",
    subtitle: "其余 8 份材料直接复用",
    items: [
      { kind: "add", glyph: "plus", title: "新加 2 份并要读", detail: "接口速率限制说明.md、迁移步骤.txt" },
      { kind: "rem", glyph: "x", title: "移出 1 份", detail: "旧版会议纪要.docx 从摘要依据里拿掉" },
      { kind: "keep", glyph: "check", title: "保留 8 份直接复用", detail: "已读内容不重读" },
      { kind: "redo", glyph: "refresh", title: "重写右侧摘要", detail: "换用 Gemini 2.5 Pro 重新生成" },
    ],
  });

  const roundMaterials = renderCodingRoundMaterials({
    title: "材料 · 34 份",
    summaryLabel: "已读 30 份 · 4 份要时再读",
    summaryTone: "done",
    items: [
      { state: "done", name: "首版功能范围.md", how: "12 KB · 修订 #r8", statusLabel: "全文", statusTone: "done" },
      { state: "done", name: "架构与接口长文.md", how: "148 KB · 修订 #r4", statusLabel: "先读前 12,000 字，要时接着读", statusTone: "progress" },
      { state: "waiting", name: "迁移计划.md", how: "本轮开始后被改过 · 仍锁在 #r2", statusLabel: "用开始时的版本", statusTone: "attention" },
    ],
    footer: { title: "另有 4 份未预读", detail: "已放进本轮目录，模型需要时按开始时的版本读取" },
  });

  return section("recovery-closures", "恢复与核对 / Recovery & verification", `<div class="mw-catalog__specimens">
    ${mark("env-checklist", specimen("准备清单的行 · 检查项、结果与「改之前就有」", envChecklist))}
    ${mark("task-attempt-budget", specimen("任务卡上的尝试与额度条 · 超过 85% 变琥珀色", attemptBudget))}
    ${mark("round-report-card", specimen("结尾报告卡与代码版本号 · 三小节与提交号", reportCard))}
    ${mark("materials-funnel-track", specimen("五格进度与一排五个数 · 材料漏斗与原处补救", `<div style="display:grid;gap:10px">${funnel}${trackRows}</div>`))}
    ${mark("scope-delta-card", specimen("「这次只做这些」卡 · 范围或模型变化时的增量说明", scopeDelta))}
    ${mark("coding-round-materials", specimen("Coding 一轮里的材料清单 · 全文、分段、版本固定与按需读", roundMaterials))}
  </div>`);
}
