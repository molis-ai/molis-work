// The component board's parts for Batch 33 (Coding environment & recovery, and materials verification & scope/model recovery):
// decided in docs/design/coding-env-recovery/README.md (A/A/A/A) and docs/design/materials-recovery/README.md (B/A/A).
// Markup builders live in `@molis-ai/molis-work-plugin-sdk/ui` so Coding, Workbench onboarding, and the component board draw one source of truth.
import {
  renderCodingRoundMaterials,
  renderEnvChecklist,
  renderEnvCheckRow,
  renderMaterialIssueRow,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderRoundReportCard,
  renderScopeDeltaCard,
  renderTaskAttemptBudget,
  t,
  type MwBadgeTone,
  type MwCodingRoundMaterialItem,
  type MwCodingRoundMaterialsOptions,
  type MwEnvChecklistOptions,
  type MwEnvCheckRowOptions,
  type MwInlineRecoveryBlock,
  type MwMaterialIssueRowOptions,
  type MwMaterialsTrackOptions,
  type MwRoundReportCardOptions,
  type MwRoundReportCheck,
  type MwScopeDeltaCardOptions,
  type MwScopeDeltaItem,
  type MwTaskAttemptBudgetOptions,
} from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderFileRow } from "./arrival.js";
import type { Say } from "./catalog-composer.js";
import { mark, section, specimen } from "./catalog-parts.js";

export {
  renderCodingRoundMaterials,
  renderEnvChecklist,
  renderEnvCheckRow,
  renderMaterialIssueRow,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderRoundReportCard,
  renderScopeDeltaCard,
  renderTaskAttemptBudget,
  type MwBadgeTone,
  type MwCodingRoundMaterialItem,
  type MwCodingRoundMaterialsOptions,
  type MwEnvChecklistOptions,
  type MwEnvCheckRowOptions,
  type MwInlineRecoveryBlock,
  type MwMaterialIssueRowOptions,
  type MwMaterialsTrackOptions,
  type MwRoundReportCardOptions,
  type MwRoundReportCheck,
  type MwScopeDeltaCardOptions,
  type MwScopeDeltaItem,
  type MwTaskAttemptBudgetOptions,
};

