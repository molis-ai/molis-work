/** The Goal document: header, status, hero and workspace panels, relations and factors in the detail decks, the tree's status chip. */
export const GOALS_DOCUMENT_STYLES = `
  .goal-status,
  body[data-desktop-shell="true"] .goal-status { min-height: 22px; max-width: 100%; padding: 1px 8px; border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line)); line-height: 1.2; }
  .goal-status > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tree-node.is-selected .goal-status { color: var(--goal-status-tone); }
  body[data-desktop-shell="true"] .goal-title-kicker,
  .goal-title-kicker { margin: 0 0 8px; }
  body[data-desktop-shell="true"] .goal-title-row h1,
  .goal-title-row h1 { line-height: 1.2; letter-spacing: -.035em; }
  .goal-title-outcome { max-width: 68ch; margin-top: 12px; line-height: 1.65; }
  .goal-more > summary { border: 0; border-radius: 7px; background: transparent; }
  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view] .goal-status { min-height: 20px; padding-inline: 8px; border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line)); border-radius: 5px; background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper)); }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view] .tree-node .goal-status { min-height: 20px; padding-inline: 8px; border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line)); border-radius: 5px; background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper)); font-size: 11px; }
  }
  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-title-row h1,
    .goal-title-row h1 { max-width: none; font-size: 24px; }
  }
  @container (max-width: 380px) {
    .tree-node .goal-status { max-width: 112px; }
    .tree-node .goal-status > span { white-space: nowrap; }
  }
  body[data-desktop-shell="true"] .goal-document,
  .goal-document { min-height: calc(100% - (var(--focus-canvas-inset) * 2)); padding: 0; background: transparent; display: grid; align-content: start; }
  body[data-desktop-shell="true"] .goal-header,
  .goal-header { padding-bottom: 24px; }
  .goal-hero,
  .goal-workspace-panels { min-width: 0; border: 1px solid var(--line); background: var(--paper); overflow: clip; }
  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view] .goal-document { width: min(100%, 960px); }
    html[data-density="compact"] body[data-board-view] .goal-hero { padding: 24px 32px 0; }
    html[data-density="compact"] body[data-board-view] .goal-workspace-panels { padding: 24px 32px 56px; }
  }
  .focus-panel,
  .goal-factors,
  .goal-technical { padding: 0 0 24px; }
  .focus-panel-heading,
  .goal-factors-heading,
  .goal-technical > header { margin: 0 0 16px; padding: 0; border: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 8px; }
  .focus-panel-heading > svg,
  .goal-factors-heading > span,
  .goal-technical > header > span:first-child { width: 18px; height: 18px; margin-top: 1px; color: var(--muted); }
  .focus-panel-heading h2,
  .goal-factors-heading h2,
  .goal-technical > header strong { margin: 0; color: var(--ink); font-size: 15px; line-height: 1.35; letter-spacing: -.015em; }
  .focus-panel-heading p,
  .goal-factors-heading p,
  .goal-technical > header small { max-width: 68ch; margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; font-weight: 400; }
  .focus-section-deck,
  .focus-section-deck.goal-factor-nav,
  .focus-section-deck.progress-overview { width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; display: block; overflow: visible; }
  .focus-section-card-trigger,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger { width: 100%; height: 100%; min-height: 84px; padding: 12px; border: 0; border-right: 0; background: transparent; color: var(--ink-soft); box-shadow: none; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto auto; align-items: start; justify-content: stretch; text-align: left; }
  .focus-section-card-trigger:hover,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 3.5%, transparent); }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-copy > small { min-width: 0; height: auto; padding: 0; border-radius: 0; background: transparent !important; color: var(--muted) !important; display: block; }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-count { min-width: 20px; height: 20px; padding: 0 8px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 6%, transparent) !important; color: var(--muted) !important; }
  .focus-section-card-reveal .relation-layout { border-radius: 10px; background: var(--paper); }
  .focus-section-card-reveal .relation-group { border-color: var(--line); }
  .focus-section-card-reveal .relation-group > header { min-height: 48px; padding: 12px 16px; border-color: var(--line); background: color-mix(in srgb, var(--rail) 64%, var(--paper)); gap: 12px; }
  .focus-section-card-reveal .relation-group h3 { flex: 0 0 auto; color: var(--ink); font-size: 12px; line-height: 1.4; }
  .focus-section-card-reveal .relation-group h3 span { margin-left: 4px; font-variant-numeric: tabular-nums; }
  .focus-section-card-reveal .relation-group > header p { margin: 0; overflow-wrap: anywhere; }
  .focus-section-card-reveal .relation-group > div { padding: 0 12px; }
  .focus-section-card-reveal .relation-group .empty-row { margin: 0; padding: 12px 4px 16px; color: var(--faint); }
  .focus-section-card-reveal .relation-record { align-items: stretch; border-color: var(--line); }
  .focus-section-card-reveal .relation-row { padding: 16px 8px 16px 4px; display: grid; grid-template-columns: 54px minmax(0, 1fr) auto 16px; align-items: start; justify-content: stretch; gap: 12px; color: var(--ink-soft); }
  .focus-section-card-reveal .relation-row:hover { background: var(--nav-hover); }
  .focus-section-card-reveal .relation-kind { width: fit-content; max-width: 54px; margin-top: 1px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--rail) 74%, var(--paper)); line-height: 1.35; white-space: normal; overflow-wrap: anywhere; }
  .focus-section-card-reveal .relation-copy { gap: 4px; }
  .focus-section-card-reveal .relation-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
  .focus-section-card-reveal .relation-heading strong { color: var(--ink); font-size: 12px; line-height: 1.45; }
  .focus-section-card-reveal .relation-copy :is(.relation-goal-id, .relation-path, .relation-reason) { min-width: 0; height: auto; padding: 0; border: 0; border-radius: 0; background: transparent !important; display: block; line-height: 1.45; }
  .focus-section-card-reveal .relation-copy .relation-goal-id { color: var(--faint); letter-spacing: .02em; }
  .focus-section-card-reveal .relation-copy .relation-path { color: var(--ink-soft); }
  .focus-section-card-reveal .relation-state { margin-top: 1px; padding: 4px 8px; border: 1px solid currentColor; border-radius: 8px; line-height: 1.35; white-space: nowrap; }
  .focus-section-card-reveal .relation-row > svg { margin-top: 4px; }
  .focus-section-card-reveal .relation-deactivate-open { align-self: stretch; min-width: 48px; margin: 0; padding: 0 8px; border: 0; border-left: 1px solid var(--line); }
  .focus-section-card-reveal .relation-deactivate-open:hover { border-color: var(--line); color: var(--red); background: var(--red-soft); }
  .focus-section-card-reveal .relation-deactivate-form { margin: 0 0 12px; border-radius: 8px; }
  .focus-section-card-reveal .goal-purpose,
  .focus-section-card-reveal .goal-edit-disclosure,
  .focus-section-card-reveal .child-progress,
  .focus-section-card-reveal .document-subsection,
  .focus-section-card-reveal .progress-overview,
  .focus-section-card-reveal .goal-technical-body { margin-left: 0; padding-left: 0; }
  .focus-section-card-reveal .document-subsection { margin-top: 16px; }
  .focus-section-card-reveal .document-subsection:first-child { margin-top: 0; }
  .goal-factor-panel .focus-section-card-content > header,
  .focus-section-card-content > .goal-factor-panel > header,
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header { margin: 0 0 16px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header h3 { margin: 0; font-size: 15px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  @container (max-width: 700px) {
    .focus-section-card-trigger,
    .focus-section-deck.goal-factor-nav .focus-section-card-trigger { min-height: 72px; }
    .focus-section-card-reveal .relation-row { gap: 8px; }
  }
  @container (max-width: 430px) {
    .focus-section-card-reveal .relation-record { grid-template-columns: minmax(0, 1fr); }
    .focus-section-card-reveal .relation-row { padding-right: 4px; grid-template-columns: 48px minmax(0, 1fr) auto; }
    .focus-section-card-reveal .relation-row > svg { display: none; }
    .focus-section-card-reveal .relation-deactivate-open { min-height: 34px; border-top: 1px solid var(--line); border-left: 0; justify-content: flex-end; }
  }
  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-document,
    .goal-document { gap: 12px; }
    .goal-hero { border-radius: 12px; }
    .goal-workspace-panels { border-radius: 12px; }
  }
`;
