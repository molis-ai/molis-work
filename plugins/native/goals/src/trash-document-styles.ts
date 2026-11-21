export const TRASH_GOAL_STYLES = String.raw`
  .goal-document.trash-goal-document .trash-goal-hero { padding-bottom: 32px; }
  .goal-document.trash-goal-document .goal-header { padding-bottom: 0; }
  .goal-document.trash-goal-document .goal-title-kicker { align-items: center; gap: 12px; }
  .goal-document.trash-goal-document .goal-title-kicker .goal-status {
    flex: 0 0 auto;
    align-self: flex-start;
    min-height: 26px;
    margin: 0;
    padding: 4px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
  }
  .goal-document.trash-goal-document .trash-goal-facts {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--muted);
    font-size: 11px;
  }
  .goal-document.trash-goal-document .trash-goal-facts > div { min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
  .goal-document.trash-goal-document .trash-goal-facts svg { width: 12px; height: 12px; color: var(--faint); }
  .goal-document.trash-goal-document .trash-goal-facts dt { color: var(--faint); }
  .goal-document.trash-goal-document .trash-goal-facts dd { margin: 0; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .goal-document.trash-goal-document .trash-goal-workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 16px;
  }
  .goal-document.trash-goal-document .trash-goal-panel {
    min-width: 0;
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
  }
  .goal-document.trash-goal-document .trash-goal-panel--state { grid-column: 1 / -1; }
  .goal-document.trash-goal-document .trash-goal-panel .section-heading { margin-bottom: 16px; }
  .goal-document.trash-goal-document .trash-goal-panel .section-heading > span { color: var(--muted); }
  .goal-document.trash-goal-document .trash-goal-panel .section-heading h2 { color: var(--ink); font-size: 15px; }
  .goal-document.trash-goal-document .trash-goal-panel .section-heading p { max-width: 62ch; color: var(--muted); line-height: 1.5; }
  .goal-document.trash-goal-document .trash-goal-panel .trash-summary,
  .goal-document.trash-goal-document .trash-goal-panel .business-copy,
  .goal-document.trash-goal-document .trash-goal-panel .trash-restore-row { margin: 0; padding: 0; color: var(--ink-soft); }
  .goal-document.trash-goal-document .trash-goal-panel .trash-summary p,
  .goal-document.trash-goal-document .trash-goal-panel .business-copy p,
  .goal-document.trash-goal-document .trash-goal-panel .trash-restore-row p { max-width: 68ch; margin: 0; line-height: 1.65; }
  .goal-document.trash-goal-document .trash-goal-panel .trash-summary p + p,
  .goal-document.trash-goal-document .trash-goal-panel .business-copy p + p { margin-top: 12px; }
  .goal-document.trash-goal-document .trash-goal-panel .trash-summary strong { display: block; margin-bottom: 4px; color: var(--ink); }
  .goal-document.trash-goal-document .trash-goal-panel .business-copy strong {
    display: block;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: var(--weight-control, 500);
  }
  .goal-document.trash-goal-document .trash-goal-panel .business-copy .outcome { color: var(--ink-soft); }
  .goal-document.trash-goal-document .trash-goal-panel .trash-restore-row { display: grid; align-content: start; justify-items: start; gap: 16px; }
  .goal-document.trash-goal-document .trash-goal-panel .trash-restore-row .mw-btn--primary { min-height: 40px; margin: 0; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-hero,
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-workspace {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-hero { padding: 16px 8px 4px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-workspace { padding: 8px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-row { gap: 12px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-actions .mw-btn { min-height: 28px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document { width: 100%; gap: 12px; padding-inline: 12px; padding-bottom: 32px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-header { padding-inline: 4px; padding-bottom: 12px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-kicker { min-height: 26px; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-kicker .goal-status { padding-inline: 8px; gap: 8px; background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper)); }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .goal-title-row h1 { max-width: 34ch; line-height: 1.18; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-workspace { min-height: max(420px, calc(100dvh - 340px)); }
    body[data-desktop-shell="true"] .goal-document.trash-goal-document .trash-goal-panel {
      border: 0;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
  }

  @media (max-width: 760px) {
    .goal-document.trash-goal-document .trash-goal-hero { padding: 24px 16px 24px; }
    .goal-document.trash-goal-document .goal-title-kicker { align-items: flex-start; flex-direction: column; gap: 8px; }
    .goal-document.trash-goal-document .trash-goal-facts { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .goal-document.trash-goal-document .goal-title-row { display: grid; gap: 12px; }
    .goal-document.trash-goal-document .goal-title-actions { justify-content: flex-start; }
    .goal-document.trash-goal-document .goal-title-actions .mw-btn { min-height: 44px; }
    .goal-document.trash-goal-document .trash-goal-workspace { padding: 16px; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .goal-document.trash-goal-document .trash-goal-panel,
    .goal-document.trash-goal-document .trash-goal-panel--state { grid-column: 1; padding: 16px; }
    .goal-document.trash-goal-document .trash-goal-panel .trash-restore-row .mw-btn--primary { min-height: 44px; white-space: normal; }
    .goal-document.trash-goal-document .trash-summary, .goal-document.trash-goal-document .trash-restore-row { margin-left: 0; }
    .goal-document.trash-goal-document .trash-restore-row { align-items: stretch; flex-direction: column; }
    .goal-document.trash-goal-document .trash-restore-row .mw-btn { align-self: flex-start; }
  }
`;
