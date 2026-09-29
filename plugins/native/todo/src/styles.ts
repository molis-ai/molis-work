export const TODO_STYLES = `
  [data-todo=workbench] { --plugin-tint: var(--plugin-todo, var(--accent)); }
  [data-todo=workbench] .todo-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; }
  /* The header is in the flow (several rows), so the space the shell keeps for its single-row chrome is not needed. */
  body.immersive-workbench .plugin-stage-shell[data-todo=workbench] > .todo-list.plugin-stage-list { padding-top: 16px; }
  .todo-chrome { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-width: 0; }
  .todo-views { display: flex; flex-wrap: nowrap; gap: 2px; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .todo-views::-webkit-scrollbar { display: none; }
  .todo-views .mw-toggle { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .todo-chrome-tools { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .todo-search { width: 200px; max-width: 100%; }
  [data-todo-scope].is-current { background: var(--nav-active); color: var(--ink); }

  .todo-quick { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: var(--r-card, 12px); box-shadow: var(--lift-1); }
  .todo-quick-input { width: 100%; font-size: 14px; }
  .todo-quick-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .todo-quick-parts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1 1 12rem; min-width: 0; }
  .todo-quick-meta .mw-btn--primary { flex: none; }
  .todo-quick-placement { flex: none; }
  .todo-chip { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 2px 0 8px; border-radius: 999px; font-size: 12px; color: var(--ink-soft); background: var(--nav-hover); }
  .todo-chip--due_date { color: var(--ink); }
  .todo-chip-remove { display: inline-grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
  .todo-chip-remove:hover, .todo-chip-remove:focus-visible { background: var(--nav-active); color: var(--ink); }
  .todo-chip-remove svg { width: 12px; height: 12px; }
  .todo-quick-hint, .todo-hint, .todo-muted { font-size: 12px; color: var(--muted); margin: 0; }

  .todo-summary { margin: 0; padding: 0 4px; font-size: 13px; color: var(--ink-soft); }
  .todo-reminders { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--r-card, 12px); box-shadow: var(--lift-1); }
  .todo-reminders[hidden] { display: none; }
  .todo-reminders h2 { margin: 0; font-size: 12px; font-weight: 400; color: var(--tone-attention, var(--ink-soft)); }
  .todo-reminder { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; min-height: 36px; }
  .todo-reminder-text { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .todo-reminder-text .mw-btn--link { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .todo-reminder-text small { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .todo-reminder-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  .todo-reminder-later { position: relative; }
  .todo-reminder-later > summary { list-style: none; }
  .todo-reminder-later > summary::-webkit-details-marker { display: none; }
  .todo-reminder-later .mw-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 6; min-width: 140px; }
  .todo-note { display: flex; align-items: center; gap: 8px; margin: 0; padding: 0 4px; font-size: 12px; color: var(--muted); }
  .todo-note.is-error { color: var(--red, var(--ink)); }
  .todo-loading { display: flex; flex-direction: column; gap: 8px; padding: 4px; }
  .todo-loading[hidden] { display: none; }
  .todo-loading .mw-skeleton { height: 36px; border-radius: var(--r-row, 8px); }

  .todo-rows { display: flex; flex-direction: column; min-width: 0; }
  .todo-group > summary { margin-top: 6px; }
  .todo-row { display: grid; grid-template-columns: 22px 28px minmax(0, 1fr); align-items: center; column-gap: 2px; min-width: 0; border-radius: var(--r-row, 8px); }
  .todo-row.is-selected { background: var(--nav-active); }
  .todo-pick { justify-self: center; opacity: .35; transition: opacity var(--dur-hover, 120ms) var(--ease-swift, ease); }
  .todo-row:hover .todo-pick, .todo-pick:focus-visible, .todo-pick:checked, [data-todo-picking=true] .todo-pick { opacity: 1; }
  .todo-done { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--faint); cursor: pointer; }
  .todo-done:hover, .todo-done:focus-visible { color: var(--ink); background: var(--nav-hover); }
  .todo-done svg { width: 16px; height: 16px; }
  .todo-done.is-done { color: var(--tone-done, var(--ink)); }
  body.immersive-workbench .plugin-stage-list .todo-row > .todo-entry.feed-stage-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title trail" "meta trail"; align-items: center; gap: 2px 10px; width: auto; min-width: 0; height: auto; min-height: 44px; padding: 7px 8px; text-align: left; }
  .todo-title { grid-area: title; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 400; color: var(--ink); }
  .todo-meta { grid-area: meta; display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; font-size: 12px; color: var(--muted); }
  .todo-meta:empty { display: none; }
  .todo-meta-part--due { color: var(--ink-soft); }
  .todo-trail { grid-area: trail; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .todo-row.is-closed .todo-title { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }

  .todo-batch { position: sticky; bottom: 8px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 8px; padding: 6px 8px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: var(--lift-3); }
  .todo-batch[hidden] { display: none; }
  .todo-batch strong { font-weight: 400; font-size: 13px; margin-right: 6px; font-variant-numeric: tabular-nums; }
  .todo-batch-more { position: relative; }
  .todo-batch-more > summary { list-style: none; }
  .todo-batch-more > summary::-webkit-details-marker { display: none; }
  .todo-batch-more .mw-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 140px; }

  .todo-detail > .plugin-stage-detail-bar { min-width: 0; max-width: 100%; }
  .todo-detail > .todo-note { padding: 0 20px; }
  .todo-editor { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; max-width: 46rem; padding: 8px 20px 24px; overflow: auto; overscroll-behavior: contain; }
  .todo-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; font-size: 12px; color: var(--muted); }
  .todo-field > legend { padding: 0; margin-bottom: 4px; }
  .todo-field small { color: var(--faint); font-size: 11px; }
  .todo-field--title .mw-input { font-size: 16px; letter-spacing: -0.01em; color: var(--ink); }
  .todo-dates, .todo-waiting { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 12px 16px; }
  .todo-waiting[hidden] { display: none; }
  .todo-status-choices, .todo-placement-choices { display: flex; flex-wrap: wrap; gap: 2px; }
  .todo-important { align-self: flex-start; }
  .todo-section { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); }
  .todo-section h2 { margin: 0; font-size: 12px; font-weight: 400; color: var(--muted); }
  .todo-source { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--ink-soft); }
  .todo-source-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
  .todo-source strong { font-weight: 400; color: var(--ink); }
  .todo-source small { color: var(--faint); font-size: 11px; }
  .todo-source p { margin: 0; }
  .todo-source blockquote { margin: 0; padding: 4px 10px; border-left: 2px solid var(--line-strong); color: var(--ink-soft); white-space: pre-wrap; }
  .todo-link { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; }
  .todo-link-kind { flex: none; font-size: 11px; color: var(--muted); }
  .todo-link .mw-btn--link { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .todo-link-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .todo-link-add .mw-select { width: auto; min-width: 10rem; max-width: 100%; }
  .todo-history { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--ink-soft); }
  .todo-history li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .todo-history time { color: var(--faint); font-variant-numeric: tabular-nums; }
  .todo-history li.is-reverted span { color: var(--muted); }

  /* With a todo open beside it, the list column is navigation: views and rows, no entry form. */
  @media (min-width: 761px) {
    body.immersive-workbench .plugin-stage-shell[data-todo=workbench][data-expanded="true"] > .todo-list.plugin-stage-list { padding: 12px 8px 20px; }
    [data-todo=workbench][data-expanded="true"] :is(.todo-quick, .todo-chrome-tools, .todo-summary, .todo-reminder-actions) { display: none; }
    body.immersive-workbench [data-todo=workbench][data-expanded="true"] .plugin-stage-list .todo-row > .todo-entry.feed-stage-entry { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "meta" "trail"; }
    [data-todo=workbench][data-expanded="true"] .todo-trail { justify-content: flex-start; }
    [data-todo=workbench][data-expanded="true"] .todo-trail:empty { display: none; }
  }
  @media (max-width: 720px), (pointer: coarse) {
    .todo-chrome { flex-direction: column; align-items: stretch; }
    .todo-search { width: auto; flex: 1; }
    .todo-row { grid-template-columns: 32px 44px minmax(0, 1fr); }
    .todo-pick { opacity: 1; }
    .todo-done { width: 44px; height: 44px; }
    body.immersive-workbench .plugin-stage-list .todo-row > .todo-entry.feed-stage-entry { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "meta" "trail"; }
    .todo-trail { justify-content: flex-start; }
    .todo-quick-meta .mw-btn--primary { width: 100%; justify-content: center; }
  }
  @media (prefers-reduced-motion: reduce) { .todo-pick { transition: none; } }
`;
