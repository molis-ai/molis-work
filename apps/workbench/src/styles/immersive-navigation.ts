/** Approved project/plugin chrome. Scoped to the workbench, so settings retain their own layout. */
export const IMMERSIVE_NAVIGATION_STYLES = `
  body.immersive-workbench {
    --desktop-titlebar-height: 32px; --desktop-titlebar-control-height: 26px; --workspace-chrome-height: 32px;
    --desktop-project-header-height: 36px; --plugin-rail-gap: 8px; --immersive-sidebar-width: 240px; --plugin-rail-width: 48px; --tab-strip-h: 32px;
    background: var(--canvas); color: var(--ink); height: 100dvh; overflow: hidden; overscroll-behavior: none;
    font: 13px/1.5 var(--font);
  }
  body.immersive-workbench [hidden] { display: none !important; }
  body.immersive-workbench .app { display: block; height: 100dvh; min-height: 0; overflow: hidden; padding: 0; margin: 0; max-width: none; }
  body.immersive-workbench .immersive-workspace {
    display: grid; grid-template-columns: var(--plugin-rail-width) var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr);
    grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr); height: 100dvh; min-height: 0; min-width: 0;
    padding: 0; margin: 0; gap: 0; border: 0; border-radius: 0; overflow: hidden;
  }
  body.immersive-workbench .immersive-workspace.is-directory-collapsed,
  body.immersive-workbench .immersive-workspace.is-plugin-directory-empty {
    grid-template-columns: var(--plugin-rail-width) 0 minmax(0, 1fr);
  }
  body.immersive-workbench .immersive-workspace.is-directory-collapsed > .tree-pane,
  body.immersive-workbench .immersive-workspace.is-plugin-directory-empty > .tree-pane { display: none; }
  body.immersive-workbench .plugin-stack {
    grid-column: 1; grid-row: 2; min-width: 0; min-height: 0;
    display: flex; flex-direction: column; align-items: stretch; gap: var(--plugin-rail-gap);
    padding: 0 0 var(--plugin-rail-gap); overflow: visible; background: var(--nav-bg); border-right: 1px solid var(--line); z-index: 8;
  }
  body.immersive-workbench .plugin-stack:has([data-project-menu][open]) { z-index: 50; }
  body.immersive-workbench .plugin-rail {
    flex: 1; min-width: 0; min-height: 0; width: auto;
    display: flex; flex-direction: column; align-items: stretch; overflow: hidden; gap: var(--plugin-rail-gap);
    padding: 0; background: transparent; border: 0; z-index: 0;
  }
  body.immersive-workbench .assistant-island {
    flex: none; position: relative; z-index: 13; min-width: 0; overflow: visible;
    display: flex; flex-direction: column; align-items: stretch;
  }
  body.immersive-workbench .plugin-rail-items,
  body.immersive-workbench .plugin-rail .personal-sidebar-footer,
  body.immersive-workbench .assistant-island-card {
    box-sizing: border-box; width: 100%; padding: 4px; border: 0;
    border-radius: var(--radius-surface, 12px); background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline, var(--line));
  }
  body.immersive-workbench .plugin-rail-items {
    display: flex; flex: 1; flex-direction: column; align-items: center; gap: 2px; min-height: 0;
    overflow: auto; scrollbar-width: none;
  }
  body.immersive-workbench .plugin-rail-items [data-plugin-id="market"] { margin-top: auto; }
  body.immersive-workbench .plugin-rail-items::-webkit-scrollbar { width: 0; height: 0; }
  body.immersive-workbench .assistant-island-card {
    display: flex; flex: none; flex-direction: column; align-items: center; gap: 2px; min-height: 0;
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .plugin-rail-item {
    width: 36px; height: 32px; min-height: 32px; padding: 0; flex: none; justify-content: center; gap: 0; border-radius: 8px;
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .plugin-rail-item > span {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .plugin-rail-item svg { width: 18px; height: 18px; }
  body.immersive-workbench .assistant-composer {
    --control-h: 28px;
    box-sizing: border-box; width: min(300px, calc(100vw - 88px));
    height: 32px; min-height: 32px; max-height: 32px;
    padding: 2px 2px 2px 10px; border: 0; border-radius: 16px;
    background: var(--paper); color: var(--ink);
    box-shadow: var(--control-shadow), inset 0 0 0 1px var(--hairline, var(--line));
    flex-direction: row; align-items: center; gap: 4px;
  }
  body.immersive-workbench .assistant-composer:popover-open { display: flex; inset: auto; margin: 0; }
  body.immersive-workbench .assistant-composer-input {
    flex: 1; min-width: 0; height: 28px; min-height: 0; margin: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent; color: var(--ink);
    font: inherit; font-size: 13px; line-height: 28px;
    appearance: none; -webkit-appearance: none; box-shadow: none;
  }
  body.immersive-workbench .assistant-composer-input::placeholder { color: var(--faint); opacity: 1; }
  body.immersive-workbench input.assistant-composer-input:is(:hover, :focus, :focus-visible) {
    outline: none; outline-offset: 0; border: 0; box-shadow: none; background: transparent;
  }
  body.immersive-workbench .assistant-composer :is(.mw-select, .mw-select-picker, .mw-select-picker__trigger) {
    flex: none; width: auto; max-width: 8.5rem; min-width: 0; height: 28px; min-height: 28px;
  }
  body.immersive-workbench .assistant-composer :is(.mw-select, .mw-select-picker__trigger) {
    padding: 0 22px 0 8px; border-color: transparent;
    background-color: color-mix(in srgb, var(--ink) 5%, transparent);
    font-size: 12px; color: var(--muted);
  }
  body.immersive-workbench .assistant-composer .mw-btn {
    flex: none; width: 28px; min-width: 28px; height: 28px; min-height: 28px;
  }
  body.immersive-workbench .plugin-rail .personal-sidebar-footer {
    flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; margin: 0; min-height: 0;
  }
  body.immersive-workbench .plugin-rail .personal-account {
    width: 36px; height: 32px; min-height: 32px; padding: 0; gap: 0; justify-content: center; border: 0; background: transparent; cursor: pointer; font: inherit;
  }
  body.immersive-workbench .plugin-rail .personal-account-copy,
  body.immersive-workbench .plugin-rail .personal-account-settings { display: none; }
  body.immersive-workbench .plugin-rail .personal-account-avatar { width: 28px; height: 28px; }
  body.immersive-workbench .immersive-workspace > .tree-pane {
    grid-column: 2; grid-row: 2; position: relative; inset: auto; width: auto; min-width: 0; min-height: 0;
    padding: 0 !important; display: flex; flex-direction: column; overflow: hidden;
    background: var(--nav-bg); border: 0; border-right: 1px solid var(--line); border-radius: 0;
  }
  body.immersive-workbench .workspace-chrome.project-island {
    flex: none; position: relative; z-index: 12; min-width: 0; overflow: visible;
    display: flex; flex-direction: row; align-items: stretch;
    width: 100%; max-width: none; height: auto; min-height: 0; margin: 0; padding: 0; gap: 0; box-sizing: border-box;
    background: transparent; border: 0; pointer-events: none;
  }
  body.immersive-workbench .workspace-chrome.project-island > * { pointer-events: auto; }
  body.immersive-workbench .workspace-chrome.project-island:has([data-project-menu][open]) { z-index: 50; }
  body.immersive-workbench .desktop-titlebar-drag { align-self: stretch; height: auto; min-height: 0; min-width: 12px; }
  body.immersive-workbench .titlebar-chrome .desktop-titlebar-drag--left { display: none; }
  body.immersive-workbench .workspace-chrome .navigator-project-primary {
    display: flex; flex: none; width: 100%; max-width: 100%; min-width: 0; align-items: center; gap: 2px;
    height: auto; min-height: 0; margin: 0; padding: 4px; border: 0; box-sizing: border-box;
    flex-direction: column;
    border-radius: var(--radius-surface, 12px); background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline, var(--line));
    grid-template-columns: none !important; pointer-events: auto;
  }
  body.immersive-workbench .workspace-chrome .navigator-project-menu {
    flex: none; width: auto; max-width: none; min-width: 0; position: relative;
    padding-right: 0; margin-right: 0; box-shadow: none;
  }
  body.immersive-workbench .workspace-chrome .navigator-project-search { margin-left: 0; }
  body.immersive-workbench .immersive-workspace .navigator-project-selector {
    flex: none; position: relative; overflow: hidden; width: 36px; height: 32px; min-height: 32px; padding: 0; display: flex; align-items: center;
    justify-content: center; gap: 0; border: 0; border-radius: 8px; color: var(--ink); background: transparent;
  }
  body.immersive-workbench .navigator-project-selector > svg:first-child { height: 16px; width: 16px; padding: 2px; border-radius: 4px; background: var(--action); color: var(--action-ink); flex: none; }
  body.immersive-workbench .navigator-project-selector > svg:last-child { width: 11px; height: 11px; margin-left: 2px; flex: none; }
  body.immersive-workbench .navigator-project-selector strong { font-size: 13px; font-weight: 400; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .navigator-project-selector strong,
  body.immersive-workbench .navigator-project-selector > svg:last-child {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  body.immersive-workbench .workspace-chrome :is(.navigator-project-settings, .navigator-project-search) {
    width: 36px; height: 32px; min-height: 32px; border: 0; border-radius: 8px; background: none; flex: none; color: var(--muted); display: grid; place-items: center; padding: 0;
  }
  body.immersive-workbench .navigator-project-settings svg, body.immersive-workbench .navigator-project-search svg, body.immersive-workbench .navigator-project-notifications svg,
  body.immersive-workbench .project-island .navigator-directory-toggle svg,
  body.immersive-workbench .project-island .immersive-show-directory svg { width: 15px; height: 15px; }
  body.immersive-workbench .navigator-project-menu-popover { position: absolute; top: 0; left: calc(100% + 8px); right: auto; width: min(280px, calc(100vw - 24px)); max-height: min(500px, calc(100dvh - 100px)); overflow: auto; padding: 6px; background: var(--paper); color: var(--ink); border: 0; border-radius: 9px; box-shadow: 0 8px 32px #00000035; z-index: 30; }
  body.immersive-workbench .navigator-project-option { padding: 9px 8px; border-radius: 5px; color: var(--ink); }
  body.immersive-workbench .navigator-project-option strong { font-size: 12px; font-weight: 400; }
  body.immersive-workbench .navigator-project-menu-popover > span { padding: 6px 8px; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .navigator-project-manage { font-size: 11px; color: var(--muted); }
  html[data-resolved-theme="dark"] body.immersive-workbench :is(.workspace-chrome .navigator-project-primary, .plugin-rail-items, .plugin-rail .personal-sidebar-footer, .assistant-island-card, .assistant-composer) {
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline, var(--line)), inset 0 1px 0 var(--edge-highlight, transparent);
  }
  body.immersive-workbench .immersive-directory-heading { display: none; }
  body.immersive-workbench .plugin-section { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 0; min-width: 0; }
  body.immersive-workbench .plugin-section.is-expanded { display: flex; flex-direction: column; align-items: stretch; min-width: 0; }
  body.immersive-workbench .plugin-section > .immersive-plugin-link { flex: none; pointer-events: none; }
  body.immersive-workbench .plugin-section:not(.is-expanded) > .plugin-section-body { display: none; }
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) > [data-directory-list-actions] { flex: none; justify-content: flex-start; width: 100%; }
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) > :not([data-directory-list-actions]):not(.desktop-directory-heading) { min-width: 0; padding-inline: 8px 4px; }
  body.immersive-workbench .plugin-section[data-plugin-section="settings"].is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]),
  body.immersive-workbench .plugin-section[data-plugin-section="project-settings"].is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) { gap: 8px; padding: 0 8px 12px; }
  body.immersive-workbench .plugin-section-market { display: none; }
  body.immersive-workbench .tree-pane .immersive-plugin-link { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 28px; padding: 0 6px 0 8px; font: inherit; font-size: 13px; font-weight: 400; white-space: nowrap; border: 0; border-radius: 6px; background: transparent; color: var(--ink); cursor: default; text-align: left; }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link { flex: none; display: flex; align-items: center; font: inherit; font-size: 13px; font-weight: 400; white-space: nowrap; border: 0; background: transparent; color: var(--muted); cursor: pointer; text-align: left; transition: color 150ms ease, background-color 150ms ease; }
  body.immersive-workbench .immersive-plugin-link svg { width: 16px; height: 16px; color: var(--faint); flex: none; }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link[aria-current],
  body.immersive-workbench .assistant-island [data-assistant-toggle][aria-expanded="true"] { background: var(--nav-active); color: var(--ink); font-weight: 400; box-shadow: none; }
  body.immersive-workbench .assistant-island [data-assistant-toggle][aria-expanded="true"] svg { color: var(--ink); }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link[aria-current]:hover { background: var(--nav-hover); }
  @media (prefers-reduced-motion: reduce) {
    body.immersive-workbench .project-island .navigator-directory-toggle svg { transition: none; }
  }
  body.immersive-workbench .directory-content-scroll {
    display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: auto; overscroll-behavior: contain;
    scrollbar-width: none; -ms-overflow-style: none;
  }
  body.immersive-workbench .directory-content-scroll::-webkit-scrollbar { width: 0; height: 0; }
  body.immersive-workbench .tree-pane .goal-list-view { display: block; }
  body.immersive-workbench[data-desktop-shell="true"] .plugin-section.is-expanded .desktop-goal-directory:not([hidden]),
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) { display: flex; flex-direction: column; }
  body.immersive-workbench .immersive-workspace .desktop-directory-heading { display: none !important; }
  body.immersive-workbench .desktop-module-list { display: grid; gap: 3px; }
  body.immersive-workbench .desktop-module-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 28px; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
  body.immersive-workbench .desktop-module-item > svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
  body.immersive-workbench .desktop-module-item > svg:last-child { width: 12px; height: 12px; }
  body.immersive-workbench .desktop-module-item > span { flex: 1; min-width: 0; }
  body.immersive-workbench .desktop-module-item strong { display: block; font-size: 12px; font-weight: 400; }
  body.immersive-workbench .desktop-module-item small { display: block; font-size: 10px; line-height: 1.5; color: var(--muted); margin-top: 3px; }
  body.immersive-workbench .desktop-module-item.is-current { background: var(--nav-active); }
  body.immersive-workbench .immersive-workspace .tree-chrome,
  body.immersive-workbench[data-desktop-shell="true"] .desktop-goal-directory .tree-chrome {
    position: static; padding: 0; background: transparent; border: 0; display: flex; justify-content: flex-start; flex-wrap: wrap; min-height: 0;
  }
  body.immersive-workbench .navigator-view-switch { display: none; }
  body.immersive-workbench .tree-search { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; background: var(--nav-hover); border: 0; border-radius: 6px; box-shadow: none; }
  body.immersive-workbench .tree-search input { font: inherit; font-size: 13px; padding: 0; border: 0; outline: none; background: transparent; color: var(--ink); flex: 1; min-width: 0; }
  body.immersive-workbench .tree-search svg { position: static; flex: none; width: 14px; height: 14px; color: var(--muted); }
  body.immersive-workbench .tree-search kbd { position: static; flex: none; font-family: inherit; font-size: 9px; line-height: 1.5; color: var(--muted); border: 0; padding: 0; background: transparent; }
  body.immersive-workbench .tree-search:focus-within { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  body.immersive-workbench .tree-tools,
  body.immersive-workbench[data-desktop-shell="true"] .tree-pane .tree-tools { gap: 4px; padding: 0; margin: 0; border: 0; display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-start; width: 100%; min-width: 0; }
  body.immersive-workbench .tree-create { flex: 1; min-width: 0; height: var(--control-h, 28px); min-height: var(--control-h, 28px); padding: 0 var(--control-pad-x, 12px); border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--paper); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; }
  body.immersive-workbench .tree-create span { display: inline; font-size: 12px; font-weight: 400; color: inherit; }
  body.immersive-workbench .tree-create svg { width: 14px; height: 14px; flex: none; color: inherit; }
  body.immersive-workbench .tree-create:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench [data-tree-filter-trigger] { width: var(--control-h, 28px); min-width: var(--control-h, 28px); height: var(--control-h, 28px); min-height: var(--control-h, 28px); padding: 0; display: inline-grid; place-items: center; flex: none; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--paper); color: var(--ink); cursor: pointer; }
  body.immersive-workbench [data-tree-filter-trigger] > span { display: none; }
  body.immersive-workbench [data-tree-filter-trigger] svg { width: 14px; height: 14px; color: inherit; }
  body.immersive-workbench [data-tree-filter-trigger]:is(:hover, .is-active, [aria-expanded="true"]) { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench .tree-tool { width: 27px; height: 27px; min-height: 27px; padding: 0; display: inline-grid; place-items: center; background: transparent; border: 0; border-radius: 5px; color: var(--muted); flex: none; }
  body.immersive-workbench .tree-tool > span, body.immersive-workbench .tree-tool > b, body.immersive-workbench .tree-tool > small { display: none; }
  body.immersive-workbench .tree-filter-control { margin: 0; flex: none; }
  body.immersive-workbench .tree-tool svg { width: 14px; height: 14px; }
  body.immersive-workbench .immersive-workspace :is(.tree-scroll, .project-record-scroll, .feed-directory-list, .source-directory-list, .feed-item-scroll, .source-list) { flex: none; height: auto; min-height: 0; overflow: visible; padding: 0; background: transparent; }
  body.immersive-workbench .goal-tree { padding: 0; margin: 0; }
  body.immersive-workbench .tree-item { margin: 0; padding: 0; border: 0; }
  body.immersive-workbench .tree-row { display: flex; align-items: flex-start; gap: 2px; padding: 2px 0; margin: 0; }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry { min-width: 0; flex: 1; display: flex; align-items: center; padding: 0; border: 0; border-radius: 5px; background: transparent; }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry.is-selected { background: var(--nav-active); }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry .tree-title-line strong { color: var(--ink); }
  body.immersive-workbench .tree-node { flex: 1; min-width: 0; min-height: 31px; padding: 6px 7px; border: 0; border-radius: 5px; background: transparent; color: var(--ink); }
  body.immersive-workbench .tree-node.is-selected { background: transparent; }
  body.immersive-workbench .tree-title-line strong { font-size: 13px; font-weight: 400; line-height: 20px; white-space: nowrap; display: block; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-copy > small, body.immersive-workbench .tree-created-meta, body.immersive-workbench .tree-meta-line { display: none !important; }
  body.immersive-workbench .tree-toggle, body.immersive-workbench .tree-guide { flex: none; width: 17px; height: 31px; min-height: 31px; padding: 0; display: grid; place-items: center; border: 0; background: transparent; color: var(--muted); }
  body.immersive-workbench .tree-toggle svg { width: 11px; height: 11px; }
  body.immersive-workbench .tree-children { padding-left: 7px; margin: 0 0 0 8px; border-left: 1px solid var(--line); }
  body.immersive-workbench .tree-pane .tree-footer,
  body.immersive-workbench .tree-pane .feed-directory-footer,
  body.immersive-workbench .tree-pane [data-tree-footer] { display: none !important; }
  body.immersive-workbench .project-record-tools { padding: 0; border: 0; gap: 2px; }
  body.immersive-workbench .project-record-select strong { font-size: 13px; font-weight: 400; }
  body.immersive-workbench .tree-pane .project-record-select small,
  body.immersive-workbench .tree-pane .project-record-meta { display: none !important; }
  body.immersive-workbench .immersive-workspace .personal-sidebar-footer { flex: none; height: auto; min-height: 0; margin: 0; padding: 4px 8px; border: 0; border-top: 0; background: transparent; display: block; }
  body.immersive-workbench .immersive-workspace .personal-account { display: flex; align-items: center; min-width: 0; min-height: 36px; gap: 8px; padding: 4px 6px; border: 0; border-radius: 6px; color: var(--ink); text-decoration: none; }
  body.immersive-workbench .immersive-workspace .personal-account-avatar { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; color: var(--muted); background: transparent; border: 1px solid var(--line); }
  body.immersive-workbench .immersive-workspace .personal-account-avatar svg { width: 12px; height: 12px; }
  body.immersive-workbench .immersive-workspace .personal-account-copy { flex: 1; min-width: 0; display: grid; gap: 0; }
  body.immersive-workbench .immersive-workspace .personal-account-copy strong, body.immersive-workbench .immersive-workspace .personal-account-copy small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .immersive-workspace .personal-account-copy strong { font-size: 11px; font-weight: 400; line-height: 16px; }
  body.immersive-workbench .immersive-workspace .personal-account-copy small { display: block; font-size: 10px; line-height: 14px; color: var(--muted); }
  body.immersive-workbench .immersive-workspace .personal-account-settings { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: var(--muted); }
  body.immersive-workbench .immersive-workspace .personal-account-settings svg { width: 13px; height: 13px; }
  body.immersive-workbench .plugin-rail .personal-sidebar-footer {
    box-sizing: border-box; width: 100%; height: auto; min-height: 0; padding: 4px; border: 0; border-top: 0;
    border-radius: var(--radius-surface, 12px); background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline, var(--line));
    flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; margin: 0;
  }
  body.immersive-workbench .plugin-rail .personal-account { width: 36px; min-width: 36px; height: 32px; min-height: 32px; padding: 0; gap: 0; justify-content: center; }
  body.immersive-workbench .plugin-rail .personal-account-copy,
  body.immersive-workbench .plugin-rail .personal-account-settings { display: none; }
  body.immersive-workbench .plugin-rail .personal-account-avatar { width: 28px; height: 28px; }
  body.immersive-workbench .plugin-rail .personal-account:hover { background: var(--nav-hover); }
  body.immersive-workbench .immersive-titlebar {
    grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; gap: 6px;
    height: var(--desktop-titlebar-height); min-height: var(--desktop-titlebar-height);
    padding: 0 8px 0 0; margin: 0; border: 0; background: var(--nav-bg); box-shadow: inset 0 -1px 0 var(--line); overflow: visible;
    z-index: 41;
  }
  body.immersive-workbench .workspace-history {
    order: 1; flex: none; display: flex; align-items: center; gap: 0; height: var(--desktop-titlebar-height);
    position: relative; z-index: 3; isolation: isolate; background: var(--nav-bg); padding-right: 2px;
  }
  body.immersive-workbench .workspace-history-button {
    width: 26px; height: 26px; min-height: 26px; padding: 0; flex: none; display: inline-grid; place-items: center;
    border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer;
  }
  body.immersive-workbench .workspace-history-button svg { width: 15px; height: 15px; }
  body.immersive-workbench .workspace-history-button:hover:not(:disabled) { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .immersive-titlebar [data-titlebar-tabs] { order: 2; flex: 1; min-width: 0; z-index: 0; overflow: hidden; }
  body.immersive-workbench .immersive-titlebar .desktop-titlebar-drag { order: 3; }
  body.immersive-workbench .immersive-titlebar [data-titlebar-tabs]:not([hidden]) ~ .desktop-titlebar-drag { flex: 0 0 0; min-width: 0; width: 0; overflow: hidden; }
  html[data-native-desktop="true"] body.immersive-workbench .immersive-titlebar,
  body.immersive-workbench[data-native-desktop="true"] .immersive-titlebar {
    margin-inline-start: var(--desktop-window-safe-inline-start, 88px);
    padding-left: 0;
  }
  body.immersive-workbench .tab-strip .tab-strip-spacer { flex: 0 1 0; min-width: 0; align-self: stretch; }
  body.immersive-workbench [data-titlebar-tabs] .tab-scroll { flex: 0 1 auto; width: max-content; min-width: 0; }
  html[data-native-desktop="true"] body.immersive-workbench [data-titlebar-tabs] .tab-scroll,
  body.immersive-workbench[data-native-desktop="true"] [data-titlebar-tabs] .tab-scroll { flex: 0 1 auto; width: max-content; min-width: 0; }
  html[data-native-desktop="true"] body.immersive-workbench .tab-strip .tab-strip-spacer,
  body.immersive-workbench[data-native-desktop="true"] .tab-strip .tab-strip-spacer { flex: 1 1 48px; min-width: 48px; -webkit-app-region: drag; }
  body.immersive-workbench .immersive-titlebar > strong { font-size: 11px; font-weight: 400; }
  body.immersive-workbench .container-tabs { min-width: 0; flex: 1; height: 44px; padding-block: 6px; display: flex; align-items: stretch; overflow: auto; scrollbar-width: none; gap: 4px; }
  body.immersive-workbench .container-tabs::-webkit-scrollbar { display: none; }
  body.immersive-workbench .container-tab { max-width: 168px; min-width: 72px; flex: 0 1 auto; display: flex; align-items: center; gap: 6px; padding: 0 8px; font: inherit; font-size: 12px; font-weight: 400; color: var(--muted); background: transparent; border: 0; border-radius: 8px; cursor: pointer; box-shadow: none; }
  body.immersive-workbench .container-tab:hover { color: var(--ink); }
  body.immersive-workbench .container-tab[aria-current] { color: var(--ink); font-weight: 400; background: var(--nav-raised); box-shadow: var(--surface-shadow); }
  body.immersive-workbench .container-tab.is-pinned { letter-spacing: -.01em; }
  body.immersive-workbench .container-tab span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .container-tab-close { width: 18px; height: 18px; border-radius: 4px; margin-left: 2px; color: var(--muted); display: grid; place-items: center; opacity: .7; padding: 0; border: 0; background: transparent; }
  body.immersive-workbench .container-tab-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .container-tab-close svg { width: 11px; height: 11px; }
  body.immersive-workbench .immersive-plugin-stage > .goal-frame-surface { overflow: hidden; background: var(--canvas); padding: 0; }
  body.immersive-workbench .immersive-goal-tools { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .immersive-icon-button { width: 28px; height: 28px; padding: 0; flex: none; display: inline-grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  body.immersive-workbench .immersive-icon-button svg { height: 16px; width: 16px; }
  body.immersive-workbench .workspace-chrome.project-island :is(.navigator-directory-toggle, .immersive-show-directory) { display: none; }
  body.immersive-workbench .immersive-plugin-stage { grid-column: 3; grid-row: 2 / -1; position: relative; z-index: 0; min-width: 0; min-height: 0; overflow: hidden; container: plugin-stage / inline-size; }
  body.immersive-workbench .immersive-plugin-stage > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .desktop-work-surface { min-height: 0; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface:not(.session-stage-shell, .plugin-stage-shell, .immersive-home) { min-height: 0; background: var(--paper); padding: 32px clamp(18px, 4%, 56px); }
  body.immersive-workbench .immersive-plugin-stage > :is(.session-stage-shell, .plugin-stage-shell) { padding: 0; overflow: hidden; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface > [data-operation-detail] { max-width: 980px; margin: auto; }
  body.immersive-workbench .immersive-plugin-stage > .document-pane { padding: 0; }
  body.immersive-workbench .immersive-plugin-stage > .goal-canvas-shell, body.immersive-workbench .tab-pane-body > .goal-canvas-shell { overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .immersive-plugin-stage > .goal-canvas-shell[data-board-view="list"], body.immersive-workbench .tab-pane-body > .goal-canvas-shell[data-board-view="list"] { background: var(--paper); }
  body.immersive-workbench .immersive-sidebar-scrim { display: none; }
  body.immersive-workbench .immersive-plugin-stage > .immersive-market { overflow: hidden; display: flex; flex-direction: column; padding: 0; background: var(--paper); }
  body.immersive-workbench .plugin-market-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; width: 100%; padding: 28px clamp(20px, 4%, 48px) 48px; }
  body.immersive-workbench .plugin-market-body > * { width: 100%; max-width: 720px; margin-left: auto; margin-right: auto; }
  body.immersive-workbench .plugin-market-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
  body.immersive-workbench .plugin-market-heading h1 { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: -.03em; line-height: 1.15; }
  body.immersive-workbench .plugin-market-heading p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  body.immersive-workbench .plugin-market-destination { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; flex: none; }
  body.immersive-workbench .plugin-market-destination label { flex: none; white-space: nowrap; }
  body.immersive-workbench .plugin-market-project-trigger {
    appearance: none; display: inline-flex; align-items: center; gap: 8px; flex: none;
    max-width: 220px; min-width: 140px; min-height: 32px; padding: 0 10px 0 12px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--nav-bg); color: var(--ink);
    font: inherit; font-size: 13px; cursor: pointer;
  }
  body.immersive-workbench .plugin-market-project-trigger strong { min-width: 0; overflow: hidden; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .plugin-market-project-trigger svg { width: 12px; height: 12px; flex: none; color: var(--muted); transition: transform .14s ease; }
  body.immersive-workbench .plugin-market-project-trigger[aria-expanded="true"],
  body.immersive-workbench .plugin-market-destination:has([data-market-project-popover]:popover-open) .plugin-market-project-trigger { background: var(--nav-hover); border-color: var(--line-strong); }
  body.immersive-workbench .plugin-market-project-trigger[aria-expanded="true"] svg,
  body.immersive-workbench .plugin-market-destination:has([data-market-project-popover]:popover-open) .plugin-market-project-trigger svg { transform: rotate(180deg); }
  body.immersive-workbench .plugin-market-project-trigger:hover:not(:disabled) { background: var(--nav-hover); }
  body.immersive-workbench .plugin-market-project-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
  body.immersive-workbench .plugin-market-project-popover {
    position: fixed; inset: unset; margin: 0; padding: 6px; overflow: auto;
    max-height: min(280px, 50vh); border: 0; border-radius: 12px; background: var(--paper); color: var(--ink);
    box-shadow: 0 8px 32px #00000028, 0 1px 3px #00000014;
  }
  body.immersive-workbench .plugin-market-project-popover:popover-open { display: block; }
  body.immersive-workbench .plugin-market-project-popover nav { display: grid; gap: 1px; }
  body.immersive-workbench .plugin-market-project-option {
    appearance: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    width: 100%; min-height: 34px; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  body.immersive-workbench .plugin-market-project-option:hover,
  body.immersive-workbench .plugin-market-project-option.is-current { background: var(--nav-hover); }
  body.immersive-workbench .plugin-market-project-option:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
  body.immersive-workbench .plugin-market-project-option strong { min-width: 0; overflow: hidden; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .plugin-market-project-option svg { width: 14px; height: 14px; flex: none; color: var(--muted); }
  body.immersive-workbench .plugin-market-search { margin-top: 22px; min-height: 40px; width: 100%; box-sizing: border-box; }
  body.immersive-workbench .plugin-market-search svg { width: 16px; height: 16px; color: var(--muted); }
  body.immersive-workbench .plugin-market-search input {
    width: 100%; border: 0; outline: 0; background: transparent; box-shadow: none;
    font: inherit; font-size: 13px;
  }
  body.immersive-workbench .plugin-market-search input::placeholder { color: var(--muted); opacity: 1; }
  body.immersive-workbench .plugin-market-status-row { display: flex; align-items: center; gap: 10px; min-height: 20px; margin-top: 10px; }
  body.immersive-workbench .plugin-market-status-row:not(:has([data-market-status]:not(:empty), [data-market-retry]:not([hidden]))) { min-height: 0; margin-top: 0; }
  body.immersive-workbench .plugin-market-status { margin: 0; font-size: 12px; color: var(--muted); }
  body.immersive-workbench .immersive-market [data-market-retry] { min-height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
  body.immersive-workbench .plugin-market-installed { margin-top: 28px; }
  body.immersive-workbench .plugin-market-section-head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 12px; }
  body.immersive-workbench .plugin-market-section-head h2 { margin: 0; font-size: 13px; font-weight: 400; }
  body.immersive-workbench .plugin-market-installed-row { display: flex; flex-wrap: wrap; gap: 10px; }
  body.immersive-workbench .plugin-market-installed-item { appearance: none; width: 44px; height: 44px; padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--nav-bg); color: var(--ink); display: grid; place-items: center; cursor: pointer; transition: background .16s ease; }
  body.immersive-workbench .plugin-market-installed-item:hover { background: var(--nav-active); }
  body.immersive-workbench .plugin-market-installed-item .plugin-market-icon { width: 100%; height: 100%; background: transparent; }
  body.immersive-workbench .plugin-market-scope { display: flex; gap: 8px; margin-top: 28px; }
  body.immersive-workbench .plugin-market-catalog { margin-top: 22px; }
  body.immersive-workbench .plugin-market-list { display: grid; grid-template-columns: 1fr 1fr; column-gap: 28px; row-gap: 2px; }
  body.immersive-workbench .plugin-market-list article { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px; border-radius: 10px; }
  body.immersive-workbench .plugin-market-list article:hover { background: var(--nav-hover); }
  body.immersive-workbench .plugin-market-icon { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--nav-bg); color: var(--ink); }
  body.immersive-workbench .plugin-market-icon svg { width: 18px; height: 18px; }
  body.immersive-workbench .plugin-market-copy { min-width: 0; flex: 1; }
  body.immersive-workbench .plugin-market-list h2, body.immersive-workbench .plugin-market-list p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .plugin-market-list h2 { margin: 0; font-size: 14px; font-weight: 400; }
  body.immersive-workbench .plugin-market-list p { margin: 2px 0 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
  body.immersive-workbench .plugin-market-list [data-market-add] { appearance: none; flex: none; min-height: 32px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 400; cursor: pointer; }
  body.immersive-workbench .plugin-market-list [data-market-add]:hover:not(:disabled) { background: var(--nav-active); }
  body.immersive-workbench .plugin-market-list [data-market-add]:disabled { color: var(--muted); opacity: 1; }
  body.immersive-workbench .plugin-market-empty, body.immersive-workbench .plugin-market-note { margin-top: 22px; font-size: 12px; color: var(--muted); }
  body.immersive-workbench .plugin-market-note { margin-top: 36px; }
  body.immersive-workbench [data-artifact-directory] { flex: none; height: auto; min-height: 0; overflow: visible; }
  body.immersive-workbench .artifact-version-list .mw-dir-row,
  body.immersive-workbench .artifact-version-list .feed-stage-entry { width: 100%; }
  body.immersive-workbench .immersive-artifact-surface .plugin-stage-list .artifact-empty { max-width: 32ch; margin: 0; padding: 8px; color: var(--muted); text-align: left; }
  body.immersive-workbench .immersive-artifact-surface .plugin-stage-workspace .artifact-detail,
  body.immersive-workbench .immersive-artifact-surface .plugin-stage-workspace .artifact-empty { max-width: none; margin: 0; }
  body.immersive-workbench .artifact-reference-label input, body.immersive-workbench .artifact-content-reference input { width: 100%; padding: 10px; font: inherit; color: var(--ink); background: var(--nav-bg); border: 1px solid var(--line); border-radius: 6px; }
  body.immersive-workbench .artifact-export { color: var(--ink); }
  body.immersive-workbench :is(.immersive-icon-button, .navigator-directory-toggle, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .tree-tool, .workspace-history-button):hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .global-search-dialog {
    width: min(520px, calc(100vw - 24px)); max-height: min(640px, calc(100dvh - 48px)); margin: auto;
    padding: 0; border: 0; border-radius: 16px; background: var(--paper); color: var(--ink);
    box-shadow: 0 16px 48px #0000002e, 0 2px 8px #00000018; overflow: hidden;
  }
  body.immersive-workbench .global-search-dialog::backdrop { background: #0809104d; }
  body.immersive-workbench .global-search-shell { display: flex; flex-direction: column; max-height: min(640px, calc(100dvh - 48px)); }
  body.immersive-workbench .global-search-field {
    display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 14px 8px 16px;
    border-bottom: 1px solid var(--line); background: transparent;
  }
  body.immersive-workbench .global-search-field svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
  body.immersive-workbench .global-search-field input {
    flex: 1; min-width: 0; height: 32px; margin: 0; padding: 0; border: 0; outline: none;
    appearance: none; -webkit-appearance: none;
    background: transparent; color: var(--ink); font: inherit; font-size: 15px; box-shadow: none;
  }
  body.immersive-workbench .global-search-field input::-webkit-search-decoration,
  body.immersive-workbench .global-search-field input::-webkit-search-cancel-button {
    appearance: none; -webkit-appearance: none;
  }
  body.immersive-workbench .global-search-field input::placeholder { color: var(--faint); opacity: 1; }
  body.immersive-workbench .global-search-field input:is(:focus, :focus-visible) {
    outline: none; border: 0; box-shadow: none; background: transparent;
  }
  body.immersive-workbench .global-search-field kbd {
    flex: none; font: 11px/1.4 inherit; color: var(--faint); background: transparent; border: 0; padding: 0;
  }
  body.immersive-workbench .global-search-body { flex: 1; min-height: 0; overflow: auto; padding: 8px 8px 10px; }
  body.immersive-workbench .global-search-group { margin: 0; padding: 6px 0 8px; }
  body.immersive-workbench .global-search-group + .global-search-group { border-top: 1px solid var(--line); }
  body.immersive-workbench .global-search-group h3 {
    margin: 0; padding: 6px 10px 4px; font: inherit; font-size: 11px; font-weight: 400; color: var(--muted);
  }
  body.immersive-workbench .global-search-hit {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 6px 10px;
    border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  body.immersive-workbench .global-search-hit[aria-selected="true"],
  body.immersive-workbench .global-search-hit:hover { background: var(--nav-hover); }
  body.immersive-workbench .global-search-hit-title {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 400;
  }
  body.immersive-workbench .global-search-hit-plugin { flex: none; font-size: 11px; color: var(--faint); }
  body.immersive-workbench .global-search-hit kbd { flex: none; font: 10px/1.4 inherit; color: var(--faint); border: 0; background: transparent; padding: 0; }
  body.immersive-workbench .global-search-empty { margin: 18px 10px; font-size: 13px; color: var(--muted); }
  html[data-resolved-theme="dark"] body.immersive-workbench .global-search-dialog { box-shadow: 0 18px 52px #00000066, 0 2px 8px #00000040; }
  html[data-resolved-theme="dark"] body.immersive-workbench .global-search-dialog::backdrop { background: #00000073; }
  body.immersive-workbench :focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  body.immersive-workbench :is(.immersive-titlebar button, .navigator-native-row button, .immersive-plugin-link, .navigator-project-search):focus-visible { outline-offset: var(--focus-stroke-inset); }
  body.immersive-workbench ::selection { color: var(--ink); background: var(--blue-soft); }
  body.immersive-workbench :is(input, textarea) { caret-color: var(--blue); }
  body.immersive-workbench * { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  body.immersive-workbench button:disabled { cursor: default; opacity: .45; }
  @media (max-width: 1050px) { body.immersive-workbench { --immersive-sidebar-width: 220px; } }
  @media (max-width: 600px) {
    body.immersive-workbench { --desktop-titlebar-height: 44px; --workspace-chrome-height: 44px; --tab-strip-h: 44px; --assistant-island-row: 44px; }
    body.immersive-workbench .immersive-workspace,
    body.immersive-workbench .immersive-workspace.is-directory-collapsed,
    body.immersive-workbench .immersive-workspace.is-plugin-directory-empty {
      grid-template-columns: 0 0 minmax(0, 1fr);
      grid-template-rows: auto auto auto minmax(0, 1fr);
    }
    body.immersive-workbench .plugin-stack { display: contents; }
    body.immersive-workbench .assistant-island {
      grid-column: 1 / -1; grid-row: 2; justify-self: stretch; width: auto; padding: 8px 12px 0;
      background: var(--nav-bg); z-index: 12;
    }
    body.immersive-workbench .assistant-island-card {
      flex-direction: row; width: auto; height: 36px; min-height: 36px; padding: 3px 4px; gap: 4px; justify-content: flex-start;
    }
    body.immersive-workbench .plugin-rail {
      display: none; position: fixed; top: calc(var(--desktop-titlebar-height) + var(--tab-strip-h) + var(--assistant-island-row) + var(--workspace-chrome-height)); left: 0; bottom: 0; width: var(--plugin-rail-width);
      z-index: 40; background: var(--nav-bg); border-right: 1px solid var(--line); box-shadow: none; padding: 6px 0 8px;
    }
    body.immersive-workbench .immersive-workspace > .tree-pane {
      display: none; position: fixed; top: calc(var(--desktop-titlebar-height) + var(--tab-strip-h) + var(--assistant-island-row) + var(--workspace-chrome-height)); left: var(--plugin-rail-width); bottom: 0; width: 216px;
      z-index: 40; box-shadow: 12px 0 40px #00000035; padding: 0 !important;
    }
    body.immersive-workbench .immersive-workspace.is-directory-drawer-open .plugin-rail { display: flex; }
    body.immersive-workbench .immersive-workspace.is-directory-drawer-open > .tree-pane { display: flex; }
    body.immersive-workbench .immersive-workspace.is-directory-drawer-open.is-plugin-directory-empty > .tree-pane { display: none; }
    body.immersive-workbench .immersive-sidebar-scrim:not([hidden]) { display: block; position: fixed; inset: calc(var(--desktop-titlebar-height) + var(--tab-strip-h) + var(--assistant-island-row) + var(--workspace-chrome-height)) 0 0; z-index: 35; border: 0; padding: 0; background: #08091080; }
    body.immersive-workbench .immersive-titlebar { height: auto; min-height: calc(var(--desktop-titlebar-height) + var(--tab-strip-h)); padding: 0 12px; gap: 8px; flex-wrap: wrap; }
    body.immersive-workbench .workspace-chrome.project-island {
      grid-column: 1 / -1; grid-row: 3; justify-self: stretch; width: auto; max-width: none; margin: 0;
      padding: 8px 12px; height: auto; min-height: var(--workspace-chrome-height); border: 0; background: var(--nav-bg); pointer-events: auto;
    }
    body.immersive-workbench .workspace-chrome .navigator-project-primary {
      flex-direction: row; height: 36px; min-height: 36px; width: auto; flex: 1; max-width: none; padding: 3px 4px 3px 5px;
    }
    body.immersive-workbench .navigator-project-selector {
      flex: 1; width: auto; height: 28px; min-height: 28px; padding: 0 4px; justify-content: flex-start; gap: 6px;
    }
    body.immersive-workbench .navigator-project-selector strong,
    body.immersive-workbench .navigator-project-selector > svg:last-child {
      position: static; width: auto; height: auto; margin: 0; clip: unset; overflow: hidden;
    }
    /* width:auto returns the label to its text, but hands an SVG its 300x150 intrinsic size. */
    body.immersive-workbench .navigator-project-selector > svg:last-child { width: 11px; height: 11px; flex: none; }
    body.immersive-workbench .workspace-chrome :is(.navigator-project-settings, .navigator-project-search) {
      width: 28px; height: 28px; min-height: 28px;
    }
    body.immersive-workbench .navigator-project-menu-popover { top: calc(100% + 4px); left: 0; right: auto; }
    body.immersive-workbench .immersive-plugin-stage { grid-column: 3; grid-row: 4 !important; }
    body.immersive-workbench .workspace-history-button { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .workspace-chrome.project-island .immersive-show-directory { display: inline-grid; }
    body.immersive-workbench .workspace-chrome.project-island .navigator-directory-toggle { display: none; }
    body.immersive-workbench .is-directory-drawer-open .workspace-chrome.project-island .navigator-directory-toggle { display: grid; }
    body.immersive-workbench .is-directory-drawer-open .workspace-chrome.project-island .immersive-show-directory { display: none; }
    body.immersive-workbench .immersive-goal-tools > span { display: none; }
    body.immersive-workbench :is(.plugin-rail, .assistant-island) .plugin-rail-item,
    body.immersive-workbench .plugin-rail .personal-account,
    body.immersive-workbench .plugin-rail .personal-settings { width: 40px; height: 44px; min-height: 44px; }
    body.immersive-workbench .assistant-island .plugin-rail-item { width: 36px; height: 28px; min-height: 28px; }
    body.immersive-workbench .tree-pane .immersive-plugin-link { min-height: 44px; }
    body.immersive-workbench .tree-search input, body.immersive-workbench .plugin-market-search input,
    body.immersive-workbench .global-search-field input,
    body.immersive-workbench .assistant-composer-input { font-size: 16px; }
    body.immersive-workbench .plugin-market-heading { flex-direction: column; align-items: stretch; }
    body.immersive-workbench .plugin-market-destination { width: 100%; }
    body.immersive-workbench .plugin-market-project-trigger { max-width: none; width: auto; flex: 1; min-width: 0; min-height: 40px; }
    body.immersive-workbench .plugin-market-list { grid-template-columns: 1fr; }
    body.immersive-workbench .tree-search kbd, body.immersive-workbench .global-search-field kbd,
    body.immersive-workbench .global-search-hit kbd { display: none; }
    body.immersive-workbench .tree-node { min-height: 38px; }
    body.immersive-workbench .global-search-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 24px); border-radius: 14px; }
    body.immersive-workbench .global-search-hit { min-height: 44px; }
  }
  @container plugin-stage (max-width: 640px) {
    body.immersive-workbench .plugin-market-heading { flex-direction: column; align-items: stretch; }
    body.immersive-workbench .plugin-market-destination { width: 100%; }
    body.immersive-workbench .plugin-market-project-trigger { max-width: none; width: auto; flex: 1; min-width: 0; }
    body.immersive-workbench .plugin-market-list { grid-template-columns: 1fr; }
  }

  body.immersive-workbench .feed-source-directory > header { justify-content: flex-end; height: 30px; }
  body.immersive-workbench .feed-source-directory > header > strong { display: none; }
`;
