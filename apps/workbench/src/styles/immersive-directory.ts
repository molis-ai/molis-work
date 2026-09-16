/** Directory density belongs to the immersive shell; plugin detail surfaces keep their own layout. */
export const IMMERSIVE_DIRECTORY_STYLES = `
  body.immersive-workbench .tree-resizer {
    display: block;
    grid-column: 2; grid-row: 1 / -1; justify-self: end; align-self: stretch;
    width: 8px; margin-right: -4px; z-index: 25; background: transparent;
  }
  body.immersive-workbench .tree-resizer::before { inset: 0; }
  body.immersive-workbench .tree-resizer::after { inset: 0 auto 0 3px; background: transparent; }
  body.immersive-workbench .tree-resizer:is(:hover, :focus-visible, .is-dragging)::after { width: 2px; background: var(--blue); }
  body.immersive-workbench .is-directory-collapsed > .tree-resizer,
  body.immersive-workbench .is-plugin-directory-empty > .tree-resizer { display: none; }
  body.immersive-workbench .immersive-workspace:has(.tree-resizer.is-dragging) { cursor: col-resize; user-select: none; }

  body.immersive-workbench .tree-pane .tree-row { min-height: 28px; padding: 0; align-items: center; }
  body.immersive-workbench .tree-pane .tree-entry { min-height: 28px; height: 28px; box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-entry:hover { background: var(--nav-hover); }
  body.immersive-workbench .tree-pane .tree-node { display: block; min-width: 0; height: 28px; min-height: 28px; padding: 0 4px; box-shadow: none; text-align: left; }
  body.immersive-workbench .tree-pane .tree-node:is(:hover, .is-selected) { background: transparent; box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-copy { min-width: 0; display: block; overflow: hidden; }
  body.immersive-workbench .tree-pane .tree-title-line { display: block; min-width: 0; }
  body.immersive-workbench .tree-pane .tree-title-line strong { display: block; font-size: 13px; font-weight: 450; line-height: 18px; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .tree-toggle,
  body.immersive-workbench .tree-pane .tree-guide { width: 16px; height: 28px; min-height: 28px; flex: 0 0 16px; }
  body.immersive-workbench .tree-pane .tree-children { margin-left: 6px; padding-left: 6px; }
  body.immersive-workbench .tree-pane .tree-entry > .directory-row-state { display: inline-flex; align-items: center; flex: none; width: auto; height: 22px; min-height: 0; margin: 0 5px 0 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status { padding: 0; border: 0; background: transparent; box-shadow: none; gap: 4px; font-size: 11px; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status > span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }


  body.immersive-workbench .tree-pane [data-directory-list-actions] { position: static; display: flex; align-items: center; justify-content: flex-start; flex-wrap: nowrap; gap: 4px; margin: 0; padding: 0 8px; background: transparent; border: 0; width: 100%; box-sizing: border-box; }
  body.immersive-workbench .tree-pane .goal-collection-fold { margin: 0; border-top: 0; }
  body.immersive-workbench .tree-pane .goal-collection-fold > summary { height: var(--dir-row-h, 28px); min-height: var(--dir-row-h, 28px); padding: 0 4px; border-radius: 5px; color: var(--muted); }
  body.immersive-workbench .tree-pane .goal-collection-fold > summary:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .tree-pane .goal-collection-fold > summary strong { font-size: 11px; font-weight: 550; }
  body.immersive-workbench .tree-pane .goal-collection-empty { padding: 4px 8px 8px 22px; font-size: 11px; }
  body.immersive-workbench .tree-pane .project-record-directory > .desktop-directory-heading { display: none !important; }
  body.immersive-workbench .tree-pane .project-record-filter-menu { position: static; min-width: 0; }
  body.immersive-workbench .tree-pane .project-record-filter-menu > summary { list-style: none; }
  body.immersive-workbench .tree-pane .project-record-filter-menu > summary::-webkit-details-marker { display: none; }
  body.immersive-workbench .tree-pane .tree-filter-control { position: static; }
  body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary, .source-filter-menu > summary, .project-record-add-compact, .feed-filter-trigger, .source-mobile-add) { width: 27px; height: 27px; min-height: 27px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary span, .source-mobile-add) { font-size: 0; }
  body.immersive-workbench .tree-pane .project-record-filter-menu > summary span { display: none; }
  body.immersive-workbench .tree-pane :is(.project-record-add-compact, .project-record-filter-menu > summary, .source-filter-menu > summary, .feed-filter-trigger, .source-mobile-add) svg { width: 15px; height: 15px; }
  body.immersive-workbench .tree-pane :is(.project-record-add-compact, .project-record-filter-menu > summary, .source-filter-menu > summary, .feed-filter-trigger, .source-mobile-add, .tree-tool):hover { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .project-record-filter-menu[open] > summary,
  body.immersive-workbench .tree-pane .source-filter-menu[open] > summary,
  body.immersive-workbench .tree-pane .feed-filter-trigger[aria-expanded="true"],
  body.immersive-workbench .tree-pane .tree-tool[aria-expanded="true"],
  body.immersive-workbench .tree-pane .tree-tool.is-active { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tree-pane :is(.tree-filter, .project-record-filter-menu > div, .feed-filter-panel, .source-filter-menu > .source-filter-row) {
    position: absolute; top: calc(var(--dir-row-h, 28px) + var(--control-h, 28px) + 4px); left: 8px; right: 8px; bottom: auto; z-index: 30;
    width: auto; max-width: none; min-width: 0; max-height: min(280px, 42vh); box-sizing: border-box;
    margin: 0; padding: 12px; border: 0; border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: 0 8px 24px #10131c26; overflow: auto;
  }
  body.immersive-workbench .tree-pane .project-record-filter-menu > div { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  body.immersive-workbench .tree-pane .project-record-filter-menu:not([open]) > div { display: none; }
  body.immersive-workbench .tree-pane .project-record-filter-menu label { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-filter-menu select { width: 100%; min-width: 0; height: 30px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-bg); color: var(--ink); font: inherit; font-size: 11px; }
  body.immersive-workbench .tree-pane .project-record-row {
    display: flex; align-items: center; gap: 8px; height: 28px; min-height: 28px; box-sizing: border-box;
    padding: 0 7px; grid-template-columns: unset; grid-template-rows: unset; border-radius: 5px; box-shadow: none; overflow: hidden;
  }
  body.immersive-workbench .tree-pane .project-record-row:hover { background: var(--nav-hover); box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .project-record-row.is-selected { background: var(--nav-active); box-shadow: none; color: var(--ink); }
  html[data-resolved-theme="light"] body.immersive-workbench .tree-pane .project-record-directory .project-record-row.is-selected {
    background: color-mix(in srgb, var(--blue) 8%, transparent) !important;
    box-shadow: none;
  }
  body.immersive-workbench .tree-pane .project-record-row.is-selected .project-record-select strong { font-weight: 450; }
  body.immersive-workbench .tree-pane .project-record-select { display: block; flex: 1; min-width: 0; grid-column: unset; grid-row: unset; }
  body.immersive-workbench .tree-pane .project-record-select > span { display: flex; align-items: center; min-width: 0; height: 20px; grid-template-rows: unset; }
  body.immersive-workbench .tree-pane .project-record-select strong { color: var(--ink); font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .project-record-select small,
  body.immersive-workbench .tree-pane .project-record-meta { display: none !important; }
  body.immersive-workbench .tree-pane .project-record-row > .directory-row-state {
    display: inline-flex; align-items: center; flex: none; width: auto; height: 22px; min-height: 0; margin: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent; font-size: 11px; font-weight: 400;
  }
  body.immersive-workbench .tree-pane .project-record-row .goal-status {
    padding: 0; border: 0; background: transparent; box-shadow: none; gap: 4px; font-size: 11px; line-height: 18px; white-space: nowrap;
  }
  body.immersive-workbench .tree-pane .project-record-row .goal-status > span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
  body.immersive-workbench .tree-pane .project-record-row .goal-status svg { width: 13px; height: 13px; flex: none; }

  body.immersive-workbench .tree-pane .feed-directory-tools,
  body.immersive-workbench .tree-pane .feed-directory-toolbar,
  body.immersive-workbench .tree-pane .feed-filter-control { position: static; overflow: visible; }
  body.immersive-workbench .tree-pane .feed-directory-toolbar { display: flex; align-items: center; }
  body.immersive-workbench .tree-pane .feed-filter-section > span { font-size: 11px; font-weight: 500; letter-spacing: 0; }
  body.immersive-workbench .tree-pane .feed-filter-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body.immersive-workbench .tree-pane .feed-filter-option { min-height: 32px; font-size: 11px; border-radius: 5px; }
  body.immersive-workbench .tree-pane :is(.tree-scroll, .feed-item-scroll, .source-list, .project-record-scroll, [data-artifact-directory]) { min-height: 0; height: auto; overflow: visible; padding: 0; }
  body.immersive-workbench .tree-pane .project-record-empty:not([hidden]) { background: var(--nav-bg); }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty, .artifact-empty) { flex: none; margin: 0; padding: 18px 8px; border: 0; border-radius: 0; background: transparent; display: grid; align-content: start; justify-items: start; gap: 6px; color: var(--muted); text-align: left; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) > svg { display: none; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) strong { font-size: 13px; font-weight: 450; color: var(--ink); }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) p,
  body.immersive-workbench .tree-pane p.artifact-empty { max-width: 32ch; margin: 0; font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) button { min-height: 36px; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font-size: 11px; }
  body.immersive-workbench .tree-pane .feed-list-item { position: relative; height: 36px; min-height: 36px; box-sizing: border-box; padding: 2px 6px; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 0 8px; border-radius: 6px; box-shadow: none; overflow: hidden; }
  body.immersive-workbench .tree-pane .feed-list-item:is(:hover, .is-selected) { background: var(--nav-active) !important; box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .feed-list-icon { display: none; }
  body.immersive-workbench .tree-pane .feed-list-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 20px 16px; gap: 0 8px; min-width: 0; }
  body.immersive-workbench .tree-pane .feed-list-copy > strong { grid-column: 1; grid-row: 1; font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .feed-list-copy > p { display: none; }
  body.immersive-workbench .tree-pane .feed-list-copy > .feed-list-meta { grid-column: 1; grid-row: 2; min-width: 0; }
  body.immersive-workbench .tree-pane .feed-list-copy :is(em, small, time) { font-size: 11px; font-weight: 400; line-height: 16px; }
  body.immersive-workbench .tree-pane .feed-list-copy time { grid-column: 2; grid-row: 2; align-self: center; }
  body.immersive-workbench .tree-pane .feed-list-meta em,
  body.immersive-workbench .tree-pane .feed-list-copy small.feed-list-read { display: none; }
  body.immersive-workbench .tree-pane .feed-list-state { align-self: center; padding: 0; border: 0; background: transparent; border-radius: 0; font-size: 11px; font-weight: 400; }
  body.immersive-workbench .tree-pane .feed-list-state[data-feed-disposition="feed"] { display: none; }
  body.immersive-workbench .tree-pane :is(.tree-footer, .feed-directory-footer, [data-tree-footer]) { display: none !important; }
  body.immersive-workbench .tree-pane .source-filter-menu { position: static; }
  body.immersive-workbench .tree-pane .source-filter-menu > summary { list-style: none; }
  body.immersive-workbench .tree-pane .source-filter-menu > summary::-webkit-details-marker { display: none; }
  body.immersive-workbench .tree-pane .source-mobile-add { border: 0 !important; color: var(--muted) !important; background: transparent !important; box-shadow: none !important; }
  body.immersive-workbench .tree-pane .source-mobile-add:hover { color: var(--ink) !important; background: var(--nav-active) !important; }
  body.immersive-workbench .tree-pane .source-filter-menu[open] > .source-filter-row { display: grid; gap: 4px; }
  body.immersive-workbench .tree-pane .source-filter-menu:not([open]) > .source-filter-row { display: none; }
  body.immersive-workbench .tree-pane .source-filter-row button { min-height: 32px; padding: 0 8px; border: 0; border-radius: 5px; font-size: 11px; text-align: left; color: var(--muted); background: transparent; cursor: pointer; }
  body.immersive-workbench .tree-pane .source-filter-row button.is-active { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .inbox-filter-row { flex-wrap: nowrap; }
  body.immersive-workbench .tree-pane .inbox-filter-row button { min-height: 26px; padding: 0 8px; border: 0; border-radius: 5px; font-size: 11px; cursor: pointer; color: var(--muted); background: transparent; }
  body.immersive-workbench .tree-pane .inbox-filter-row button.is-active { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .source-list-item { height: 36px; min-height: 36px; box-sizing: border-box; padding: 2px 6px; border-radius: 6px; overflow: hidden; align-items: center; }
  body.immersive-workbench .tree-pane .source-list-item:is(:hover, .is-selected) { background: var(--nav-active); box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .source-list-copy strong { font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .source-list-copy :is(p, small, em) { font-size: 11px; font-weight: 400; line-height: 16px; }
  body.immersive-workbench .tree-pane .source-list-copy p { display: none; }
  body.immersive-workbench .tree-pane .artifact-version-list a { min-height: 36px; padding: 4px 6px; border-radius: 6px; font-size: 13px; font-weight: 450; }
  body.immersive-workbench .tree-pane .artifact-version-list a[aria-current],
  body.immersive-workbench .tree-pane .artifact-version-list a:hover { background: var(--nav-active); }
  body.immersive-workbench .tree-pane .artifact-version-list small { font-size: 11px; color: var(--muted); }

  body.immersive-workbench .feed-workbench { padding: 0; background: var(--canvas); overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .feed-stage-directory { display: flex; flex-direction: column; width: 100%; min-width: 0; min-height: 100%; max-width: 1120px; margin-inline: auto; padding: 16px 28px 40px; box-sizing: border-box; }
  body.immersive-workbench .feed-stage-toolbar { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; gap: 10px; min-height: 44px; margin: -16px -8px 16px; padding: 8px; border-bottom: 1px solid var(--line); background: var(--canvas); }
  body.immersive-workbench .feed-stage-toolbar .feed-directory-tools,
  body.immersive-workbench .feed-stage-toolbar .feed-directory-toolbar,
  body.immersive-workbench .feed-stage-toolbar .feed-filter-control { position: relative; overflow: visible; }
  body.immersive-workbench .feed-stage-toolbar .feed-filter-trigger { width: 27px; height: 27px; min-height: 27px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  body.immersive-workbench .feed-stage-toolbar .feed-filter-trigger svg { width: 15px; height: 15px; }
  body.immersive-workbench .feed-stage-toolbar .feed-filter-trigger:is(:hover, [aria-expanded="true"], .is-active) { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .feed-stage-toolbar .feed-filter-panel {
    position: absolute; top: 32px; left: 0; z-index: 30; width: min(360px, calc(100vw - 48px)); max-height: min(320px, 50vh);
    margin: 0; padding: 12px; border: 0; border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: 0 8px 24px #10131c26; overflow: auto;
  }
  body.immersive-workbench .feed-stage-toolbar > h1 { margin: 0 auto 0 0; font-size: 15px; font-weight: 550; letter-spacing: -.01em; }
  body.immersive-workbench .feed-stage-count { color: var(--muted); font-size: 11px; }
  body.immersive-workbench .feed-stage-tree { display: flex; flex-direction: column; gap: 12px; width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-task-head,
  body.immersive-workbench .feed-stage-add-toggle {
    display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 8px;
    width: 100%; height: 52px; min-height: 52px; padding: 8px 10px; box-sizing: border-box;
    border: 0; border-radius: 6px; background: transparent; color: var(--ink); text-align: left; cursor: pointer;
  }
  body.immersive-workbench .feed-stage-add-toggle { grid-template-columns: 16px auto; justify-content: start; color: var(--muted); font: inherit; font-size: 13px; font-weight: 450; }
  body.immersive-workbench .feed-stage-task-head:hover,
  body.immersive-workbench .feed-stage-add-toggle:hover,
  body.immersive-workbench .feed-stage-task.is-open > .feed-stage-task-head { background: var(--nav-active); }
  body.immersive-workbench .feed-stage-chevron { display: grid; place-items: center; color: var(--faint); }
  body.immersive-workbench .feed-stage-chevron svg { width: 14px; height: 14px; transition: transform 160ms cubic-bezier(.16, 1, .3, 1); }
  body.immersive-workbench .feed-stage-task.is-open > .feed-stage-task-head .feed-stage-chevron svg { transform: rotate(90deg); }
  body.immersive-workbench .feed-stage-task-copy { min-width: 0; display: grid; grid-template-rows: 20px 16px; }
  body.immersive-workbench .feed-stage-task-copy strong { font-size: 13px; font-weight: 600; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-task-copy small { font-size: 11px; line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-task { width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-task-body { width: 100%; min-width: 0; padding: 8px 0 12px 24px; box-sizing: border-box; }
  body.immersive-workbench .feed-stage-list { width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-item { width: 100%; min-width: 0; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .feed-stage-item-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-entry {
    display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 0;
    width: 100%; min-width: 0; height: 52px; min-height: 52px; padding: 8px 10px; box-sizing: border-box;
    border: 0; border-radius: 6px; background: transparent; box-shadow: none; color: var(--ink); text-align: left; cursor: pointer;
  }
  body.immersive-workbench .feed-stage-entry:is(:hover, .is-selected, .is-open),
  body.immersive-workbench .feed-stage-item.is-open > .feed-stage-item-line .feed-stage-entry { background: var(--nav-active); }
  body.immersive-workbench .feed-stage-entry-copy { min-width: 0; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 20px 16px; }
  body.immersive-workbench .feed-stage-entry-copy strong { min-width: 0; font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-entry-copy small { min-width: 0; font-size: 11px; line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-ignore {
    min-height: 28px; padding: 0 8px; border: 0; border-radius: 5px; background: transparent; color: var(--muted);
    font: inherit; font-size: 11px; cursor: pointer;
  }
  body.immersive-workbench .feed-stage-ignore:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .feed-list-empty { margin: 8px 0; padding: 8px; background: transparent; color: var(--muted); display: grid; justify-items: start; gap: 6px; }
  body.immersive-workbench .feed-list-empty strong { font-size: 13px; font-weight: 450; color: var(--ink); }
  body.immersive-workbench .feed-list-empty button { min-height: 36px; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 11px; cursor: pointer; }
  body.immersive-workbench .feed-stage-item-detail { padding: 16px clamp(12px, 3cqi, 32px) 24px; background: var(--paper); border-radius: 10px; margin-block: 8px 16px; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail,
  body.immersive-workbench .feed-stage-item-detail .feed-detail--prototype {
    width: 100%; max-width: 76ch; margin: 0 auto; padding: 8px 4px 12px; border-radius: 0; background: transparent; box-shadow: none;
  }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-header h1 {
    max-width: none; font-size: 20px; font-weight: 600; letter-spacing: -.02em; line-height: 1.4;
  }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-kicker { margin-bottom: 8px; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-body { margin-top: 16px; padding-top: 12px; max-width: none; }
  body.immersive-workbench .feed-stage-item-detail .feed-materials { margin-top: 16px; }
  body.immersive-workbench .feed-stage-loading { margin: 8px 0; color: var(--muted); font-size: 12px; }
  body.immersive-workbench .feed-workbench .feed-detail-empty { display: none; }
  body.immersive-workbench .feed-stage-add { margin-top: 4px; }
  body.immersive-workbench .feed-stage-add-form { display: grid; gap: 10px; max-width: 420px; margin: 4px 0 0 24px; padding: 10px 0 8px; }
  body.immersive-workbench .feed-stage-add-form label { display: grid; gap: 4px; color: var(--muted); font-size: 11px; }
  body.immersive-workbench .feed-stage-add-form input { height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; }
  body.immersive-workbench .feed-stage-add-actions { display: flex; gap: 8px; align-items: center; }
  body.immersive-workbench .feed-stage-add-actions button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 6px; font: inherit; font-size: 12px; cursor: pointer; }
  body.immersive-workbench .feed-stage-add-actions .button-primary { color: var(--paper); background: var(--blue-dark); }
  body.immersive-workbench .feed-stage-add-actions button:not(.button-primary) { color: var(--muted); background: transparent; }
  body.immersive-workbench .feed-stage-demo { margin-top: 12px; border: 0; background: transparent; color: var(--faint); font: inherit; font-size: 11px; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) {
    body.immersive-workbench .feed-stage-chevron svg { transition: none; }
  }
  @media (max-width: 600px) {
    body.immersive-workbench .tree-resizer { display: none; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle,
    body.immersive-workbench .tree-pane .project-record-row { height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary, .source-filter-menu > summary, .project-record-add-compact, .feed-filter-trigger, .source-mobile-add, .tree-tool) { width: 36px; height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane .inbox-filter-row button { min-height: 32px; }
    body.immersive-workbench .tree-pane .project-record-filter-menu select { height: 36px; }
    body.immersive-workbench .feed-stage-directory { padding: 16px 12px 28px; }
    body.immersive-workbench .feed-stage-task-body { padding-left: 12px; }
    body.immersive-workbench .feed-stage-add-form { margin-left: 12px; }
  }

  body.immersive-workbench .feed-source-directory { padding: 8px; }
  body.immersive-workbench .feed-source-directory > header { display: flex; align-items: center; justify-content: space-between; height: 36px; padding: 0 8px; }
  body.immersive-workbench .feed-source-directory > header > button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; background: transparent; border: 0; border-radius: 6px; color: var(--muted); }
  body.immersive-workbench .feed-source-directory svg { width: 15px; height: 15px; }
  body.immersive-workbench .feed-source-directory h2 { margin: 22px 8px 8px; color: var(--muted); font-size: 11px; font-weight: 500; }
  body.immersive-workbench .feed-source-task { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; width: 100%; gap: 8px; min-height: 54px; padding: 8px; text-align: left; color: var(--ink); background: transparent; border: 0; border-radius: 8px; font: inherit; cursor: pointer; }
  body.immersive-workbench .feed-source-task > span:nth-child(2) { display: grid; gap: 3px; min-width: 0; }
  body.immersive-workbench .feed-source-task strong { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .feed-source-task small { color: var(--muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .feed-source-task-icon, body.immersive-workbench .feed-source-task-count { color: var(--muted); font-size: 11px; }
  body.immersive-workbench .feed-source-task:hover { background: var(--nav-hover); }
  body.immersive-workbench .feed-source-task[aria-current] { background: var(--nav-active); }
  body.immersive-workbench .feed-directory-add { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 12px; min-height: 36px; padding: 0 8px; border: 0; border-radius: 8px; color: var(--muted); background: transparent; text-align: left; font: inherit; font-size: 12px; }
  body.immersive-workbench .tab-pane-body > .feed-workbench,
  body.immersive-workbench .feed-workbench { overflow: hidden; }
  body.immersive-workbench .feed-stage-directory { max-width:none; height:100%; min-height:0; padding:0; }
  body.immersive-workbench .feed-stage-tree { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; padding:8px clamp(16px, 3vw, 40px) 24px; }
  body.immersive-workbench .feed-stage-list { max-width:1104px; margin-inline:auto; }
  body.immersive-workbench .feed-stage-toolbar { position:relative; flex:none; min-height:32px; padding:4px 12px; margin:0; gap:8px; border-bottom:1px solid var(--line-strong); background:var(--paper); }
  body.immersive-workbench .feed-stage-heading { margin-right: auto; min-width: 0; }
  body.immersive-workbench .feed-stage-heading h1 { font-size: 13px; line-height: 1.3; font-weight: 550; letter-spacing: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .feed-stage-search { display: flex; align-items: center; gap: 6px; min-width: 80px; max-width: 200px; height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); }
  body.immersive-workbench .feed-stage-search svg { width: 14px; height: 14px; flex: none; }
  body.immersive-workbench .feed-stage-search input { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px; }
  body.immersive-workbench .feed-stage-toolbar .feed-filter-panel { left: auto; right: 0; }
  body.immersive-workbench .tab-pane-body > .feed-workbench { background: var(--paper); }
  body.immersive-workbench .feed-stage-list { padding-top: 8px; }
  body.immersive-workbench .feed-stage-item { border: 1px solid transparent; border-bottom-color: var(--line); border-radius: 10px; transition: background-color 120ms ease, border-color 120ms ease; }
  body.immersive-workbench .feed-stage-item.is-open { margin-block: 6px; border-color: var(--line); background: var(--paper); }
  body.immersive-workbench .feed-stage-item-line { display: block; }
  body.immersive-workbench .feed-stage-entry { height: 40px; min-height: 40px; padding: 4px 8px; grid-template-columns: 16px minmax(0, 1fr) 14px; align-items: center; gap: 8px; border-radius: 6px; overflow: hidden; }
  body.immersive-workbench .feed-stage-entry:is(:hover, .is-selected, .is-open),
  body.immersive-workbench .feed-stage-item.is-open > .feed-stage-item-line .feed-stage-entry { background: transparent; }
  body.immersive-workbench .feed-stage-item:not(.is-open):hover { background: var(--nav-hover); }
  body.immersive-workbench .feed-stage-entry:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: -2px; }
  body.immersive-workbench .feed-entry-provider { display: grid; place-items: center; width: 28px; height: 28px; color: var(--muted); border: 1px solid var(--line); border-radius: 7px; background: var(--nav-bg); }
  body.immersive-workbench .feed-entry-provider svg { width: 15px; height: 15px; }
  body.immersive-workbench .feed-stage-entry-copy { grid-template-rows: auto; gap: 4px; }
  body.immersive-workbench .feed-entry-origin { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; color: var(--muted); font-size: 11px; line-height: 18px; }
  body.immersive-workbench .feed-entry-origin > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 36ch; }
  body.immersive-workbench .feed-entry-origin time { font-variant-numeric: tabular-nums; }
  body.immersive-workbench .feed-entry-read { display: inline-flex; align-items: center; gap: 4px; }
  body.immersive-workbench .feed-stage-entry[data-feed-entry-read="unread"] .feed-entry-read { color: var(--blue-dark); }
  body.immersive-workbench .feed-stage-entry[data-feed-entry-read="unread"] .feed-entry-read::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  body.immersive-workbench .feed-entry-state { padding-inline: 5px; background: var(--nav-active); border-radius: 4px; color: var(--ink); }
  body.immersive-workbench .feed-stage-entry-copy strong { font-size: 13px; font-weight: 450; white-space: nowrap; line-height: 18px; }
  body.immersive-workbench .feed-entry-summary { display: none; }
  body.immersive-workbench .feed-entry-chevron { margin-top: 2px; color: var(--muted); }
  body.immersive-workbench .feed-entry-chevron svg { width: 14px; height: 14px; transition: transform 160ms ease; }
  body.immersive-workbench .feed-stage-item.is-open .feed-entry-chevron svg { transform: rotate(180deg); }
  body.immersive-workbench .feed-stage-item.is-open .feed-entry-summary { display: none; }
  body.immersive-workbench .feed-stage-item.is-open .feed-stage-entry { min-height: 0; padding-bottom: 10px; }
  body.immersive-workbench .feed-stage-item-detail { border-radius: 0; background: transparent; padding: 0 40px 16px 52px; margin: 0; animation: feed-reader-reveal 160ms ease-out; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail { max-width: 76ch; margin: 0; padding: 0; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-header :is(h1, .feed-detail-kicker, p, time) { display: none; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-meta { margin: 0 0 12px; font-size: 11px; gap: 8px 14px; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-meta :is(a, button) { min-height: 28px; color: var(--muted); }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-body { margin:0; padding:0 8px 0 0; border:0; max-height:min(52dvh, 480px); overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-body > h2 { display: none; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content { font-size: 14px; line-height: 1.8; color: var(--ink-soft); overflow-wrap: anywhere; white-space: normal; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content :is(h1,h2,h3,h4) { line-height: 1.5; letter-spacing: -.01em; font-weight: 600; text-transform: none; color: var(--ink); margin: 1.5em 0 .6em; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content :is(h1,h2) { font-size: 18px; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content :is(h3,h4) { font-size: 15px; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content pre { max-width: 100%; overflow: auto; background: var(--nav-bg); border: 1px solid var(--line); }
  body.immersive-workbench .feed-reader-footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }
  body.immersive-workbench .feed-reader-footer .feed-destination-strip { margin: 0 0 12px; padding: 0; border: 0; display: flex; flex-wrap: wrap; gap: 6px 8px; }
  body.immersive-workbench .feed-reader-footer .feed-destination-strip > span { font-size: 11px; }
  body.immersive-workbench .feed-reader-footer .feed-destination-strip strong { font-size: 11px; font-weight: 500; }
  body.immersive-workbench .feed-reader-footer .feed-destination-strip small { width: 100%; font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .feed-reader-footer .feed-detail-actions { margin: 0; gap: 8px; }
  body.immersive-workbench .feed-reader-footer .feed-detail-actions button { min-height: 34px; padding: 0 10px; font-size: 12px; font-weight: 500; border-radius: 6px; flex: none; }
  body.immersive-workbench .feed-reader-footer .feed-detail-actions button:hover:not(:disabled) { transform: none; box-shadow: none; filter: brightness(.96); }
  body.immersive-workbench .feed-stage-item-detail .feed-materials { margin-top: 20px; padding: 0; border: 1px solid var(--line); border-radius: 7px; }
  body.immersive-workbench .feed-materials > summary { display: flex; align-items: center; gap: 8px; padding: 12px; list-style: none; font-size: 12px; cursor: pointer; }
  body.immersive-workbench .feed-materials > summary::-webkit-details-marker { display: none; }
  body.immersive-workbench .feed-materials > summary svg { width: 14px; height: 14px; color: var(--muted); }
  body.immersive-workbench .feed-materials > summary small { margin-left: auto; color: var(--muted); }
  body.immersive-workbench .feed-materials[open] > summary > svg:last-child { transform: rotate(180deg); }
  body.immersive-workbench .feed-materials ul { padding: 0 12px; }
  body.immersive-workbench .feed-materials li strong { font-size: 12px; font-weight: 500; }
  body.immersive-workbench .feed-materials li :is(small,p) { font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .feed-stage-item-detail .prototype-honesty-note { margin-top: 16px; font-size: 11px; line-height: 1.6; color: var(--muted); }
  @keyframes feed-reader-reveal { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    body.immersive-workbench .feed-stage-item-detail { animation: none; }
    body.immersive-workbench .feed-entry-chevron svg { transition: none; }
  }
  body.immersive-workbench .feed-stage-add:not(.is-open) { display: none; }
  body.immersive-workbench .feed-stage-add-form { max-width: 520px; margin: 0; }
  @media (max-width: 760px) {
    body.immersive-workbench .feed-stage-directory { padding:0; }
    body.immersive-workbench .feed-stage-toolbar { flex-wrap:wrap; margin:0; padding:12px 16px; gap:8px; }
    body.immersive-workbench .feed-stage-heading { flex: 1; }
    body.immersive-workbench .feed-stage-search { max-width: none; width: 100%; order: 2; height: 44px; }
    body.immersive-workbench .feed-stage-search input { font-size: 16px; }
    body.immersive-workbench .feed-stage-toolbar .feed-filter-trigger, body.immersive-workbench .feed-stage-ignore { min-width: 44px; min-height: 44px; }
    body.immersive-workbench .feed-stage-entry { padding: 14px 10px; grid-template-columns: 24px minmax(0, 1fr) 14px; gap: 8px; }
    body.immersive-workbench .feed-entry-provider { width: 24px; height: 24px; }
    body.immersive-workbench .feed-stage-item-detail { padding: 0 12px 16px; }
    body.immersive-workbench .feed-reader-footer .feed-detail-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    body.immersive-workbench .feed-reader-footer .feed-detail-actions button { width: 100%; min-height: 44px; }
    body.immersive-workbench .feed-stage-entry-copy small { flex-wrap: wrap; gap: 4px 10px; }
  }

  body.immersive-workbench .tree-pane .settings-directory-nav { display: grid; gap: 1px; }
  body.immersive-workbench .tree-pane .settings-directory-nav > button {
    display: flex; align-items: center; min-width: 0; min-height: var(--dir-row-h, 28px); padding: 0 8px; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 450; text-align: left; cursor: pointer;
  }
  body.immersive-workbench .tree-pane .settings-directory-nav > button:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench .tree-pane .settings-directory-nav > button[aria-current="page"] { background: var(--nav-active); color: var(--ink); font-weight: 550; }
  body.immersive-workbench .tree-pane .settings-directory-body { min-width: 0; }
  body.immersive-workbench .tree-pane .settings-document { width: auto; max-width: none; margin: 0; padding: 4px 0 0; }
  body.immersive-workbench .tree-pane .settings-heading { padding: 0 0 8px; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .tree-pane .settings-heading h1 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.4; letter-spacing: 0; }
  body.immersive-workbench .tree-pane .settings-heading p { display: none; }
  body.immersive-workbench .tree-pane .settings-body { overflow: visible; padding: 0; }
  body.immersive-workbench .tree-pane .settings-setting-row { display: flex; flex-direction: column; align-items: stretch; gap: 8px; margin: 0; padding: 10px 0; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .tree-pane .setting-copy { display: grid; gap: 2px; min-width: 0; }
  body.immersive-workbench .tree-pane .setting-copy > strong { font-size: 13px; font-weight: 550; line-height: 1.4; }
  body.immersive-workbench .tree-pane .setting-copy > span { color: var(--muted); font-size: 11px; line-height: 1.45; }
  body.immersive-workbench .tree-pane .setting-value { max-width: 100%; }
  body.immersive-workbench .tree-pane .settings-segmented { display: flex; flex-wrap: wrap; padding: 3px; gap: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--nav-bg); }
  body.immersive-workbench .tree-pane .settings-segmented > :is(button, a) {
    display: flex; align-items: center; justify-content: center; flex: 1; min-height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: 6px;
    color: var(--muted); background: transparent; text-decoration: none; font-size: 12px; white-space: nowrap; box-shadow: none; cursor: pointer;
  }
  body.immersive-workbench .tree-pane .settings-segmented > :is([aria-pressed="true"], [aria-current="true"]) { border-color: var(--line); color: var(--ink); background: var(--paper); }
  body.immersive-workbench .tree-pane .settings-footnote { margin: 10px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  body.immersive-workbench .tree-pane .settings-record { padding: 0; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .tree-pane .settings-record > header { min-height: 0; padding: 10px 0; display: grid; gap: 8px; }
  body.immersive-workbench .tree-pane .settings-record-title { display: flex; gap: 8px; min-width: 0; }
  body.immersive-workbench .tree-pane .settings-record-title .record-icon { display: none; }
  body.immersive-workbench .tree-pane .settings-record-title h2, body.immersive-workbench .tree-pane .settings-record-title h3 { margin: 0; font-size: 13px; font-weight: 550; }
  body.immersive-workbench .tree-pane .settings-record-title p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  body.immersive-workbench .tree-pane .settings-record-action { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  body.immersive-workbench .tree-pane .settings-record-action button, body.immersive-workbench .tree-pane .service-action-row button {
    min-height: var(--control-h, 28px); padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--paper); font: inherit; font-size: 12px; cursor: pointer;
  }
  body.immersive-workbench .tree-pane .settings-state { font-size: 11px; font-weight: 600; }
  body.immersive-workbench .tree-pane .settings-state--success { color: var(--green); }
  body.immersive-workbench .tree-pane .settings-state--warning { color: var(--amber); }
  body.immersive-workbench .tree-pane .settings-state--danger { color: var(--red); }
  body.immersive-workbench .tree-pane .settings-state--neutral { color: var(--muted); }
  body.immersive-workbench .tree-pane .diagnostics-summary { padding: 10px 0; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
  body.immersive-workbench .tree-pane .diagnostics-summary h2, body.immersive-workbench .tree-pane .launcher-section h2 { margin: 0; font-size: 13px; }
  body.immersive-workbench .tree-pane .diagnostics-summary dl { margin: 8px 0 0; display: grid; gap: 6px; }
  body.immersive-workbench .tree-pane .diagnostics-summary dl > div { display: grid; gap: 2px; }
  body.immersive-workbench .tree-pane .launcher-section ul { list-style: none; margin: 8px 0 0; padding: 0; }
  body.immersive-workbench .tree-pane .launcher-section li { min-height: 0; padding: 8px 0; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  body.immersive-workbench .tree-pane .settings-paths { margin: 0; padding: 0; display: grid; gap: 4px; }
  body.immersive-workbench .tree-pane .settings-paths dd { margin: 0; overflow-wrap: anywhere; font-size: 11px; }
  body.immersive-workbench .tree-pane .planning-catalog, body.immersive-workbench .tree-pane .work-planning { width: auto; max-width: none; margin: 0; padding: 0; }
  body.immersive-workbench .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--paper); box-shadow: 0 8px 32px #00000035; }
  body.immersive-workbench .runtime-plan-dialog::backdrop { background: rgba(27, 35, 45, .34); }
  body.immersive-workbench .runtime-plan-shell { max-height: min(760px, calc(100dvh - 28px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  body.immersive-workbench .runtime-plan-shell > header { padding: 16px 18px 14px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; }
  body.immersive-workbench .runtime-plan-shell h2 { margin: 0; font-size: 16px; }
  body.immersive-workbench .runtime-plan-shell header p { margin: 4px 0 0; color: var(--muted); }
  body.immersive-workbench .runtime-plan-body { min-height: 0; overflow: auto; padding: 16px 18px; }
  body.immersive-workbench .runtime-change-list { list-style: none; margin: 0; padding: 0; }
  body.immersive-workbench .runtime-change-list li { padding: 10px 0; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  body.immersive-workbench .runtime-plan-shell > footer { padding: 12px 18px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .runtime-plan-shell > footer button { min-height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); cursor: pointer; }
  body.immersive-workbench .runtime-plan-shell > footer .runtime-plan-apply { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  body.immersive-workbench .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  body.immersive-workbench .runtime-plan-confirm { margin-top: 12px; padding: 10px; display: flex; gap: 8px; cursor: pointer; }
`;
