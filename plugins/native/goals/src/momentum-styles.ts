/** Goals momentum, document layout, dark theme, and compact board-view styles (moved from design-system/momentum.ts, PEQ-08). */
export const GOALS_MOMENTUM_STYLES = `
  .goal-momentum {
    min-width: 0;
    height: 100%;
    padding: clamp(14px, 1.6vw, 24px);
    overflow: auto;
    background: var(--page);
    display: grid;
    grid-template-rows: auto auto auto minmax(0, auto);
    gap: 16px;
    align-content: start;
  }
  .goal-momentum[hidden] { display: none; }
  .graph-zoom {
    min-height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    display: inline-flex;
    align-items: center;
    overflow: hidden;
  }
  .graph-zoom button { width: 27px; height: 27px; padding: 0; border: 0; border-left: 1px solid var(--line); background: transparent; color: var(--muted); display: grid; place-items: center; font: 650 11px/1 var(--font); cursor: pointer; }
  .graph-zoom button:first-child { border-left: 0; }
  .graph-zoom button:hover { color: var(--ink); background: var(--nav-hover); }
  .graph-zoom button:disabled { opacity: .35; cursor: default; }
  .graph-zoom button svg { width: 12px; height: 12px; }
  .graph-zoom output { width: 39px; color: var(--muted); text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; }
  .graph-viewport { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  #momentum-arrow path { fill: var(--line-strong); }
  #momentum-arrow-selected path { fill: var(--blue); }

  .document-pane[aria-busy="true"] > [data-goal-view], .document-pane[aria-busy="true"] > [data-work-surface="goals"] > [data-goal-view] {
    --busy-dim: 0; pointer-events: none; animation: mw-busy-dim var(--dur-move) var(--ease-quint) var(--dur-move) both;
  }
  .goal-document-loading {
    animation: mw-loading-in var(--dur-move) var(--ease-quint) var(--dur-move) both;
    position: sticky;
    z-index: 9;
    top: 12px;
    width: fit-content;
    min-height: 32px;
    margin: 12px auto -48px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-soft);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--page) 76%, transparent);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 400;
  }

  .goal-document { width: min(100%, 940px); padding: 24px 32px 56px; }
  .document-pane.is-syncing .goal-document { animation: none; }
  .goal-header { padding-bottom: 12px; }
  .goal-title-row h1 { font-size: 24px; line-height: 1.18; letter-spacing: -.035em; }
  .goal-title-copy { min-width: 0; }
  .goal-title-outcome {
    max-width: 66ch;
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    letter-spacing: -.005em;
    white-space: pre-wrap;
  }
  .goal-more > summary, .goal-more > div { border-color: var(--line); background: var(--paper); }
  .goal-focus-outcome {
    padding: 24px 0 24px;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 12px;
  }
  .goal-focus-outcome > span { color: var(--blue); padding-top: 4px; }
  .goal-focus-outcome > span svg { width: 16px; height: 16px; }
  .goal-focus-outcome small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-focus-outcome p { max-width: 70ch; margin: 4px 0 0; color: var(--ink); font-size: 17px; line-height: 1.55; letter-spacing: -.015em; white-space: pre-wrap; }
  .goal-now {
    margin-top: 0;
    padding: 16px 0 16px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
  }
  .goal-now-body {
    margin-top: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 16px;
  }
  .goal-now-body > div > strong { font-size: 15px; }
  .goal-now-body p { color: var(--ink-soft); }
  .goal-now-body small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; }
  .goal-now-body small b { margin-right: 4px; color: var(--ink-soft); }
  .goal-now-blockers { border-top-color: color-mix(in srgb, var(--blue), var(--line) 72%); }
  .goal-now-blockers--clear { color: var(--muted); grid-template-columns: 180px minmax(0, 1fr); }
  .goal-now-blockers--clear > strong { color: var(--green); display: inline-flex; align-items: center; gap: 8px; }
  .goal-now-blockers--clear > strong svg { width: 14px; height: 14px; }
  .goal-now-blockers--clear p { margin: 0; color: var(--muted); font-size: 12px; }
  .goal-focus-criteria { padding: 16px 0 24px; border-bottom: 1px solid var(--line); }
  .goal-focus-criteria > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .goal-focus-criteria h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-criteria header p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  .goal-focus-criteria header > strong { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .goal-focus-criteria ul { list-style: none; margin: 12px 0 0; padding: 0; }
  .goal-focus-criteria li { min-height: 38px; padding: 8px 0; border-top: 1px solid var(--line); display: flex; align-items: flex-start; gap: 12px; }
  .goal-focus-criteria li > span:last-child { min-width: 0; display: grid; gap: 1px; }
  .goal-focus-criteria li > span:last-child > strong { font-size: 12px; font-weight: var(--weight-control, 500); }
  .goal-focus-criteria li small { color: var(--muted); font-size: 11px; }
  .goal-focus-criteria > a { width: fit-content; margin-top: 12px; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 400; text-decoration: none; }
  .goal-focus-criteria > a svg { width: 12px; height: 12px; }
  .goal-focus-criteria > a:hover { text-decoration: underline; }
  .goal-focus-context { padding: 16px 0 24px; border-bottom: 1px solid var(--line); }
  .goal-focus-context > header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .goal-focus-context h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-context header p { margin: 0; color: var(--muted); font-size: 11px; }
  .goal-focus-context dl { margin: 12px 0 0; }
  .goal-focus-context dl > div { min-height: 37px; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(92px, 31%) minmax(0, 1fr); align-items: center; gap: 16px; }
  .goal-focus-context dt { color: var(--muted); font-size: 11px; }
  .goal-focus-context dd { margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 11px; }
  .companion-runtime { display: none; }
  .goal-purpose > section { padding: 12px 0; border-color: var(--line); }

  @media (min-width: 1181px) and (max-width: 1320px) {
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: 24px; }
    body[data-desktop-shell="true"] .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
  }

  @container (max-width: 580px) {
    .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
  }

  html[data-resolved-theme="dark"] .goal-document { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .goal-now-body p,
  html[data-resolved-theme="dark"] .goal-purpose p,
  html[data-resolved-theme="dark"] .business-copy,
  html[data-resolved-theme="dark"] .trash-summary,
  html[data-resolved-theme="dark"] .trash-restore-row,
  html[data-resolved-theme="dark"] .relation-copy .relation-path,
  html[data-resolved-theme="dark"] .relation-authority small { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .goal-meta,
  html[data-resolved-theme="dark"] .decision-record,
  html[data-resolved-theme="dark"] .decision-results,
  html[data-resolved-theme="dark"] .decision-actions button:not(.mw-btn--primary) {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 86%, var(--rail));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .decision-record-heading,
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-reason,
  html[data-resolved-theme="dark"] .decision-record > footer.decision-actions,
  html[data-resolved-theme="dark"] .decision-results > header {
    border-color: var(--line);
    background: color-mix(in srgb, var(--rail) 76%, var(--paper));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .decision-guidance {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 88%, var(--rail));
  }
  html[data-resolved-theme="dark"] .decision-guidance > section { border-color: var(--line); }
  html[data-resolved-theme="dark"] .decision-recommendation.has-recommendation {
    background: color-mix(in srgb, var(--green-soft) 72%, var(--paper));
  }
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-kind,
  html[data-resolved-theme="dark"] .risk-decision > footer.decision-actions a { color: var(--blue-dark); }
  html[data-resolved-theme="dark"] .decision-actions button:disabled {
    border-color: var(--line) !important;
    background: var(--page) !important;
    color: var(--faint) !important;
  }
  html[data-resolved-theme="dark"] .graph-toolbar,
  html[data-resolved-theme="dark"] .graph-legend { background: var(--rail); }
  html[data-resolved-theme="dark"] .graph-relation-toggles button,
  html[data-resolved-theme="dark"] .goal-factor-nav,
  html[data-resolved-theme="dark"] .relation-direction-control > div,
  html[data-resolved-theme="dark"] .relation-editor,
  html[data-resolved-theme="dark"] .relation-inactive-history,
  html[data-resolved-theme="dark"] .factor-advanced { border-color: var(--line-strong); background: var(--rail); }
  html[data-resolved-theme="dark"] .goal-factor-nav button { border-color: var(--line); background: transparent; color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button:hover,
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] { background: var(--nav-active); color: var(--ink); box-shadow: none; }
  html[data-resolved-theme="dark"] .goal-factor-nav button small { background: var(--line); color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] small { background: var(--nav-hover); color: var(--ink); }
  html[data-resolved-theme="dark"] .relation-group > header,
  html[data-resolved-theme="dark"] .relation-actions { background: var(--rail); }
  html[data-resolved-theme="dark"] .relation-kind { background: var(--line); color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .relation-authority,
  html[data-resolved-theme="dark"] .relation-live-preview { border-color: color-mix(in srgb, var(--blue), var(--line) 68%); background: color-mix(in srgb, var(--blue-soft) 72%, var(--paper)); }

  .goal-title-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .goal-title-status--narrow { display: none; }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-title-kicker,
    .goal-title-kicker { display: none; }
    body[data-desktop-shell="true"] .goal-title-heading,
    .goal-title-heading { align-items: baseline; flex-wrap: wrap; column-gap: 8px; row-gap: 4px; }
    .goal-title-status--narrow { display: inline-flex; }
    body[data-desktop-shell="true"] .goal-title-status--narrow .goal-status,
    .goal-title-status--narrow .goal-status {
      min-height: 0;
      padding: 0;
      gap: 4px;
      border: 0;
      border-radius: 0;
      color: var(--muted);
      background: transparent;
      font-size: 12px;
      font-weight: 400;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .document-pane[aria-busy="true"] :is([data-goal-view], .goal-document-loading) { animation-duration: 0s; }
  }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: none; }
    .workspace > .goal-momentum { grid-column: 3; grid-row: 2; min-width: 0; min-height: 0; }
    .workspace[data-workspace-mode="focus"] > .goal-momentum,
    .workspace[data-workspace-mode="runtime"] > .goal-momentum { display: none !important; }
    .workspace[data-workspace-mode="graph"] > .goal-momentum { display: grid; grid-row: 1 / -1; }
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] .graph-toolbar-copy { display: none; }
    .tree-pane[data-navigator-view="graph"] .goal-list-view { display: block; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: flex; }
  }

  @media (max-width: 760px) {
    .workspace > .goal-momentum { grid-column: 1; grid-row: 1; }
    .goal-momentum { padding: 12px; gap: 12px; }
    .graph-zoom button { width: 44px; height: 44px; }
    .graph-zoom output { width: 44px; }
    body[data-desktop-shell="true"] .goal-document { padding: 16px 16px 32px; }
    body[data-desktop-shell="true"] .goal-header { padding-bottom: 16px; }
    body[data-desktop-shell="true"] .goal-title-row { display: flex; align-items: flex-start; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-actions { flex: 0 0 auto; justify-content: flex-end; }
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: 17px; line-height: 1.28; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-focus-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-now {
      margin: 0;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--rail);
    }
    body[data-desktop-shell="true"] .goal-now-body { margin-top: 12px; }
    body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 15px; }
    body[data-desktop-shell="true"] .goal-now-body p { margin-top: 4px; }
    body[data-desktop-shell="true"] .goal-now-blockers { margin-top: 12px; padding-top: 12px; }
    body[data-desktop-shell="true"] .companion-runtime {
      margin-top: 16px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      display: grid;
      gap: 12px;
    }
    body[data-desktop-shell="true"] .companion-runtime > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    body[data-desktop-shell="true"] .companion-runtime header small { color: var(--muted); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime h2 { margin: 4px 0 0; font-size: 15px; letter-spacing: -.015em; }
    body[data-desktop-shell="true"] .companion-runtime-state { color: var(--muted); display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active { color: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active i { background: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime > p { margin: 0; color: var(--ink-soft); font-size: 11px; }
    body[data-desktop-shell="true"] .companion-runtime dl { margin: 0; padding-top: 8px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; }
    body[data-desktop-shell="true"] .companion-runtime dl div { display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .companion-runtime dt { color: var(--muted); font-size: 11px; }
    body[data-desktop-shell="true"] .companion-runtime dd { margin: 0; color: var(--ink); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime > button { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--ink); display: inline-flex; align-items: center; gap: 4px; font: 400 10px/1.2 var(--font); cursor: pointer; }
    body[data-desktop-shell="true"] .companion-runtime > button svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .goal-focus-criteria { margin-top: 4px; padding-top: 16px; }
    .graph-toolbar { flex-wrap: wrap; }
    .graph-toolbar-copy { flex-basis: 100%; }
    .graph-stage { min-width: 820px; padding-inline: 32px; }
    .graph-legend small { display: none; }
    .goal-document { padding: 16px 16px 48px; animation: none; }
    .goal-title-row h1 { font-size: 24px; }
    .goal-now { padding: 16px; }
  }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view] .tree-chrome { padding: 4px 8px; gap: 4px 4px; }
    html[data-density="compact"] body[data-board-view] .tree-search input { height: 26px; border-radius: 5px; }
    html[data-density="compact"] body[data-board-view] .navigator-view-switch { padding: 1px; border-radius: 6px; }
    html[data-density="compact"] body[data-board-view] .navigator-view-switch button { min-height: 22px; border-radius: 4px; }
    html[data-density="compact"] body[data-board-view] .tree-scroll { padding: 4px 8px 8px; }
    html[data-density="compact"] body[data-board-view] .tree-children:not(:empty) { margin-left: 8px; padding-left: 4px; }
    html[data-density="compact"] body[data-board-view] .tree-row { min-height: 27px; }
    html[data-density="compact"] body[data-board-view] .tree-toggle,
    html[data-density="compact"] body[data-board-view] .tree-guide { width: 13px; height: 23px; flex-basis: 13px; }
    html[data-density="compact"] body[data-board-view] .tree-node { min-height: 25px; padding: 1px 4px; border-radius: 4px; }
    html[data-density="compact"] body[data-board-view] .tree-copy strong { font-size: 12px; font-weight: var(--weight-control, 500); min-width: 0; flex: 1; }
    html[data-density="compact"] body[data-board-view] .tree-copy { display: flex; align-items: center; gap: 4px; }
    html[data-density="compact"] body[data-board-view] .tree-progress { flex: 0 0 auto; margin-top: 0; }
    html[data-density="compact"] body[data-board-view] .tree-progress > i { display: none; }
    html[data-density="compact"] body[data-board-view] .tree-node .goal-status { min-height: 16px; padding-inline: 0; border-color: transparent; border-radius: 0; background: transparent; font-size: 12px; }
    html[data-density="compact"] body[data-board-view] .tree-relations { margin: 0 0 1px 12px; }
    html[data-density="compact"] body[data-board-view] .tree-relations > summary { min-height: 17px; padding-block: 0; }
    html[data-density="compact"] body[data-board-view] .tree-deps { margin: 0 0 4px 12px; padding-block: 1px; }
    html[data-density="compact"] body[data-board-view] .tree-dep { min-height: 21px; padding-block: 1px; }
    html[data-density="compact"] body[data-board-view] .tree-footer { min-height: 30px; padding-inline: 8px; font-size: 11px; }
    html[data-density="compact"] body[data-board-view] .goal-document { width: min(100%, 1120px); padding: 12px 16px 32px; font-size: 12px; line-height: 1.5; }
    html[data-density="compact"] body[data-board-view] .goal-header { padding-bottom: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-title-kicker { min-height: 15px; margin-bottom: 1px; }
    html[data-density="compact"] body[data-board-view] .goal-title-row { gap: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-title-row h1 { font-size: 20px; line-height: 1.2; letter-spacing: -.025em; }
    html[data-density="compact"] body[data-board-view] .goal-title-outcome { margin-top: 4px; font-size: 12px; line-height: 1.4; }
    html[data-density="compact"] body[data-board-view] .goal-focus-outcome { padding: 12px 0; gap: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-focus-outcome p { margin-top: 4px; font-size: 13px; line-height: 1.42; }
    html[data-density="compact"] body[data-board-view] .goal-now { padding: 8px 0; }
    html[data-density="compact"] body[data-board-view] .goal-now-body { margin-top: 8px; gap: 8px 12px; }
    html[data-density="compact"] body[data-board-view] .goal-now-body > div > strong { font-size: 13px; }
    html[data-density="compact"] body[data-board-view] .goal-now-body small { margin-top: 4px; }
    html[data-density="compact"] body[data-board-view] .goal-now-blockers { margin-top: 8px; padding-top: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view] .goal-focus-context { padding: 8px 0 12px; }
    html[data-density="compact"] body[data-board-view] .goal-focus-criteria ul,
    html[data-density="compact"] body[data-board-view] .goal-focus-context dl { margin-top: 4px; }
    html[data-density="compact"] body[data-board-view] .goal-focus-criteria li { min-height: 28px; padding: 4px 0; }
    html[data-density="compact"] body[data-board-view] .goal-focus-context dl > div { min-height: 27px; }
    html[data-density="compact"] body[data-board-view] .document-section { padding: 8px 0; }
    html[data-density="compact"] body[data-board-view] .section-heading { margin-bottom: 4px; gap: 4px; }
    html[data-density="compact"] body[data-board-view] .section-heading h2,
    html[data-density="compact"] body[data-board-view] .goal-technical > header strong { font-size: 15px; }
    html[data-density="compact"] body[data-board-view] .section-heading p,
    html[data-density="compact"] body[data-board-view] .goal-technical > header small { font-size: 11px; }
    html[data-density="compact"] body[data-board-view] .document-subsection { margin-top: 8px; padding-top: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-purpose > section { padding: 8px 0; gap: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-technical { padding-top: 12px; }
    html[data-density="compact"] body[data-board-view] .goal-technical > header { padding-bottom: 8px; }
    html[data-density="compact"] body[data-board-view] .goal-technical-body { padding-bottom: 12px; }
    html[data-density="compact"] body[data-board-view] .navigator-project { padding: 8px 12px 8px; gap: 4px; }
    html[data-density="compact"] body[data-board-view] .navigator-project-primary { gap: 8px; }
    html[data-density="compact"] body[data-board-view] .navigator-project-primary > strong { font-size: 13px; }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view] .tree-pane { grid-template-rows: auto 30px auto minmax(0, 1fr) 32px; }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view] .desktop-pane-header--navigator { min-height: 30px; padding-inline: 12px; }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view] .goal-document { padding: 12px 16px 32px; }
  }
`;
