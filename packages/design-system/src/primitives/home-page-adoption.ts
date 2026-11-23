// The three parts for generated-page side-by-side adoption (docs/design/generated-page-adoption/README.md「组件板新增」, Plan B
// confirmed 2026-11-04 & re-verified on 36A's First Page 2026-11-23):
//   1. Compare adopt bar (`mw-compare-adopt-bar`): sticky decision footer under side-by-side current/draft panes.
//   2. Check summary (`mw-check-summary`): clickable status mark button opening a check-detail popover.
//   3. Edit conflict (`mw-edit-conflict`): field-level manual-edit vs new-draft comparison with three choices (keep / use new / merge).
// One set of rules and renderers shared by `/__ui/catalog`, `docs/design/kit/`, and the workbench's First Page. Browser-safe:
// `@molis-ai/molis-work-design-system/home-page-adoption`.
import {
  cx,
  escapeHtml,
  icon,
  renderAlert,
  renderAttrs,
  renderButton,
  renderPopover,
  renderStateRing,
  renderStatusMark,
  type AttrValue,
  type MwButtonOptions,
  type MwStatusTone,
  type StateRingState,
} from "@molis-ai/molis-work-plugin-sdk/ui";

export const HOME_PAGE_ADOPTION_STYLES = `
  /* 1 · Compare adopt bar: pinned to the bottom of side-by-side comparison panes, holding the check summary on the start and the
     discard / single primary adopt action on the end. Translucent paper keeps scroll depth legible without competing with the panes. */
  .mw-compare-adopt-bar {
    position: sticky; bottom: 0; z-index: 12;
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-width: 0;
    padding: 10px 16px; border-top: 1px solid var(--line);
    background: color-mix(in srgb, var(--paper) 94%, transparent);
    backdrop-filter: blur(10px);
  }
  .mw-compare-adopt-bar__summary { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .mw-compare-adopt-bar__spacer { flex: 1 1 auto; min-width: 8px; }
  .mw-compare-adopt-bar__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }

  /* 2 · Check summary: a clickable status mark carrying a disclosure chevron, paired with an anchored popover listing every check. */
  .mw-check-summary { position: relative; display: inline-flex; align-items: center; min-width: 0; }
  .mw-check-summary__trigger {
    appearance: none; display: inline-flex; align-items: center; gap: 6px; min-width: 0; min-height: 30px;
    padding: 0 8px 0 6px; border: 1px solid var(--line); border-radius: var(--r-control, 8px);
    background: var(--paper); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer;
    transition: border-color var(--dur-hover, 130ms) var(--ease-quint), background-color var(--dur-hover, 130ms) var(--ease-quint);
  }
  .mw-check-summary__trigger:hover { border-color: var(--line-strong); background: var(--nav-hover); }
  .mw-check-summary__trigger:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  .mw-check-summary__trigger > .mw-status { pointer-events: none; }
  .mw-check-summary__chevron { display: inline-flex; flex: none; color: var(--muted); transition: transform var(--dur-move, 250ms) var(--ease-quint); }
  .mw-check-summary__chevron > svg { width: 14px; height: 14px; }
  .mw-check-summary__trigger[aria-expanded="true"] .mw-check-summary__chevron { transform: rotate(180deg); }
  .mw-check-summary__popover {
    position: absolute; left: 0; top: calc(100% + 6px); z-index: 20;
    width: min(360px, calc(100vw - 32px)); padding: 12px;
  }
  .mw-check-summary[data-placement="up"] .mw-check-summary__popover { top: auto; bottom: calc(100% + 6px); }
  .mw-check-summary__popover[hidden] { display: none; }
  .mw-check-summary__list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .mw-check-summary__item { display: flex; align-items: flex-start; gap: 8px; min-width: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.5; }
  .mw-check-summary__item > .mw-state-ring { flex: none; margin-top: 3px; }
  .mw-check-summary__item > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }

  /* 3 · Edit conflict: field-level comparison between a manual edit and a new draft, with amber "waits on you" framing, two cards
     (yours vs new version), three resolution buttons, and a quiet confirmation line once chosen. */
  .mw-edit-conflict { container: mw-edit-conflict / inline-size; display: grid; gap: 8px; min-width: 0; }
  .mw-edit-conflict > .mw-alert { margin: 0; }
  .mw-edit-conflict__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-width: 0; }
  .mw-edit-conflict__side {
    display: grid; gap: 2px; min-width: 0; padding: 8px 12px;
    border: 1px solid var(--line); border-radius: var(--r-control, 8px); background: var(--paper);
  }
  .mw-edit-conflict__side--mine { border-color: color-mix(in srgb, var(--amber) 35%, var(--line)); background: var(--amber-soft); }
  .mw-edit-conflict__side > small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .mw-edit-conflict__side > strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.45; overflow-wrap: anywhere; }
  .mw-edit-conflict__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .mw-edit-conflict__resolved {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; min-width: 0;
    margin: 0; padding: 8px 12px; border-radius: var(--r-control, 8px); background: var(--surface-soft);
    color: var(--ink-soft); font-size: 13px; line-height: 1.5;
  }
  .mw-edit-conflict__resolved > svg { width: 14px; height: 14px; flex: none; color: var(--tone-done); }
  .mw-edit-conflict__resolved > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  @container mw-edit-conflict (max-width: 360px) {
    .mw-edit-conflict__pair { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 760px), (pointer: coarse) {
    .mw-check-summary__trigger { min-height: 44px; padding-inline: 10px; }
  }
  @media (forced-colors: active) {
    .mw-edit-conflict__side--mine, .mw-edit-conflict__resolved { border: 1px solid transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-check-summary__trigger, .mw-check-summary__chevron { transition: none; }
  }
`;

