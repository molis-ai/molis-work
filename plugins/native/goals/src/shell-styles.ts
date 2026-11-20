/** Goals base and overlay rules migrated out of the shared shell stylesheets (PEQ-08). */
export const GOALS_BASE_STYLES = `
  .goal-document { width: min(100%, 1080px); min-height: 100%; margin: 0 auto; padding: 24px 32px 64px; container-type: inline-size; animation: craft-rise var(--dur-move) var(--ease-quint); }
  .goal-header { padding: 0 0 16px; }
  .goal-title-row { display: flex; align-items: flex-start; gap: 16px; }
  .goal-title-actions { display: flex; align-items: center; gap: 8px; }
  .goal-title-copy { min-width: 0; flex: 1; display: grid; gap: 4px; }
  .goal-title-copy > small { color: var(--muted); font-size: 11px; font-weight: 400; letter-spacing: .04em; }
  .goal-title-row h1 { margin: 0; font-size: 24px; line-height: 1.3; letter-spacing: -.03em; }
  .goal-title-actions > .goal-status { padding: 0; border: 0; background: transparent; font-size: 13px; }
  .goal-more { position: relative; }
  .goal-more > summary { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: grid; place-items: center; color: var(--muted); cursor: pointer; list-style: none; }
  .goal-more > summary::-webkit-details-marker { display: none; }
  .goal-more > summary:hover { color: var(--ink); border-color: transparent; background: var(--nav-hover); }
  .goal-more[open] > summary { color: var(--ink); border-color: var(--line-strong); background: var(--nav-active); }
  .goal-more > div { position: absolute; z-index: 8; top: calc(100% + 6px); right: 0; min-width: 168px; padding: 8px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper); box-shadow: var(--lift-1); display: grid; }
  .goal-more .mw-btn { width: 100%; justify-content: flex-start; border: 0; height: 32px; }
  .goal-factors { padding: 24px 0 24px; }
  .goal-factors-heading { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 8px; }
  .goal-factors-heading > span { padding-top: 4px; color: var(--ink-soft); }
  .goal-factors-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .goal-factors-heading p { max-width: 72ch; margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .goal-factor-nav { margin: 16px 0 0 32px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--rail); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
  .goal-factor-nav button { min-width: 0; min-height: 43px; padding: 8px 8px; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
  .goal-factor-nav button:last-child { border-right: 0; }
  .goal-factor-nav button:hover { color: var(--ink); background: var(--paper); }
  .goal-factor-nav button[aria-selected="true"] { color: var(--ink); background: var(--paper); box-shadow: var(--lift-1); }
  .goal-factor-nav button svg { width: 14px; height: 14px; }
  .goal-factor-nav button small { min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--rail); color: var(--muted); display: inline-grid; place-items: center; font-size: 11px; font-variant-numeric: tabular-nums; }
  .goal-factor-nav button[aria-selected="true"] small { color: var(--ink); background: var(--nav-active); }
  .goal-factor-panels { margin: 16px 0 0 32px; }
  .goal-factor-panel > header { margin-bottom: 12px; }
  .goal-factor-panel > header h3 { margin: 0; font-size: 15px; }
  .goal-factor-panel > header h3 span { color: var(--muted); font-size: 12px; font-weight: 400; }
  .goal-factor-panel > header p { max-width: 72ch; margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .factor-write-receipt { margin: 0 0 16px; padding: 12px 12px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 4px; }
  .factor-write-receipt strong { color: var(--green); font-size: 12px; }
  .factor-write-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .factor-write-receipt:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .policy-scope-note { margin: 0; padding: 12px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; }
  .policy-scope-note > svg { color: var(--muted); }
  .policy-scope-note > span { min-width: 0; display: grid; }
  .policy-scope-note small { color: var(--muted); }
  .policy-scope-note a { color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .goal-workspace-panels { min-width: 0; }
  .goal-situation { margin: 16px 0 0; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-hover); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .goal-situation-cell { min-width: 0; padding: 12px 12px; border-right: 1px solid var(--line); color: inherit; text-decoration: none; display: grid; gap: 4px; }
  .goal-situation-cell:last-child { border-right: 0; }
  .goal-situation-cell:hover { background: var(--nav-hover); }
  .goal-situation-cell span { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-situation-cell strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
  .goal-situation-cell small { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .goal-situation-cell--static { cursor: default; }
  .goal-situation-cell--static:hover { background: transparent; }
  .goal-situation-cell--blocked strong { color: var(--red); }
  .goal-situation-cell--ready strong { color: var(--green); }
  .goal-situation-cell--muted strong { color: var(--muted); font-weight: var(--weight-control, 500); }
  .goal-now { margin: 24px 0 0; padding: 16px 24px; border: 1px solid var(--line); border-radius: 6px; background: var(--page); scroll-margin-top: 58px; }
  .goal-now > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .goal-now > header h2 { margin: 0; font-size: 15px; letter-spacing: -.01em; }
  .goal-now-body { margin-top: 16px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px 32px; }
  .goal-now-body > div { min-width: 0; display: grid; gap: 4px; }
  .goal-now-body > div > strong { font-size: 17px; line-height: 1.4; }
  .goal-now-body p { max-width: 68ch; margin: 0; color: var(--ink-soft); }
  .goal-now-body small { color: var(--muted); }
  .goal-now-body small b { margin-right: 4px; color: var(--ink); }
  .goal-now-blockers { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
  .goal-now-blockers > strong { color: var(--red); font-size: 12px; }
  .goal-now-blockers ul { margin: 0; padding-left: 16px; }
  .goal-now-blockers li + li { margin-top: 4px; }
  .goal-now-blockers small { display: block; color: var(--muted); }
  .goal-purpose { margin-left: 32px; }
  .goal-purpose > section { padding: 12px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
  .goal-purpose > section:first-child { border-top: 0; }
  .goal-purpose h3, .completion-boundaries h3, .supporting-boundaries h3 { margin: 0; font-size: 13px; }
  .goal-purpose p { max-width: 72ch; margin: 0; color: var(--ink-soft); white-space: pre-wrap; }
  .goal-edit-disclosure { margin: 16px 0 0 32px; border-top: 1px solid var(--line); }
  .goal-edit-disclosure > summary { padding: 12px 0; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 8px; cursor: pointer; list-style: none; }
  .goal-edit-disclosure > summary::-webkit-details-marker { display: none; }
  .goal-edit-disclosure > summary > span { display: grid; }
  .goal-edit-disclosure > summary small { color: var(--muted); font-weight: 400; }
  .goal-edit-disclosure[open] > summary > svg:last-child, .supporting-boundaries[open] > summary svg { transform: rotate(180deg); }
  .goal-edit-disclosure .draft-editor-section { margin: 0 0 16px; }
  .completion-boundaries { display: grid; }
  .completion-boundaries > section { padding: 12px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
  .completion-boundaries > section:first-child { border-top: 0; }
  .completion-boundaries .doc-list, .completion-boundaries .empty-row, .supporting-boundaries .doc-list, .supporting-boundaries .empty-row { margin-top: 0; }
  .supporting-boundaries { border-top: 1px solid var(--line); }
  .supporting-boundaries > summary { padding: 12px 0; color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 400; cursor: pointer; list-style: none; }
  .supporting-boundaries > summary::-webkit-details-marker { display: none; }
  .supporting-boundaries > div > section { padding: 12px 0; display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
  .child-progress { margin: 16px 0 0 32px; padding-top: 16px; border-top: 1px solid var(--line); }
  .child-progress > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .child-progress h3, .dependency-summary h3, .progress-overview h3, .rule-summary h3 { margin: 0; font-size: 15px; }
  .child-progress header p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  .child-progress-rule { max-width: 720px; display: grid; gap: 4px; }
  .child-progress-rule strong { color: var(--ink); font-size: 12px; }
  .child-progress--needs_confirmation .child-progress-rule strong { color: var(--blue); }
  .child-progress--conflict .child-progress-rule strong { color: var(--red); }
  .child-progress > header > strong { color: var(--muted); font-variant-numeric: tabular-nums; }
  .child-progress ul, .dependency-summary ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .child-progress li, .dependency-summary li { border-top: 1px solid var(--line); }
  .child-progress a, .dependency-summary a { min-height: 48px; padding: 8px 4px; color: inherit; display: flex; align-items: center; gap: 12px; text-decoration: none; }
  .child-progress a:hover strong, .dependency-summary a:hover strong { color: var(--blue-dark); }
  .child-progress a > span, .dependency-summary a > span { min-width: 0; flex: 1; display: grid; }
  .child-progress a small, .dependency-summary a small { color: var(--muted); }
  .child-progress a em { color: var(--muted); font-size: 11px; font-style: normal; font-weight: 400; }
  .dependency-summary .check-box { flex: 0 0 15px; }
  .progress-overview { margin-left: 32px; display: grid; gap: 16px; }
  .progress-facts { margin: 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .progress-facts > div { min-width: 0; padding: 12px 12px 12px 0; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  .progress-facts > div:nth-child(odd) { padding-right: 24px; border-right: 1px solid var(--line); }
  .progress-facts > div:nth-child(even) { padding-left: 24px; }
  .progress-facts dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .progress-facts dd { margin: 0; font-weight: 400; }
  .progress-facts dd small { display: block; color: var(--muted); font-weight: 400; }
  .progress-blockers, .rule-summary { padding-top: 4px; }
  .rule-summary ul { margin: 8px 0 0; padding-left: 16px; }
  .rule-summary li + li { margin-top: 4px; }
  .goal-technical { padding: 24px 0 0; }
  .goal-technical > header { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 8px; }
  .goal-technical > header > span:first-child { color: var(--ink-soft); }
  .goal-technical > header > span:nth-child(2) { display: grid; }
  .goal-technical > header strong { font-size: 17px; letter-spacing: -.015em; }
  .goal-technical > header small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .goal-technical-body { padding: 4px 0 24px 32px; }
  .goal-record-section { border-bottom: 1px solid var(--line); }
  .goal-record-section > summary { min-height: 58px; padding: 12px 4px; display: flex; align-items: center; justify-content: space-between; gap: 16px; list-style: none; cursor: pointer; }
  .goal-record-section > summary::-webkit-details-marker { display: none; }
  .goal-record-section > summary:hover { color: var(--ink); }
  .goal-record-section > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-record-section > summary strong { font-size: 15px; }
  .goal-record-section > summary small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-record-section > summary > svg { flex: 0 0 auto; color: var(--muted); transition: transform 130ms var(--ease-quint); }
  .goal-record-section[open] > summary > svg { transform: rotate(180deg); }
  .goal-record-section > div { padding: 4px 0 24px; }
  .goal-record-section > div > section { padding: 16px 0 0; }
  .goal-record-section > div > section > h3 { margin: 0 0 12px; font-size: 13px; }
  .technical-meta { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .technical-meta > div { min-width: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; }
  .technical-meta dt { color: var(--muted); }
  .technical-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .technical-meta dd strong, .technical-meta dd small { display: block; }
  .technical-meta dd small { margin-top: 4px; color: var(--muted); font-size: 11px; }
  .archive-empty { min-height: 100%; padding: 72px 32px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .archive-empty svg { width: 30px; height: 30px; margin-bottom: 12px; color: var(--faint); }
  .archive-empty h1 { margin: 0 0 4px; color: var(--ink); font-size: 20px; }
  .archive-empty p { margin: 0 0 16px; }
  .archive-empty a { color: var(--blue); text-decoration: none; }
  .goal-meta { margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 12px 24px; color: var(--muted); }
  .goal-meta div { display: flex; align-items: center; gap: 8px; }
  .goal-meta svg { font-size: 13px; }
  .goal-meta dt { font-size: 12px; }
  .goal-meta dd { margin: 0; }
  .goal-meta mark { padding: 1px 4px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); }
  .goal-lifecycle-hint { display: flex; align-items: flex-start; gap: 8px; padding: 12px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .goal-lifecycle-hint > svg { flex: 0 0 auto; margin-top: 4px; color: var(--muted); }
  .goal-lifecycle-hint span { display: grid; gap: 4px; }
  .goal-lifecycle-hint small { color: var(--muted); }
  .goal-trash-dialog { width: min(560px, calc(100vw - 32px)); }
  .goal-trash-dialog .dialog-body { align-content: start; grid-auto-rows: max-content; }
  .goal-trash-target { margin: 0; padding-bottom: 12px; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  .goal-trash-target strong { overflow-wrap: anywhere; }
  .goal-trash-target small { font-size: 11px; }
  .goal-trash-note { margin: 0; padding: 12px 12px; border: 1px solid var(--line); border-radius: 5px; color: var(--ink-soft); background: var(--page); font-size: 12px; }
  .goal-choice-list { max-height: 134px; margin-top: 8px; padding: 4px; border: 1px solid var(--line); border-radius: 5px; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; }
  .goal-choice { padding: 8px 8px; display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px !important; border-radius: 4px; cursor: pointer; }
  .goal-choice:hover { background: var(--nav-hover); }
  .goal-choice > span { min-width: 0; display: grid; }
  .goal-choice strong, .goal-choice small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .goal-title-kicker { display: none; }
  body[data-desktop-shell="true"] .goal-document { width: 100%; padding: 24px 32px 52px; }
  body[data-desktop-shell="true"] .goal-header { padding-bottom: 16px; }
  body[data-desktop-shell="true"] .goal-title-kicker { min-height: 20px; margin-bottom: 4px; display: flex; align-items: center; }
  body[data-desktop-shell="true"] .goal-title-kicker .goal-status { background: transparent; padding-inline: 0; }
  body[data-desktop-shell="true"] .goal-title-row h1 { font-size: 24px; }
  body[data-desktop-shell="true"] .goal-now { padding: 16px 0; }
  body[data-desktop-shell="true"] .goal-now-body { margin-top: 12px; }
  body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 15px; }
  body[data-desktop-shell="true"] .goal-focus-criteria { padding: 16px 0 24px; }
  .goal-navigator { min-width: 0; padding: 4px 0 16px; }
  .navigator-goal-row .goal-status { min-height: 19px; padding-inline: 8px; font-size: 12px; }
  .tree-pane[data-navigator-view="graph"] .goal-list-view { display: none; }
  @container (max-width: 660px) {
    .goal-factor-nav, .goal-factor-panels { margin-left: 0; }
    .goal-factor-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .goal-factor-nav button:nth-child(2) { border-right: 0; }
    .goal-factor-nav button:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .goal-now > header, .goal-now-body { grid-template-columns: 1fr; display: grid; }
    .goal-now > header { gap: 8px; }
    .goal-now > header .goal-status { justify-self: start; }
    .goal-now-blockers, .goal-purpose > section, .completion-boundaries > section, .supporting-boundaries > div > section { grid-template-columns: 1fr; gap: 4px; }
    .goal-purpose, .goal-edit-disclosure, .child-progress, .progress-overview, .goal-technical-body { margin-left: 0; padding-left: 0; }
  }
  @media (max-width: 760px) {
    .workspace > .goal-momentum { grid-column: 1; grid-row: 1; min-width: 0; min-height: 0; }
    .workspace[data-mobile-view="tree"] .goal-momentum { display: none; }
    .workspace[data-workspace-mode="graph"] > .goal-momentum { display: grid; height: 100%; min-height: 0; }
    .goal-document { padding: 24px 16px 64px; }
    .goal-title-row { display: grid; gap: 12px; }
    .goal-title-actions { justify-content: space-between; }
    .goal-meta { gap: 8px 16px; }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .goal-choice-list { grid-template-columns: 1fr; }
  }
`;

