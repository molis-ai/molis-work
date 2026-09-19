/** Shared plugin stage master-detail: full list, then --tree-width + detail. */
export const PLUGIN_STAGE_STYLES = `
  .immersive-plugin-stage > .plugin-stage-shell,
  .tab-pane-body > .plugin-stage-shell {
    position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden;
    padding: 0; background: var(--paper);
  }
  .plugin-stage-shell [hidden] { display: none !important; }
  .plugin-stage-list {
    position: absolute; inset: 0; z-index: 0; overflow: auto; overscroll-behavior: contain;
    padding: 52px 20px 28px; background: var(--paper);
    scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent;
  }
  .plugin-stage-chrome {
    position: absolute; top: 16px; left: 20px; z-index: 20;
    display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
    width: max-content; max-width: calc(100% - 40px);
    background: transparent; isolation: isolate; pointer-events: auto;
  }
  .plugin-stage-list .goal-collection-fold { margin: 0 0 10px; border: 0; }
  .plugin-stage-list .goal-collection-fold > summary {
    display: flex; align-items: center; gap: 8px; height: 32px; min-height: 32px;
    padding: 0 8px; border-radius: 6px; color: var(--muted); list-style: none; cursor: pointer;
  }
  .plugin-stage-list .goal-collection-fold > summary::-webkit-details-marker,
  .plugin-stage-list .goal-collection-fold > summary::marker { display: none; }
  .plugin-stage-list .goal-collection-fold > summary:hover { color: var(--ink); background: var(--nav-hover); }
  .plugin-stage-list .goal-collection-fold > summary strong { font-size: 12px; font-weight: 400; }
  .plugin-stage-list .goal-collection-fold > summary small { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--faint); }
  .plugin-stage-list .goal-collection-caret { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); }
  .plugin-stage-list .goal-collection-caret svg { width: 12px; height: 12px; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); }
  .plugin-stage-list .goal-collection-mark { display: grid; place-items: center; width: 16px; height: 16px; color: var(--tone-idle, var(--muted)); }
  .plugin-stage-list .goal-collection-mark svg { width: 13px; height: 13px; }
  .plugin-stage-list .goal-collection-mark.is-ready { color: var(--tone-done, var(--green)); }
  .plugin-stage-list .goal-collection-mark.is-attention { color: var(--tone-attention, var(--amber)); }
  .plugin-stage-list .goal-collection-fold:not([open]) > summary .goal-collection-caret svg { transform: rotate(-90deg); }
  .plugin-stage-list .goal-collection-empty { margin: 0; padding: 6px 8px 10px 24px; font-size: 12px; color: var(--muted); }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold .feed-stage-entry { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold > :is(.mw-dir-row, a.mw-dir-row) { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold .shelf-row { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold .shelf-row.is-child { padding-left: 40px; }
  body.immersive-workbench .plugin-stage-list :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected) {
    background: var(--nav-active); color: var(--ink);
  }
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected),
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has([aria-current="page"]) { background: var(--nav-active); }
  body.immersive-workbench .plugin-stage-list :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected)::before,
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected)::before,
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has([aria-current="page"])::before {
    content: none; display: none; width: 0;
  }
  .plugin-stage-workspace { min-width: 0; min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; background: var(--paper); }
  .plugin-stage-workspace > .feed-stage-detail,
  .plugin-stage-workspace > .feed-detail,
  .plugin-stage-workspace > .inbox-reference-detail,
  .plugin-stage-workspace > .artifact-detail,
  .plugin-stage-workspace > [data-artifact-detail],
  .plugin-stage-workspace > .shelf-stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .plugin-stage-workspace > [data-artifact-detail] .artifact-detail {
    flex: 1; min-width: 0; min-height: 0; height: auto; max-width: none; margin: 0;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .plugin-stage-back {
    display: grid; place-items: center; width: 30px; height: 30px; padding: 0; flex: none;
    margin-left: -6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer;
  }
  .plugin-stage-back:hover { background: var(--rail); color: var(--ink); }
  .plugin-stage-back svg { width: 16px; height: 16px; transform: rotate(180deg); }
  .plugin-stage-detail-bar {
    display: flex; align-items: center; gap: 8px; flex: none;
    min-height: 48px; padding: 8px 16px 8px 20px;
  }
  @media (max-width: 760px) {
    .plugin-stage-list { padding-top: 72px; }
    .plugin-stage-shell .feed-stage-search,
    .plugin-stage-shell .feed-stage-count,
    .plugin-stage-shell .shelf-stage-search { display: none; }
    .plugin-stage-shell[data-expanded="true"] .plugin-stage-chrome,
    .plugin-stage-shell[data-expanded="true"] .plugin-stage-list { display: none !important; }
    .plugin-stage-shell[data-expanded="true"] .plugin-stage-workspace {
      position: absolute; inset: 0; display: flex; flex-direction: column;
    }
  }
  @media (min-width: 761px) {
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] {
      display: grid; grid-template-columns: var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr); overflow: hidden; padding: 0;
    }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .plugin-stage-list {
      display: block; position: relative; inset: auto; z-index: 4;
      min-width: 0; min-height: 0; width: var(--tree-width, var(--immersive-sidebar-width)); height: auto; overflow: auto;
      border-right: 1px solid var(--line); padding: 52px 8px 20px; box-sizing: border-box;
      grid-column: 1; grid-row: 1;
    }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .plugin-stage-workspace {
      position: relative; inset: auto; z-index: 3;
      min-width: 0; min-height: 0; width: auto; height: auto;
      display: flex; flex-direction: column; overflow: hidden;
      grid-column: 2; grid-row: 1;
    }
    .plugin-stage-shell[data-expanded="true"] .plugin-stage-chrome { visibility: visible; }
    .plugin-stage-shell[data-expanded="true"] .feed-stage-search,
    .plugin-stage-shell[data-expanded="true"] .feed-stage-count,
    .plugin-stage-shell[data-expanded="true"] .shelf-stage-search { display: none; }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .shelf-stage-chrome { display: none; }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-list[data-shelf="directory"] { padding-top: 16px; }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .feed-stage-entry {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .feed-stage-entry > time,
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .feed-entry-source { display: none; }
  }
  body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail {
    padding: 0 24px 24px; margin: 0; border-radius: 0; background: transparent; animation: none;
  }
  body.immersive-workbench .plugin-stage-shell .feed-filter-control { position: relative; overflow: visible; }
  body.immersive-workbench .plugin-stage-shell .feed-filter-panel {
    left: 0; right: auto; top: calc(100% + 6px);
  }
  body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail .feed-detail-header :is(h1, .feed-detail-kicker, p, time) { display: revert; }
  body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail .feed-detail-body {
    max-height: none; overflow: visible; padding: 0;
  }
`;