/** One check item displayed inside `renderCheckSummary`'s expandable detail popover. */
export interface CheckSummaryItem {
  readonly state: StateRingState;
  readonly text: string;
}

/**
 * 2 · Check summary: a clickable status mark opening all checks for a generated page draft.
 * `placement: "up"` opens the popover above the trigger (used inside the bottom-pinned compare adopt bar).
 */
export function renderCheckSummary(options: {
  id: string;
  label: string;
  tone: MwStatusTone;
  state: StateRingState;
  items: readonly CheckSummaryItem[];
  open?: boolean;
  placement?: "up" | "down";
  className?: string;
  triggerAttrs?: Record<string, AttrValue>;
}): string {
  const open = options.open === true;
  const placement = options.placement ?? "up";
  const chevron = placement === "up" ? "chevron-up" : "chevron-down";
  const rows = options.items
    .map((item) => `<li class="mw-check-summary__item">${renderStateRing({ state: item.state })}<span>${escapeHtml(item.text)}</span></li>`)
    .join("");
  const popover = renderPopover({
    preview: true,
    className: "mw-check-summary__popover",
    attrs: { id: options.id, hidden: !open, "data-check-summary-popover": true },
    body: `<ul class="mw-check-summary__list">${rows}</ul>`,
  });
  return `<span class="${cx("mw-check-summary", options.className)}" data-slot="check-summary" data-placement="${placement}"><button type="button" class="mw-check-summary__trigger" aria-expanded="${open}" aria-controls="${escapeHtml(options.id)}" data-check-summary-toggle="${escapeHtml(options.id)}"${renderAttrs(options.triggerAttrs)}>${renderStatusMark({ label: options.label, tone: options.tone, state: options.state })}<span class="mw-check-summary__chevron" aria-hidden="true">${icon(chevron)}</span></button>${popover}</span>`;
}

/**
 * 1 · Compare adopt bar: sticky footer pinned beneath side-by-side current & draft columns.
 * Holds the check summary on the start, and secondary actions + the single primary adopt button on the end.
 */
export function renderCompareAdoptBar(options: {
  summary: string;
  actions?: string;
  primary: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<div class="${cx("mw-compare-adopt-bar", options.className)}" data-slot="compare-adopt-bar"${renderAttrs(options.attrs)}><div class="mw-compare-adopt-bar__summary">${options.summary}</div><span class="mw-compare-adopt-bar__spacer" aria-hidden="true"></span><div class="mw-compare-adopt-bar__actions">${options.actions ?? ""}${options.primary}</div></div>`;
}

/**
 * 3 · Edit conflict: field-level comparison between what the person changed and what a new draft changes.
 * When `resolved` is supplied, collapses into a quiet confirmation line with an inline action to change the choice.
 */
export function renderEditConflict(options: {
  title: string;
  body?: string;
  mineLabel: string;
  mineValue: string;
  nextLabel: string;
  nextValue: string;
  choices?: readonly MwButtonOptions[];
  resolved?: {
    readonly text: string;
    readonly changeLabel: string;
    readonly changeAttrs?: Record<string, AttrValue>;
  };
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  if (options.resolved) {
    return `<div class="${cx("mw-edit-conflict", options.className)}" data-slot="edit-conflict" data-state="resolved"${renderAttrs(options.attrs)}><p class="mw-edit-conflict__resolved">${icon("check")}<span>${escapeHtml(options.resolved.text)}</span>${renderButton({ label: options.resolved.changeLabel, variant: "link", size: "sm", attrs: options.resolved.changeAttrs })}</p></div>`;
  }
  const choices = (options.choices ?? [])
    .map((choice) => renderButton({ size: "sm", ...choice }))
    .join("");
  return `<div class="${cx("mw-edit-conflict", options.className)}" data-slot="edit-conflict" data-state="pending"${renderAttrs(options.attrs)}>${renderAlert({ tone: "warning", title: options.title, body: options.body })}<div class="mw-edit-conflict__pair"><div class="mw-edit-conflict__side mw-edit-conflict__side--mine"><small>${escapeHtml(options.mineLabel)}</small><strong>${escapeHtml(options.mineValue)}</strong></div><div class="mw-edit-conflict__side"><small>${escapeHtml(options.nextLabel)}</small><strong>${escapeHtml(options.nextValue)}</strong></div></div>${choices ? `<div class="mw-edit-conflict__actions">${choices}</div>` : ""}</div>`;
}