export const GOALS_OVERLAY_STYLES = `
  body.immersive-workbench .tree-pane .goal-list-view { display: block; }
  body.immersive-workbench .goal-tree { padding: 0; margin: 0; }
  body.immersive-workbench .immersive-plugin-stage > .goal-frame-surface { overflow: hidden; background: var(--canvas); padding: 0; }
  body.immersive-workbench .immersive-plugin-stage > .goal-canvas-shell, body.immersive-workbench .tab-pane-body > .goal-canvas-shell { overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .immersive-plugin-stage > .goal-canvas-shell[data-board-view="list"], body.immersive-workbench .tab-pane-body > .goal-canvas-shell[data-board-view="list"] { background: var(--paper); }
  .goal-node-toolbar .goal-node-back { flex: none; margin-left: -8px; }
  .goal-node-back svg { transform: rotate(180deg); }
  .goal-node-toolbar { gap: 12px; }
  body.immersive-workbench .goal-details-aside { background: var(--paper); box-shadow: none; }
  body.immersive-workbench .goal-canvas-shell .tui-empty { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { border-color: var(--action); }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 880px); }
  body .goal-trash-dialog { border-radius: 8px; box-shadow: var(--lift-1); }
  body .goal-trash-dialog::backdrop { background: var(--scrim); backdrop-filter: none; }
  .form-disclosure .goal-choice-list { max-height: 230px; overflow-y: auto; }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 780px); box-sizing: border-box; align-self: center; gap: 0; padding: 0; overflow: hidden; }
  body.immersive-workbench .goal-event-document .event-form > [data-event-back] { display: none; }
  body.immersive-workbench .goal-event-document .event-form :is(label > span, legend) { font-size: 13px; }
  body.immersive-workbench .goal-event-document .event-form :is(.form-lead,.form-note,small) { font-size: 13px; line-height: 1.65; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { align-self: flex-start; width: auto; min-height: 36px; background: var(--action); color: var(--action-ink); padding-inline: 16px; border-radius: 7px; }
  @media (max-width: 640px) {
    body.immersive-workbench .goal-event-document .event-form { padding: 0; }
    body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 44px; }
  }
  body.immersive-workbench .goal-node-toolbar { min-height: 32px; padding: 4px 12px; gap: 8px; }
  body.immersive-workbench .goal-node-heading h1 { font-size: 13px; line-height: 1.3; }
  body.immersive-workbench .goal-node-toolbar button:not([data-tui-empty-add]),
  body.immersive-workbench .goal-details-toggle { height: 26px; width: 26px; }
  body.immersive-workbench .goal-workspace-hero { padding: 8px 12px; }
  body.immersive-workbench .goal-info-popover > summary { min-height: 28px; padding: 4px 12px; }
  body.immersive-workbench .goal-event-document .goal-header { padding: 8px 16px 8px; }
  body.immersive-workbench .goal-event-document .goal-title-heading h1 { font-size: 15px; line-height: 1.3; }
  body.immersive-workbench .goal-event-document .goal-overview { padding: 8px 12px; margin: 0 16px 8px; }
  body.immersive-workbench .goal-event-document .goal-layout { margin: 0 16px 8px; }
  body.immersive-workbench .goal-event-document .stream-toolbar,
  body.immersive-workbench .goal-event-document .detail-toolbar { height: 32px; padding: 0 12px; }
  body.immersive-workbench .goal-event-document .timeline-entry { min-height: 36px; padding: 4px 8px; }
  body.immersive-workbench .goal-event-document .event h2 { font-size: 15px; margin: 0 0 8px; }
  body.immersive-workbench .goal-event-document .event-sheet,
  body.immersive-workbench .goal-event-document .reader-content,
  body.immersive-workbench .goal-event-document .event-form { padding: 12px 16px 24px; }
  body.immersive-workbench .goal-event-document .event p { line-height: 1.6; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 32px; }
  @media (max-width: 760px), (pointer: coarse) {
    body.immersive-workbench .goal-node-toolbar button,
    body.immersive-workbench .goal-details-toggle { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 44px; }
  }
  body.immersive-workbench .goal-kanban-empty { border: 1px dashed var(--line-strong); color: var(--ink-soft); background: transparent; }
  body :is(.goal-canvas-node > .goal-status, .goal-kanban-card .goal-status) { background: transparent; border-color: transparent; }
  .goal-canvas-viewport, .goal-frame-canvas {
    background-image:
      radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--ink) 3.5%, transparent), transparent 62%),
      radial-gradient(circle, color-mix(in srgb, var(--ink) 13%, transparent) .9px, transparent 1px);
    background-size: 100% 100%, 22px 22px;
  }
  .goal-canvas-node {
    border-color: var(--line);
    box-shadow: inset 0 1px 0 var(--edge-highlight);
    transition: border-color var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint);
  }
  .goal-canvas-node:hover { border-color: var(--line-strong); background: color-mix(in srgb, var(--ink) 1.6%, var(--paper)); }
  .goal-canvas-node.is-selected { border-color: var(--ink); box-shadow: inset 0 1px 0 var(--edge-highlight); }
  .goal-canvas-edges g path { stroke: color-mix(in srgb, var(--ink) 24%, transparent); stroke-width: 1.4; }
  .goal-canvas-edges marker path { fill: color-mix(in srgb, var(--ink) 32%, transparent); }
  .goal-canvas-edges .is-selected-path path { stroke: color-mix(in srgb, var(--ink) 72%, transparent); }
  body .goal-board-switch {
    display: inline-flex; gap: 4px; padding: 4px; border: 0; border-radius: 12px; background: var(--control-fill); box-shadow: none;
    height: var(--control-h, 28px); min-height: var(--control-h, 28px); box-sizing: border-box;
  }
  body .goal-board-switch > :is(button, a) {
    width: calc(var(--control-h, 28px) - 6px); min-width: calc(var(--control-h, 28px) - 6px);
    height: calc(var(--control-h, 28px) - 6px); min-height: calc(var(--control-h, 28px) - 6px);
    padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted);
    font-size: 12px; font-weight: var(--weight-control, 500); box-shadow: none; display: inline-grid; place-items: center;
    transition: color var(--dur-move, 250ms) var(--ease-quint), background-color var(--dur-hover, 130ms) var(--ease-quint), box-shadow var(--dur-move, 250ms) var(--ease-quint);
  }
  body .goal-board-switch > :is(button, a):hover { color: var(--ink); background: transparent; }
  body .goal-board-switch > :is([aria-current="true"], [aria-current="page"], [aria-pressed="true"], .is-current, .is-active) {
    color: var(--ink); background: var(--paper); box-shadow: var(--shadow-soft), inset 0 1px 0 var(--edge-highlight);
  }
  body .goal-board-switch svg { width: 14px; height: 14px; }
  @media (prefers-reduced-motion: reduce) {
    .goal-canvas-node { transition: none; }
  }
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .goal-mode-switch {
      min-height: 30px; padding: 4px; border-radius: 9px; background: color-mix(in srgb, var(--rail) 76%, transparent);
      display: inline-flex; align-items: center; gap: 1px;
    }
    body[data-desktop-shell="true"] .goal-mode-switch button {
      min-height: 26px; padding: 0 8px; border: 0; border-radius: 7px; color: var(--muted); background: transparent;
      display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 400; cursor: pointer;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .goal-mode-switch button:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
    body[data-desktop-shell="true"] .goal-mode-switch button:hover { color: var(--ink); }
    body[data-desktop-shell="true"] .goal-mode-switch button.is-active { color: var(--ink); background: var(--paper); box-shadow: var(--lift-1); }
    body[data-desktop-shell="true"] .goal-mode-switch button svg { width: 12px; height: 12px; }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .goal-mode-switch button.is-active { background: color-mix(in srgb, var(--blue) 10%, transparent); box-shadow: none; }
  }
  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-mode-switch { display: none !important; }
  }
  body[data-desktop-shell="true"] .desktop-work-surface:has(> .goal-event-document) { display: flex; }
  body.immersive-workbench .goal-stage-chrome .tree-create:hover { border-color: transparent; background: var(--nav-hover); box-shadow: none; }
  body.immersive-workbench .goal-canvas-shell .tree-entry.is-selected :is(.tree-node, .tree-row) { background: transparent; }
  body.immersive-workbench :is(.goal-canvas-viewport, .goal-frame-canvas) { background-color: var(--paper); background-image: none; }
  body.immersive-workbench .goal-canvas-viewport.is-panning { cursor: grabbing; }
  body.immersive-workbench :is(.goal-canvas-tools, .goal-frame-tools) > div { border-radius: 11px; background: var(--paper); box-shadow: var(--lift-2); }
  body.immersive-workbench :is(.goal-canvas-tools, .goal-frame-tools) button { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  body.immersive-workbench :is(.goal-canvas-tools, .goal-frame-tools) button:hover { background: var(--nav-hover); }
  body.immersive-workbench .goal-node-toolbar .goal-node-back { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  body.immersive-workbench .goal-details-aside { background: var(--paper); box-shadow: inset 1px 0 0 var(--line); }
  body.immersive-workbench .goal-details-toggle svg { transition: transform var(--dur-move) var(--ease-quint); }
`;
