/** Directory density belongs to the immersive shell; plugin detail surfaces keep their own layout. */
export const IMMERSIVE_DIRECTORY_STYLES = `
  body.immersive-workbench .tree-resizer {
    display: block;
    grid-column: 1; grid-row: 2; justify-self: end; align-self: stretch;
    width: 8px; margin-right: -4px; z-index: 25; background: transparent;
  }
  body.immersive-workbench .tree-resizer::before { inset: 0; }
  body.immersive-workbench .tree-resizer::after { inset: 0 auto 0 3px; background: transparent; }
  body.immersive-workbench .tree-resizer:is(:hover, :focus-visible, .is-dragging)::after { width: 2px; background: var(--blue); }
  body.immersive-workbench .is-directory-collapsed > .tree-resizer { display: none; }
  body.immersive-workbench .immersive-workspace:has(.tree-resizer.is-dragging) { cursor: col-resize; user-select: none; }

  body.immersive-workbench .tree-pane .tree-row { min-height: 32px; padding: 0; align-items: center; }
  body.immersive-workbench .tree-pane .tree-entry { box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-entry:hover { background: var(--nav-active); }
  body.immersive-workbench .tree-pane .tree-node { display: block; min-width: 0; height: 32px; min-height: 32px; padding: 6px; box-shadow: none; text-align: left; }
  body.immersive-workbench .tree-pane .tree-node:is(:hover, .is-selected) { background: transparent; box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-copy { min-width: 0; display: block; overflow: hidden; }
  body.immersive-workbench .tree-pane .tree-title-line { display: block; min-width: 0; }
  body.immersive-workbench .tree-pane .tree-title-line strong { display: block; font-size: 13px; font-weight: 450; line-height: 20px; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .tree-toggle,
  body.immersive-workbench .tree-pane .tree-guide { width: 16px; height: 32px; min-height: 32px; flex: 0 0 16px; }
  body.immersive-workbench .tree-pane .tree-children { margin-left: 8px; padding-left: 7px; }
  body.immersive-workbench .tree-pane .tree-entry > .directory-row-state { display: inline-flex; align-items: center; flex: none; width: auto; height: 22px; min-height: 0; margin: 0 5px 0 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status { gap: 4px; font-size: 11px; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status > span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }


  body.immersive-workbench .tree-pane [data-directory-list-actions] { position: static; display: flex; align-items: center; justify-content: flex-end; gap: 2px; margin: 0; padding: 0 10px 0 4px; background: transparent; border: 0; }
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
    position: absolute; top: 40px; left: 8px; right: 8px; bottom: auto; z-index: 30;
    width: auto; max-width: none; min-width: 0; max-height: min(280px, 42vh); box-sizing: border-box;
    margin: 0; padding: 12px; border: 0; border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: 0 8px 24px #10131c26; overflow: auto;
  }
  body.immersive-workbench .tree-pane .project-record-filter-menu > div { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  body.immersive-workbench .tree-pane .project-record-filter-menu:not([open]) > div { display: none; }
  body.immersive-workbench .tree-pane .project-record-filter-menu label { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-filter-menu select { width: 100%; min-width: 0; height: 30px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-bg); color: var(--ink); font: inherit; font-size: 11px; }
  body.immersive-workbench .tree-pane .project-record-row { height: 44px; min-height: 44px; box-sizing: border-box; padding: 4px 8px; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 20px 16px; gap: 0 8px; border-radius: 6px; box-shadow: none; overflow: hidden; }
  body.immersive-workbench .tree-pane .project-record-row:is(:hover, .is-selected) { background: var(--nav-active); box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .project-record-select { grid-column: 1; grid-row: 1 / 3; min-width: 0; }
  body.immersive-workbench .tree-pane .project-record-select > span { display: grid; grid-template-rows: 20px 16px; min-width: 0; }
  body.immersive-workbench .tree-pane .project-record-select strong { color: var(--ink); font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .project-record-select small { font-size: 11px; line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .project-record-row > .directory-row-state { grid-column: 2; grid-row: 1; min-height: 0; height: auto; padding: 0; border: 0; background: transparent; border-radius: 0; font-size: 11px; font-weight: 400; align-self: center; }
  body.immersive-workbench .tree-pane .project-record-meta { display: block; grid-column: 2; grid-row: 2; font-size: 11px; line-height: 16px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-meta > span { display: none; }

  body.immersive-workbench .tree-pane .feed-directory-tools,
  body.immersive-workbench .tree-pane .feed-directory-toolbar,
  body.immersive-workbench .tree-pane .feed-filter-control { position: static; overflow: visible; }
  body.immersive-workbench .tree-pane .feed-directory-toolbar { display: flex; align-items: center; }
  body.immersive-workbench .tree-pane .feed-filter-section > span { font-size: 11px; font-weight: 500; letter-spacing: 0; }
  body.immersive-workbench .tree-pane .feed-filter-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body.immersive-workbench .tree-pane .feed-filter-option { min-height: 32px; font-size: 11px; border-radius: 5px; }
  body.immersive-workbench .tree-pane :is(.tree-scroll, .feed-item-scroll, .source-list, .project-record-scroll, [data-artifact-directory]) { min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; padding: 0; scrollbar-width: thin; }
  body.immersive-workbench .tree-pane .project-record-empty:not([hidden]) { background: var(--nav-bg); }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty, .artifact-empty) { flex: none; margin: 0; padding: 18px 8px; border: 0; border-radius: 0; background: transparent; display: grid; align-content: start; justify-items: start; gap: 6px; color: var(--muted); text-align: left; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) > svg { display: none; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) strong { font-size: 13px; font-weight: 450; color: var(--ink); }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) p,
  body.immersive-workbench .tree-pane p.artifact-empty { max-width: 32ch; margin: 0; font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) button { min-height: 32px; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font-size: 11px; }
  body.immersive-workbench .tree-pane .feed-list-item { position: relative; height: 44px; min-height: 44px; box-sizing: border-box; padding: 4px 8px; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 0 8px; border-radius: 6px; box-shadow: none; overflow: hidden; }
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
  body.immersive-workbench .tree-pane .source-list-item { height: 44px; min-height: 44px; box-sizing: border-box; padding: 4px 8px; border-radius: 6px; overflow: hidden; align-items: center; }
  body.immersive-workbench .tree-pane .source-list-item:is(:hover, .is-selected) { background: var(--nav-active); box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .source-list-copy strong { font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .source-list-copy :is(p, small, em) { font-size: 11px; font-weight: 400; line-height: 16px; }
  body.immersive-workbench .tree-pane .source-list-copy p { display: none; }
  body.immersive-workbench .tree-pane .artifact-version-list a { min-height: 44px; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 450; }
  body.immersive-workbench .tree-pane .artifact-version-list a[aria-current],
  body.immersive-workbench .tree-pane .artifact-version-list a:hover { background: var(--nav-active); }
  body.immersive-workbench .tree-pane .artifact-version-list small { font-size: 11px; color: var(--muted); }
  body.immersive-workbench .tree-pane[data-desktop-directory="feed"] .directory-list-region,
  body.immersive-workbench .tree-pane[data-desktop-directory="sources"] .directory-list-region { display: none !important; }
  body.immersive-workbench .immersive-feed-views { display: none !important; }

  body.immersive-workbench .feed-workbench { padding: 0; background: var(--canvas); overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .feed-stage-directory { display: flex; flex-direction: column; width: 100%; min-width: 0; min-height: 100%; padding: 8px 16px 32px; box-sizing: border-box; }
  body.immersive-workbench .feed-stage-toolbar { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; gap: 10px; min-height: 32px; margin: 0 -8px 6px; padding: 4px 8px; background: var(--canvas); }
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
  body.immersive-workbench .feed-stage-count { margin-left: auto; color: var(--muted); font-size: 11px; }
  body.immersive-workbench .feed-stage-tree { display: flex; flex-direction: column; gap: 2px; width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-task-head,
  body.immersive-workbench .feed-stage-add-toggle {
    display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 8px;
    width: 100%; height: 44px; min-height: 44px; padding: 4px 8px; box-sizing: border-box;
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
  body.immersive-workbench .feed-stage-task-copy strong { font-size: 13px; font-weight: 450; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-task-copy small { font-size: 11px; line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .feed-stage-task { width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-task-body { width: 100%; min-width: 0; padding: 0 0 6px 24px; box-sizing: border-box; }
  body.immersive-workbench .feed-stage-list { width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-item { width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-item-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-width: 0; }
  body.immersive-workbench .feed-stage-entry {
    display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 0;
    width: 100%; min-width: 0; height: 44px; min-height: 44px; padding: 4px 8px; box-sizing: border-box;
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
  body.immersive-workbench .feed-list-empty button { min-height: 32px; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 11px; cursor: pointer; }
  body.immersive-workbench .feed-stage-item-detail { padding: 4px 8px 16px; }
  body.immersive-workbench .feed-stage-item-detail .feed-detail,
  body.immersive-workbench .feed-stage-item-detail .feed-detail--prototype {
    width: 100%; max-width: none; margin: 0; padding: 8px 4px 12px; border-radius: 0; background: transparent; box-shadow: none;
  }
  body.immersive-workbench .feed-stage-item-detail .feed-detail-header h1 {
    max-width: none; font-size: 16px; font-weight: 550; letter-spacing: 0; line-height: 1.35;
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
    body.immersive-workbench .tree-pane .tree-toggle { height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary, .source-filter-menu > summary, .project-record-add-compact, .feed-filter-trigger, .source-mobile-add, .tree-tool) { width: 36px; height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane .inbox-filter-row button { min-height: 32px; }
    body.immersive-workbench .tree-pane .project-record-filter-menu select { height: 36px; }
    body.immersive-workbench .feed-stage-directory { padding: 8px 12px 28px; }
    body.immersive-workbench .feed-stage-task-body { padding-left: 12px; }
    body.immersive-workbench .feed-stage-add-form { margin-left: 12px; }
  }
`;
