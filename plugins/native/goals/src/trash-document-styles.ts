export const TRASH_GOAL_STYLES = String.raw`
  .trash-goal-document .trash-goal-hero { padding-bottom: 32px; }
  .trash-goal-document .goal-header { padding-bottom: 0; }
  .trash-goal-document .goal-title-kicker { align-items: center; gap: 12px; }
  .trash-goal-document .goal-title-kicker .goal-status {
    flex: 0 0 auto;
    align-self: flex-start;
    min-height: 26px;
    margin: 0;
    padding: 4px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
  }
  .trash-goal-facts {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--muted);
    font-size: 11px;
  }
  .trash-goal-facts > div { min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
  .trash-goal-facts svg { width: 12px; height: 12px; color: var(--faint); }
  .trash-goal-facts dt { color: var(--faint); }
  .trash-goal-facts dd { margin: 0; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .trash-goal-workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 16px;
  }
  .trash-goal-panel {
    min-width: 0;
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
  }
  .trash-goal-panel--state { grid-column: 1 / -1; }
  .trash-goal-panel .section-heading { margin-bottom: 16px; }
  .trash-goal-panel .section-heading > span { color: var(--muted); }
  .trash-goal-panel .section-heading h2 { color: var(--ink); font-size: 15px; }
  .trash-goal-panel .section-heading p { max-width: 62ch; color: var(--muted); line-height: 1.5; }
  .trash-goal-panel .trash-summary,
  .trash-goal-panel .business-copy,
  .trash-goal-panel .trash-restore-row { margin: 0; padding: 0; color: var(--ink-soft); }
  .trash-goal-panel .trash-summary p,
  .trash-goal-panel .business-copy p,
  .trash-goal-panel .trash-restore-row p { max-width: 68ch; margin: 0; line-height: 1.65; }
  .trash-goal-panel .trash-summary p + p,
  .trash-goal-panel .business-copy p + p { margin-top: 12px; }
  .trash-goal-panel .trash-summary strong { display: block; margin-bottom: 4px; color: var(--ink); }
  .trash-goal-panel .business-copy strong {
    display: block;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: var(--weight-control, 500);
  }
  .trash-goal-panel .business-copy .outcome { color: var(--ink-soft); }
  .trash-goal-panel .trash-restore-row { display: grid; align-content: start; justify-items: start; gap: 16px; }
  .trash-goal-panel .trash-restore-row .mw-btn--primary { min-height: 40px; margin: 0; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-hero,
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-workspace {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-hero { padding: 16px 8px 4px; }
    body[data-desktop-shell="true"] .trash-goal-document .trash-goal-workspace { padding: 8px; }
    body[data-desktop-shell="true"] .trash-goal-panel {
      border: 0;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
  }

  @media (max-width: 760px) {
    .trash-goal-document .trash-goal-hero { padding: 24px 16px 24px; }
    .trash-goal-document .goal-title-kicker { align-items: flex-start; flex-direction: column; gap: 8px; }
    .trash-goal-facts { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .trash-goal-document .goal-title-row { display: grid; gap: 12px; }
    .trash-goal-document .goal-title-actions { justify-content: flex-start; }
    .trash-goal-document .goal-title-actions .mw-btn { min-height: 44px; }
    .trash-goal-workspace { padding: 16px; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .trash-goal-panel,
    .trash-goal-panel--state { grid-column: 1; padding: 16px; }
    .trash-goal-panel .trash-restore-row .mw-btn--primary { min-height: 44px; white-space: normal; }
  }
`;
