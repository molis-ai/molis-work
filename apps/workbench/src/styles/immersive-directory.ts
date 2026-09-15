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
  body.immersive-workbench .tree-pane .tree-title-line strong { display: block; font-size: 12px; font-weight: 450; line-height: 20px; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .tree-toggle,
  body.immersive-workbench .tree-pane .tree-guide { width: 16px; height: 32px; min-height: 32px; flex: 0 0 16px; }
  body.immersive-workbench .tree-pane .tree-children { margin-left: 8px; padding-left: 7px; }
  body.immersive-workbench .tree-pane .tree-entry > .directory-row-state { display: inline-flex; align-items: center; flex: none; width: auto; height: 22px; min-height: 0; margin: 0 5px 0 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status { gap: 4px; font-size: 10px; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .tree-pane .tree-entry .goal-status > span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }


  body.immersive-workbench .tree-pane :is(.tree-chrome, .project-record-tools, .feed-directory-tools, .source-directory-tools) { flex: none; margin: 0; padding: 0 8px 8px; background: transparent; border: 0; }
  body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) { min-width: 0; height: 30px; min-height: 30px; margin: 0; padding: 0 10px; border: 0; border-radius: 6px; background: var(--nav-hover); display: flex; gap: 6px; align-items: center; box-shadow: none; }
  body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) input { flex: 1; min-width: 0; width: 100%; height: 28px; min-height: 0; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; }
  body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) svg { position: static; flex: none; width: 14px; height: 14px; color: var(--muted); }
  body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) input::placeholder { color: var(--faint); opacity: 1; }
  body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search):focus-within { outline: 2px solid var(--blue); outline-offset: 0; }
  body.immersive-workbench .tree-pane .tree-search kbd { font-size: 9px; }
  body.immersive-workbench .tree-pane .project-record-tools .tree-search kbd { display: none; }
  body.immersive-workbench .tree-pane .project-record-directory > .desktop-directory-heading { display: none !important; }
  body.immersive-workbench .tree-pane .project-record-tools { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 28px 28px; align-items: center; gap: 4px; }
  body.immersive-workbench .tree-pane .project-record-filter-menu { position: static; min-width: 0; grid-column: auto; }
  body.immersive-workbench .tree-pane .project-record-tools .tree-search { grid-column: auto; }
  body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary, .project-record-add-compact, .feed-filter-trigger) { width: 28px; height: 32px; min-height: 32px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  body.immersive-workbench .tree-pane .project-record-filter-menu > summary span { display: none; }
  body.immersive-workbench .tree-pane :is(.project-record-add-compact, .project-record-filter-menu > summary, .feed-filter-trigger) svg { width: 15px; height: 15px; }
  body.immersive-workbench .tree-pane :is(.project-record-add-compact, .project-record-filter-menu > summary, .feed-filter-trigger):hover { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .project-record-filter-menu[open] > summary,
  body.immersive-workbench .tree-pane .feed-filter-trigger[aria-expanded="true"] { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tree-pane :is(.project-record-filter-menu > div, .feed-filter-panel) { position: absolute; inset: 36px 2px auto; z-index: 30; width: auto; max-height: calc(100dvh - 300px); margin: 0; padding: 12px; border: 0; border-radius: 8px; background: var(--paper); color: var(--ink); box-shadow: 0 8px 24px #10131c26; overflow: auto; }
  body.immersive-workbench .tree-pane .project-record-filter-menu > div { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  body.immersive-workbench .tree-pane .project-record-filter-menu label { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-filter-menu select { width: 100%; min-width: 0; height: 30px; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-bg); color: var(--ink); font: inherit; font-size: 11px; }
  body.immersive-workbench .tree-pane .project-record-row { min-height: 76px; padding: 9px 8px; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: 6px 8px; border-radius: 6px; box-shadow: none; }
  body.immersive-workbench .tree-pane .project-record-row:is(:hover, .is-selected) { background: var(--nav-active); box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .project-record-select { grid-column: 1 / -1; }
  body.immersive-workbench .tree-pane .project-record-select > span { display: grid; gap: 3px; }
  body.immersive-workbench .tree-pane .project-record-select strong { color: var(--ink); font-size: 12px; font-weight: 500; line-height: 18px; }
  body.immersive-workbench .tree-pane .project-record-select small { font-size: 10px; line-height: 15px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-row > .directory-row-state { grid-column: 2; grid-row: 2; min-height: 0; height: auto; padding: 0; border: 0; background: transparent; border-radius: 0; font-size: 10px; font-weight: 400; }
  body.immersive-workbench .tree-pane .project-record-meta { display: block; grid-column: 1; grid-row: 2; font-size: 10px; line-height: 15px; color: var(--muted); }
  body.immersive-workbench .tree-pane .project-record-meta > span { display: none; }

  body.immersive-workbench .tree-pane .feed-directory-toolbar { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; gap: 4px; }
  body.immersive-workbench .tree-pane .feed-filter-section > span { font-size: 10px; font-weight: 500; letter-spacing: 0; }
  body.immersive-workbench .tree-pane .feed-filter-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body.immersive-workbench .tree-pane .feed-filter-option { min-height: 32px; font-size: 11px; border-radius: 5px; }
  body.immersive-workbench .tree-pane :is(.feed-item-scroll, .source-list, .project-record-scroll) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0; scrollbar-width: thin; }
  body.immersive-workbench .tree-pane .project-record-scroll:has(+ .project-record-empty:not([hidden])) { flex: none; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) { flex: 1; margin: 0; padding: 24px 12px; border: 0; border-radius: 0; background: transparent; display: grid; align-content: start; justify-items: start; gap: 8px; color: var(--muted); text-align: left; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) > svg { width: 20px; height: 20px; margin-bottom: 4px; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) strong { font-size: 12px; font-weight: 500; color: var(--ink); }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) p { max-width: 30ch; margin: 0; font-size: 11px; line-height: 1.7; }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .project-record-empty) button { min-height: 32px; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font-size: 11px; }
  body.immersive-workbench .tree-pane .feed-list-item { position: relative; min-height: 80px; padding: 10px 8px; grid-template-columns: minmax(0, 1fr); gap: 4px; border-radius: 6px; box-shadow: none; }
  body.immersive-workbench .tree-pane .feed-list-item:is(:hover, .is-selected) { background: var(--nav-active) !important; box-shadow: none; color: var(--ink); }
  body.immersive-workbench .tree-pane .feed-list-icon { display: none; }
  body.immersive-workbench .tree-pane .feed-list-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; }
  body.immersive-workbench .tree-pane .feed-list-copy > strong { grid-column: 1 / -1; grid-row: 1; font-size: 12px; font-weight: 500; line-height: 18px; }
  body.immersive-workbench .tree-pane .feed-list-copy > p { grid-column: 1 / -1; grid-row: 2; margin: 0; font-size: 11px; line-height: 17px; }
  body.immersive-workbench .tree-pane .feed-list-copy > .feed-list-meta { grid-column: 1; grid-row: 3; }
  body.immersive-workbench .tree-pane .feed-list-copy :is(em, small, time) { font-size: 10px; font-weight: 400; line-height: 15px; }
  body.immersive-workbench .tree-pane .feed-list-copy time { grid-column: 2; grid-row: 3; align-self: end; }
  body.immersive-workbench .tree-pane .feed-list-meta em { display: none; }
  body.immersive-workbench .tree-pane .feed-list-state { justify-self: start; padding: 0; border: 0; background: transparent; border-radius: 0; font-size: 10px; font-weight: 400; }
  body.immersive-workbench .tree-pane .feed-list-state[data-feed-disposition="feed"] { display: none; }
  body.immersive-workbench .tree-pane :is(.tree-footer, .feed-directory-footer, [data-tree-footer]) { display: none !important; }
  body.immersive-workbench .tree-pane[data-desktop-directory="sources"] .source-directory { grid-template-rows: auto minmax(0, 1fr) !important; }
  body.immersive-workbench .tree-pane .source-directory-tools { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: start; gap: 4px; }
  body.immersive-workbench .tree-pane .source-directory-tools .feed-directory-search { grid-column: 1; grid-row: 1; }
  body.immersive-workbench .tree-pane .source-mobile-add { grid-column: 2; grid-row: 1; display: grid; place-items: center; width: 28px; height: 32px; min-height: 32px; padding: 0; border: 0 !important; border-radius: 5px; color: var(--muted) !important; background: transparent !important; box-shadow: none !important; cursor: pointer; font-size: 0; }
  body.immersive-workbench .tree-pane .source-mobile-add svg { width: 15px; height: 15px; }
  body.immersive-workbench .tree-pane .source-mobile-add:hover { color: var(--ink) !important; background: var(--nav-active) !important; }
  body.immersive-workbench .tree-pane .source-filter-row { display: flex; flex-wrap: wrap; gap: 2px; padding-top: 6px; grid-column: 1 / -1; }
  body.immersive-workbench .tree-pane .source-filter-row button { min-height: 28px; padding: 4px 6px; border: 0; border-radius: 5px; font-size: 10px; }
  body.immersive-workbench .tree-pane .inbox-filter-row { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 8px 8px; }
  body.immersive-workbench .tree-pane .inbox-filter-row button { min-height: 28px; padding: 4px 6px; border: 0; border-radius: 5px; font-size: 10px; cursor: pointer; color: var(--muted); background: transparent; }
  body.immersive-workbench .tree-pane .inbox-filter-row button.is-active { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .source-list-item { min-height: 72px; padding: 8px; border-radius: 6px; }
  body.immersive-workbench .tree-pane .source-list-copy strong { font-size: 12px; font-weight: 500; }
  body.immersive-workbench .tree-pane .source-list-copy :is(p, small, em) { font-size: 10px; font-weight: 400; }
  @media (max-width: 600px) {
    body.immersive-workbench .tree-resizer { display: none; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle { height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) { height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane :is(.tree-search, .feed-directory-search) input { height: 38px; font-size: 16px; }
    body.immersive-workbench .tree-pane .source-directory-tools { grid-template-columns: minmax(0, 1fr) 36px; }
    body.immersive-workbench .tree-pane .source-mobile-add { width: 36px; height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane .project-record-tools { grid-template-columns: minmax(0, 1fr) 36px 36px; }
    body.immersive-workbench .tree-pane .feed-directory-toolbar { grid-template-columns: minmax(0, 1fr) 36px; }
    body.immersive-workbench .tree-pane :is(.project-record-filter-menu > summary, .project-record-add-compact, .feed-filter-trigger) { width: 36px; height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane :is(.project-record-filter-menu > div, .feed-filter-panel) { top: 44px; max-height: calc(100dvh - 330px); }
    body.immersive-workbench .tree-pane .project-record-filter-menu select { height: 36px; }
  }
`;