// 1 · Environment checklist & round materials list; 2 · Task card attempt & budget strip; 3 · Round report card & code revision badge.
export const RECOVERY_STAGE_PARTS_STYLES = `
.mw-rec-list,.mw-attempt,.mw-report-card{border-radius:var(--r-card,12px);background:var(--paper);box-shadow:0 0 0 1px color-mix(in srgb,var(--ink) 6%,transparent),var(--shadow-soft);min-width:0}
.mw-rec-list{overflow:hidden}
.mw-rec-list__head,.mw-rec-row,.mw-rec-list__foot,.mw-attempt__line,.mw-attempt summary,.mw-attempt__past,.mw-attempt__acts,.mw-report-card__head,.mw-report-card__chk{display:flex;align-items:center;min-width:0}
.mw-rec-list__head,.mw-rec-list__foot,.mw-attempt,.mw-report-card__head,.mw-report-card h3,.mw-rec-row__kv>span,.mw-rec-row__mrow>span{font-size:12px;color:var(--muted)}
.mw-rec-list__head,.mw-rec-row__kv>b,.mw-rec-row__mrow>b,.mw-rec-list__foot>b,.mw-report-card h3{font-weight:var(--weight-control,500)}
.mw-rec-list__head>.mw-rec-grow,.mw-rec-row__kv,.mw-rec-row__kv>span,.mw-rec-row__mrow,.mw-rec-row__mrow>span,.mw-rec-list__foot>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-rec-list__head>.mw-rec-grow,.mw-rec-row__kv,.mw-rec-row__mrow,.mw-attempt__line>.mw-rec-grow,.mw-report-card__head>.mw-rec-grow{flex:1;min-width:0}
.mw-rec-row,.mw-rec-recovery,.mw-rec-list__foot,.mw-report-card>section{box-shadow:inset 0 1px 0 var(--line);min-width:0}
.mw-attempt__why,.mw-attempt__past,.mw-report-card__chk>.mw-rec-grow{overflow-wrap:anywhere}
.mw-rec-list__head{gap:8px;min-height:40px;padding:0 12px 0 16px}
.mw-rec-list__head>.mw-rec-grow,.mw-rec-row__mrow{display:flex;align-items:center;gap:8px}
.mw-rec-row{gap:12px;min-height:40px;padding:4px 12px 4px 16px}
.mw-rec-row>.mw-state-ring{flex:none}
.mw-rec-row__kv{display:flex;align-items:baseline;gap:12px}
.mw-rec-row__kv>b{flex:none;width:96px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis}
.mw-rec-row__mrow>b{flex:0 1 auto;max-width:55%;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
.mw-rec-recovery{padding:8px 12px 12px 16px;background:var(--surface-soft)}
.mw-rec-list__foot{flex-wrap:wrap;gap:8px;min-height:40px;padding:6px 16px}
.mw-rec-list__foot>b{color:var(--ink-soft)}
.mw-rec-list__foot>span{flex:1 1 14em}
.mw-attempt{display:grid;gap:8px;padding:8px 12px 12px}
.mw-attempt__line{flex-wrap:wrap;gap:6px;color:var(--ink-soft);font-variant-numeric:tabular-nums}
.mw-attempt__meter{height:4px;border-radius:999px;background:var(--rail);overflow:hidden;display:flex}
.mw-attempt__meter>i{display:block;height:100%;background:var(--green);transition:width var(--dur-arrive,420ms) var(--ease-quint)}
.mw-attempt__meter>i.is-hot{background:var(--amber)}
.mw-attempt__why{line-height:1.5}
.mw-attempt summary{min-height:32px;cursor:pointer}
.mw-attempt__past{gap:6px;padding-top:4px}
.mw-attempt__acts,.mw-report-card__acts{display:flex;flex-wrap:wrap;gap:8px}
.mw-report-card{display:grid;gap:4px;padding:8px 16px 16px}
.mw-report-card.is-accepted{box-shadow:0 0 0 1px color-mix(in srgb,var(--green) 40%,transparent),var(--shadow-soft)}
.mw-report-card__head{flex-wrap:wrap;gap:8px;min-height:40px}
.mw-report-card>section{display:grid;gap:2px;padding:8px 0 4px}
.mw-report-card h3{margin:0 0 4px}
.mw-report-card__chk{flex-wrap:wrap;gap:8px;min-height:32px;font-size:13px;color:var(--ink-soft)}
.mw-report-card__chk>.mw-rec-grow{flex:1 1 12em;min-width:0}
.mw-report-card__chk.is-quiet{color:var(--muted)}
.mw-report-card__ver{display:inline-flex;align-items:center;gap:4px;flex:none;font:500 11px var(--font-mono);color:var(--muted);font-variant-numeric:tabular-nums}
.mw-report-card__ver>svg{width:12px;height:12px}
.mw-report-card__acts{padding-top:8px}
@media (max-width:760px){.mw-rec-row__kv>b{width:72px}}
@media (prefers-reduced-motion:reduce){.mw-attempt__meter>i{transition:none}}
`;

// 4 · Materials 5-number funnel, 5-cell progress track & issue reason row (materials-recovery B); 5 · Scope & model delta card (materials-recovery A).
export const MATERIALS_RECOVERY_PARTS_STYLES = `
.mw-file-kind--env{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)}
.mw-file-kind--txt{color:var(--mark-text,var(--ink-soft))}
.mw-mr-funnel>li>b,.mw-mr-funnel>li>span,.mw-mr-delta__copy>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-mr-cells,.mw-mr-why,.mw-mr-delta__head,.mw-mr-delta__row{font-size:12px}
.mw-mr-why,.mw-mr-delta__head,.mw-mr-delta__row{display:flex;align-items:center;gap:8px;min-width:0}
.mw-mr-funnel{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:8px 10px;border-radius:var(--r-row,10px);background:var(--surface-soft);margin:0;list-style:none}
.mw-mr-funnel>li{display:grid;gap:2px;min-width:0;padding:4px 6px;border-radius:var(--r-tag,6px);font-size:11px;color:var(--muted)}
.mw-mr-funnel>li>b{font-size:15px;font-weight:var(--weight-title,600);color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.2}
.mw-mr-cells,.mw-mr-track{display:inline-flex;align-items:center}
.mw-mr-cells{gap:8px;color:var(--muted);white-space:nowrap}
.mw-mr-track{gap:3px}
.mw-mr-track>i{width:8px;height:4px;border-radius:2px;background:var(--line-strong);transition:background-color var(--dur-move,250ms) var(--ease-quint)}
.mw-mr-track>i.is-on{background:var(--green)}
.mw-mr-track>i.is-stop{background:var(--amber)}
.mw-mr-track.is-err>i.is-stop{background:var(--red)}
.mw-mr-why{list-style:none;flex-wrap:wrap;gap:6px 10px;margin:-1px 0 4px;padding:2px 8px 8px 40px;border-radius:0 0 var(--r-row,10px) var(--r-row,10px);background:color-mix(in srgb,var(--amber) 8%,transparent);color:var(--ink-soft);line-height:1.5}
.mw-mr-why.is-err{color:var(--red)}
.mw-mr-why>span{flex:1 1 12em;min-width:0;overflow-wrap:anywhere}
.mw-mr-why__acts{display:inline-flex;flex-wrap:wrap;gap:6px}
.mw-mr-delta{display:grid;gap:6px;padding:10px 12px;border-radius:var(--r-card,12px);background:var(--surface-soft);box-shadow:inset 0 0 0 1px var(--line);min-width:0}
.mw-mr-delta__head{justify-content:space-between;font-weight:var(--weight-title,600);color:var(--ink)}
.mw-mr-delta__head>small{font-weight:var(--weight-body,400);color:var(--muted)}
.mw-mr-delta__row{min-height:26px;color:var(--ink-soft)}
.mw-mr-delta__tile{width:20px;height:20px;border-radius:var(--r-tag,6px);display:grid;place-items:center;flex:none;background:var(--rail);color:var(--ink-soft)}
.mw-mr-delta__tile>svg{width:12px;height:12px}
.mw-mr-delta__row.is-add .mw-mr-delta__tile,.mw-mr-delta__row.is-redo .mw-mr-delta__tile{background:var(--accent-soft);color:var(--accent-strong)}
.mw-mr-delta__row.is-rem .mw-mr-delta__tile{background:var(--amber-soft);color:var(--amber)}
.mw-mr-delta__row.is-keep .mw-mr-delta__tile{background:var(--green-soft);color:var(--green)}
.mw-mr-delta__copy{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.mw-mr-delta__copy>b{font-weight:var(--weight-control,500);color:var(--ink);overflow-wrap:anywhere}
.mw-mr-delta__copy>small{color:var(--muted);max-width:100%}
@media (max-width:760px){.mw-mr-funnel{grid-template-columns:repeat(3,minmax(0,1fr))}.mw-mr-why{padding-left:8px}}
@media (max-width:560px){.mw-mr-cells{gap:4px}.mw-mr-cells .mw-mr-track>i{width:5px}.mw-mr-cells .mw-status{min-width:0;padding-inline:4px}}
@media (max-width:380px){.mw-mr-cells .mw-mr-track{display:none}}
@media (prefers-reduced-motion:reduce){.mw-mr-track>i{transition:none}}
`;

export const RECOVERY_PARTS_STYLES = `${RECOVERY_STAGE_PARTS_STYLES}${MATERIALS_RECOVERY_PARTS_STYLES}`;

export const RECOVERY_BOARD_STYLES = RECOVERY_PARTS_STYLES + `
  #recovery-closures .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); align-items: start; }
  #recovery-closures .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
`;

export function recoverySections(say: Say = t): string {
  const c = (key: string, values?: Record<string, string | number>) => say(`workbench.catalog-recovery.${key}`, values);
  const envChecklist = renderEnvChecklist({
    title: c("env-title"),
    statusLabel: c("env-status"),
    statusTone: "done",
    statusIcon: "status-done",
    rows: [
      { state: "done", label: c("env-row-worktree-label"), value: c("env-row-worktree-value"), status: { label: c("env-row-worktree-status"), tone: "done" } },
      { state: "done", label: c("env-row-port-label"), value: c("env-row-port-value"), status: { label: c("env-row-port-status"), tone: "done" } },
      { state: "waiting", label: c("env-row-baseline-label"), value: c("env-row-baseline-value"), badge: { label: c("preexisting-badge"), tone: "neutral" } },
    ],
    footer: { title: c("env-footer-title"), detail: c("env-footer-detail") },
  });

  const attemptBudget = renderTaskAttemptBudget({
    headerText: c("attempt-header", { attempt: 2, max: 3, pct: 86 }),
    budgetPercent: 86,
    meterLabel: c("attempt-meter-label", { pct: 86 }),
    retryReasonLabel: c("attempt-retry-reason"),
    retryReasonTone: "warning",
    summaryText: c("attempt-summary"),
    pastSummaryLabel: c("attempt-past-summary", { n: 1 }),
    pastAttempts: [{ state: "blocked", text: c("attempt-past-item") }],
    actions: [{ label: c("attempt-extend-action"), variant: "secondary" }],
  });

  const reportCard = renderRoundReportCard({
    statusLabel: c("report-status"),
    statusTone: "done",
    statusIcon: "status-done",
    finishedAtLabel: c("report-finished-at"),
    headings: {
      delivered: c("report-heading-delivered"),
      verified: c("report-heading-verified"),
      remaining: c("report-heading-remaining"),
    },
    codeRevisionTitle: c("report-revision-title"),
    delivered: [
      { state: "done", text: c("report-delivered-row") },
    ],
    verified: [
      { state: "done", text: c("report-verified-row"), codeRevision: "a18c4f2 · 14:32", status: { label: c("report-verified-status"), tone: "done" } },
    ],
    remaining: [
      { state: "idle", text: c("report-remaining-row"), quiet: true, badge: { label: c("preexisting-badge"), tone: "neutral" } },
    ],
    actions: [
      { label: c("report-accept-action"), variant: "primary", icon: "check" },
      { label: c("report-rerun-action"), variant: "secondary", icon: "refresh" },
    ],
  });

  const funnel = renderMaterialsFunnel([
    { label: c("funnel-discovered"), value: 18 },
    { label: c("funnel-selected"), value: 11 },
    { label: c("funnel-read"), value: 9 },
    { label: c("funnel-used"), value: 8 },
    { label: c("funnel-adopted"), value: 8 },
  ], c("funnel-aria"));
  const trackRows = `<ul class="mw-file-list is-receipts">${
    renderFileRow({
      name: c("track-doc-name"),
      size: "12 KB",
      state: renderMaterialsTrack({ step: 5, label: c("track-doc-state"), tone: "done", ariaLabel: c("track-doc-aria"), title: c("track-doc-title") }),
      check: { checked: true },
    })
    + renderFileRow({
      name: ".env.local",
      size: "2 KB",
      state: renderMaterialsTrack({ step: 2, stopAt: 3, label: c("track-env-state"), tone: "attention", ariaLabel: c("track-env-aria"), title: c("track-env-title") }),
      check: { checked: true },
      className: "is-issue",
    })
    + renderMaterialIssueRow({
      reason: c("track-env-reason"),
      actions: [
        { label: c("track-env-strip"), variant: "primary" },
        { label: c("track-env-exclude"), variant: "secondary" },
        { label: c("track-env-raw"), variant: "ghost" },
      ],
    })
  }</ul>`;

  const scopeDelta = renderScopeDeltaCard({
    title: c("delta-title"),
    subtitle: c("delta-subtitle"),
    items: [
      { kind: "add", glyph: "plus", title: c("delta-add-title"), detail: c("delta-add-detail") },
      { kind: "rem", glyph: "x", title: c("delta-rem-title"), detail: c("delta-rem-detail") },
      { kind: "keep", glyph: "check", title: c("delta-keep-title"), detail: c("delta-keep-detail") },
      { kind: "redo", glyph: "refresh", title: c("delta-redo-title"), detail: c("delta-redo-detail") },
    ],
  });

  const roundMaterials = renderCodingRoundMaterials({
    title: c("materials-title"),
    summaryLabel: c("materials-summary"),
    summaryTone: "done",
    items: [
      { state: "done", name: c("materials-item-1-name"), how: c("materials-item-1-how"), statusLabel: c("materials-item-1-status"), statusTone: "done" },
      { state: "done", name: c("materials-item-2-name"), how: c("materials-item-2-how"), statusLabel: c("materials-item-2-status"), statusTone: "progress" },
      { state: "waiting", name: c("materials-item-3-name"), how: c("materials-item-3-how"), statusLabel: c("materials-item-3-status"), statusTone: "attention" },
    ],
    footer: { title: c("materials-footer-title"), detail: c("materials-footer-detail") },
  });

  return section("recovery-closures", c("section-title"), `<div class="mw-catalog__specimens">
    ${mark("env-checklist", specimen(c("specimen-env"), envChecklist))}
    ${mark("task-attempt-budget", specimen(c("specimen-attempt"), attemptBudget))}
    ${mark("round-report-card", specimen(c("specimen-report"), reportCard))}
    ${mark("materials-funnel-track", specimen(c("specimen-funnel"), `<div style="display:grid;gap:10px">${funnel}${trackRows}</div>`))}
    ${mark("scope-delta-card", specimen(c("specimen-delta"), scopeDelta))}
    ${mark("coding-round-materials", specimen(c("specimen-materials"), roundMaterials))}
  </div>`);
}
