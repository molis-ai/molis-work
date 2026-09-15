/** Approved project/plugin chrome. Scoped to the workbench, so settings retain their own layout. */
export const IMMERSIVE_NAVIGATION_STYLES = `
  body.immersive-workbench {
    --desktop-titlebar-height: 32px; --desktop-titlebar-control-height: 28px;
    --desktop-project-header-height: 84px; --immersive-sidebar-width: 264px;
    --rail: #f4f5f8; --paper: #fff; --panel: #fff; --canvas: #f4f5f8;
    --ink: #272932; --ink-soft: #60636f; --text: #272932; --muted: #60636f; --faint: #6b6e79;
    --line: #e4e5ea; --line-strong: #d6d8e0; --blue: #6262d6; --blue-dark: #5050bb;
    --blue-soft: #efeffc; --focus: #6262d6;     --nav-bg: #f8f9fb; --nav-hover: #eceef2; --nav-active: #e4e6ec;
    --nav-raised: #fff; --nav-shadow: 0 2px 5px #20243418, 0 1px 2px #20243412;
    background: var(--canvas); color: var(--ink); height: 100dvh; overflow: hidden; overscroll-behavior: none;
    font: 13px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  html[data-resolved-theme="dark"] body.immersive-workbench {
    --rail: #111216; --paper: #191a20; --panel: #191a20; --canvas: #111216;
    --ink: #e8e9ee; --ink-soft: #a4a7b3; --text: #e8e9ee; --muted: #a4a7b3; --faint: #9498a7;
    --line: #2a2c35; --line-strong: #373a46; --blue: #a7a6f5; --blue-dark: #b9b7ff;
    --blue-soft: #29283f; --focus: #a7a6f5;     --nav-bg: #15161b; --nav-hover: #1e1f26; --nav-active: #2a2c34;
    --nav-raised: #2b2d36; --nav-shadow: 0 3px 7px #00000038, 0 1px 2px #00000030;
  }
  body.immersive-workbench [hidden] { display: none !important; }
  body.immersive-workbench .app { display: block; height: 100dvh; min-height: 0; overflow: hidden; padding: 0; margin: 0; max-width: none; }
  body.immersive-workbench .immersive-workspace {
    display: grid; grid-template-columns: var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr);
    grid-template-rows: 32px minmax(0, 1fr); height: 100dvh; min-height: 0; min-width: 0;
    padding: 0; margin: 0; gap: 0; border: 0; border-radius: 0; overflow: hidden;
  }
  body.immersive-workbench .immersive-workspace.is-directory-collapsed { grid-template-columns: 0 minmax(0, 1fr); }
  body.immersive-workbench .immersive-workspace.is-directory-collapsed > .tree-pane { display: none; }
  body.immersive-workbench .immersive-workspace > .tree-pane {
    grid-column: 1; grid-row: 1 / 3; position: relative; inset: auto; width: auto; min-width: 0; min-height: 0;
    padding: 0 !important; display: flex; flex-direction: column; overflow: hidden;
    background: var(--nav-bg); border: 0; border-right: 1px solid var(--line); border-radius: 0;
  }
  body.immersive-workbench .immersive-workspace .navigator-project {
    display: flex; flex-direction: column; height: 84px; min-height: 84px; padding: 0 !important;
    margin: 0; border: 0; background: var(--nav-bg); gap: 0; overflow: visible; z-index: 12;
  }
  body.immersive-workbench .immersive-workspace .navigator-native-row {
    display: flex; flex-direction: row-reverse; align-items: center; flex: none;
    height: 32px; min-height: 32px; padding: 0 13px; gap: 0;
  }
  body.immersive-workbench .immersive-workspace .navigator-directory-toggle {
    width: 25px; height: 25px; min-height: 25px; padding: 0; margin: 0; border: 0; border-radius: 5px;
    flex: none; color: var(--muted); background: transparent; display: grid; place-items: center;
  }
  body.immersive-workbench .navigator-directory-toggle svg { width: 14px; height: 14px; }
  body.immersive-workbench .desktop-titlebar-drag { align-self: stretch; flex: 1; height: auto; min-height: 0; min-width: 12px; }
  body.immersive-workbench .immersive-workspace .navigator-project-primary {
    display: flex; align-items: center; gap: 3px; height: 52px; min-height: 52px;
    margin: 0; padding: 4px 11px 13px; border: 0; box-sizing: border-box;
  }
  body.immersive-workbench .immersive-workspace .navigator-project-menu { flex: 1; width: auto; min-width: 0; position: static; }
  body.immersive-workbench .immersive-workspace .navigator-project-selector {
    width: 100%; height: 35px; min-height: 35px; padding: 6px 4px; display: flex; align-items: center;
    gap: 8px; border: 0; border-radius: 6px; color: var(--ink); background: transparent;
  }
  body.immersive-workbench .navigator-project-selector > svg:first-child { height: 23px; width: 23px; padding: 4px; border-radius: 6px; background: #7471d8; color: white; flex: none; }
  body.immersive-workbench .navigator-project-selector > svg:last-child { width: 11px; height: 11px; margin-left: auto; flex: none; }
  body.immersive-workbench .navigator-project-selector strong { font-size: 13px; font-weight: 550; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .immersive-workspace .navigator-project-settings,
  body.immersive-workbench .immersive-workspace .navigator-project-notifications { width: 27px; height: 29px; min-height: 29px; border: 0; border-radius: 5px; background: none; flex: none; color: var(--muted); display: grid; place-items: center; padding: 0; }
  body.immersive-workbench .navigator-project-settings svg, body.immersive-workbench .navigator-project-notifications svg { width: 15px; height: 15px; }
  body.immersive-workbench .navigator-project-menu-popover { position: absolute; top: 78px; left: 10px; right: 10px; width: auto; max-height: min(500px, calc(100dvh - 100px)); overflow: auto; padding: 6px; background: var(--paper); color: var(--ink); border: 0; border-radius: 9px; box-shadow: 0 8px 32px #00000035; z-index: 30; }
  body.immersive-workbench .navigator-project-option { padding: 9px 8px; border-radius: 5px; color: var(--ink); }
  body.immersive-workbench .navigator-project-option strong { font-size: 12px; font-weight: 550; }
  body.immersive-workbench .navigator-project-menu-popover > span { padding: 6px 8px; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .navigator-project-manage { font-size: 11px; color: var(--muted); }
  body.immersive-workbench .immersive-directory-heading { flex: none; min-width: 0; padding: 4px 8px 8px; }
  body.immersive-workbench .immersive-plugin-strip { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding: 0; overflow: visible; }
  body.immersive-workbench .immersive-plugin-link { flex: none; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 0 8px; font: inherit; font-size: 13px; font-weight: 450; white-space: nowrap; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; text-align: left; transition: color 150ms ease, background-color 150ms ease; }
  body.immersive-workbench .immersive-plugin-link svg { width: 16px; height: 16px; color: var(--faint); flex: none; }
  body.immersive-workbench .immersive-plugin-link:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench .immersive-plugin-link:hover svg { color: var(--ink); }
  body.immersive-workbench .immersive-plugin-link[aria-current] { background: transparent; color: var(--ink); font-weight: 550; box-shadow: none; }
  body.immersive-workbench .immersive-plugin-link[aria-current] svg { color: var(--ink); }
  body.immersive-workbench .immersive-plugin-link[aria-current]:hover { background: var(--nav-hover); }
  body.immersive-workbench .directory-list-region { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; border-top: 1px solid var(--line); }
  body.immersive-workbench .directory-list-chrome { flex: none; min-width: 0; padding: 12px 16px 8px; }
  body.immersive-workbench .directory-list-title { margin: 0; font: inherit; font-size: 12px; font-weight: 650; line-height: 18px; color: var(--ink); letter-spacing: -.01em; }
  body.immersive-workbench .directory-list-chrome:has([data-feed-views]:not([hidden])) .directory-list-title { margin-bottom: 6px; }
  body.immersive-workbench .directory-list-chrome .immersive-feed-views { display: flex; gap: 2px; padding: 0; }
  body.immersive-workbench .immersive-feed-views button { border: 0; border-radius: 5px; min-height: 26px; padding: 0 8px; background: transparent; color: var(--faint); font: inherit; font-size: 12px; cursor: pointer; transition: color 150ms ease, background-color 150ms ease; }
  body.immersive-workbench .immersive-feed-views button.is-current { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .directory-list-stage { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
  body.immersive-workbench .directory-home-empty { margin: 6px 8px 18px; font-size: 12px; line-height: 1.55; color: var(--faint); }
  body.immersive-workbench .immersive-workspace .desktop-directory-panel:not([hidden]) { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 0 8px 0; overflow: auto; overscroll-behavior: contain; background: transparent; }
  body.immersive-workbench .immersive-workspace .desktop-directory-panel:not([hidden]):not(.desktop-directory-root) { overflow: hidden; }
  body.immersive-workbench .desktop-directory-panel.is-directory-enter { animation: directory-list-in 220ms cubic-bezier(.16, 1, .3, 1); }
  body.immersive-workbench .directory-list-title.is-title-enter { animation: directory-title-in 180ms cubic-bezier(.16, 1, .3, 1); }
  @keyframes directory-list-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes directory-title-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    body.immersive-workbench .desktop-directory-panel.is-directory-enter,
    body.immersive-workbench .directory-list-title.is-title-enter { animation: none; }
  }
  body.immersive-workbench .tree-pane .goal-list-view { display: block; }
  body.immersive-workbench .immersive-workspace .desktop-directory-heading { display: none !important; }
  body.immersive-workbench .immersive-workspace .desktop-directory-root { padding-bottom: 14px; }
  body.immersive-workbench .desktop-module-list { display: grid; gap: 3px; }
  body.immersive-workbench .desktop-module-item { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 52px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
  body.immersive-workbench .desktop-module-item > svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
  body.immersive-workbench .desktop-module-item > svg:last-child { width: 12px; height: 12px; }
  body.immersive-workbench .desktop-module-item > span { flex: 1; min-width: 0; }
  body.immersive-workbench .desktop-module-item strong { display: block; font-size: 12px; font-weight: 550; }
  body.immersive-workbench .desktop-module-item small { display: block; font-size: 10px; line-height: 1.5; color: var(--muted); margin-top: 3px; }
  body.immersive-workbench .desktop-module-item.is-current { background: var(--nav-active); }
  body.immersive-workbench .immersive-workspace .tree-chrome { padding: 0 8px 8px; background: transparent; border: 0; flex: none; }
  body.immersive-workbench .navigator-view-switch { display: none; }
  body.immersive-workbench .tree-search { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; background: var(--nav-hover); border: 0; border-radius: 6px; box-shadow: none; }
  body.immersive-workbench .tree-search input { font: inherit; font-size: 13px; padding: 0; border: 0; outline: none; background: transparent; color: var(--ink); flex: 1; min-width: 0; }
  body.immersive-workbench .tree-search svg { position: static; flex: none; width: 14px; height: 14px; color: var(--muted); }
  body.immersive-workbench .tree-search kbd { position: static; flex: none; font-family: inherit; font-size: 9px; line-height: 1.5; color: var(--muted); border: 0; padding: 0; background: transparent; }
  body.immersive-workbench .tree-search:focus-within { outline: 2px solid var(--blue); outline-offset: 0; }
  body.immersive-workbench .tree-tools { gap: 2px; padding: 6px 0 0; margin: 0; border: 0; display: flex; }
  body.immersive-workbench .tree-tool { width: 27px; height: 27px; min-height: 27px; padding: 0; display: inline-grid; place-items: center; background: transparent; border: 0; border-radius: 5px; color: var(--muted); }
  body.immersive-workbench .tree-tool > span, body.immersive-workbench .tree-tool > b { display: none; }
  body.immersive-workbench .tree-filter-control { margin-right: auto; }
  body.immersive-workbench .tree-tool svg { width: 14px; height: 14px; }
  body.immersive-workbench .immersive-workspace :is(.tree-scroll, .project-record-scroll, .feed-directory-list, .source-directory-list, .feed-item-scroll, .source-list) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0; background: transparent; }
  body.immersive-workbench .goal-tree { padding: 0; margin: 0; }
  body.immersive-workbench .tree-item { margin: 0; padding: 0; border: 0; }
  body.immersive-workbench .tree-row { display: flex; align-items: flex-start; gap: 2px; padding: 2px 0; margin: 0; }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry { min-width: 0; flex: 1; display: flex; align-items: center; padding: 0; border: 0; border-radius: 5px; background: transparent; }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry.is-selected { background: var(--nav-active); }
  body.immersive-workbench .immersive-workspace .desktop-goal-directory .tree-entry .tree-title-line strong { color: var(--ink); }
  body.immersive-workbench .tree-node { flex: 1; min-width: 0; min-height: 31px; padding: 6px 7px; border: 0; border-radius: 5px; background: transparent; color: var(--ink); }
  body.immersive-workbench .tree-node.is-selected { background: transparent; }
  body.immersive-workbench .tree-title-line strong { font-size: 11px; font-weight: 450; line-height: 1.7; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  body.immersive-workbench .tree-copy > small, body.immersive-workbench .tree-meta-line { display: none !important; }
  body.immersive-workbench .tree-toggle, body.immersive-workbench .tree-guide { flex: none; width: 17px; height: 31px; min-height: 31px; padding: 0; display: grid; place-items: center; border: 0; background: transparent; color: var(--muted); }
  body.immersive-workbench .tree-toggle svg { width: 11px; height: 11px; }
  body.immersive-workbench .tree-children { padding-left: 7px; margin: 0 0 0 8px; border-left: 1px solid var(--line); }
  body.immersive-workbench .tree-pane .tree-footer,
  body.immersive-workbench .tree-pane .feed-directory-footer,
  body.immersive-workbench .tree-pane [data-tree-footer] { display: none !important; }
  body.immersive-workbench .project-record-tools { padding: 0 8px 8px; border: 0; gap: 6px; }
  body.immersive-workbench .project-record-row { padding: 9px 8px; border: 0; border-radius: 6px; background: transparent; }
  body.immersive-workbench .project-record-row.is-selected { background: var(--nav-active); }
  body.immersive-workbench .project-record-select strong { font-size: 11px; font-weight: 500; }
  body.immersive-workbench .project-record-select small, body.immersive-workbench .project-record-meta { font-size: 10px; color: var(--muted); }
  body.immersive-workbench .immersive-workspace .personal-sidebar-footer { flex: none; height: auto; min-height: 0; margin: 0; padding: 8px 10px; border: 0; border-top: 1px solid var(--line); background: transparent; display: block; }
  body.immersive-workbench .personal-account { display: flex; align-items: center; min-width: 0; min-height: 60px; gap: 9px; padding: 8px; border: 0; border-radius: 6px; color: var(--ink); text-decoration: none; }
  body.immersive-workbench .personal-account-avatar { display: grid; place-items: center; flex: none; width: 25px; height: 25px; border-radius: 50%; color: var(--muted); background: transparent; border: 1px solid var(--line); }
  body.immersive-workbench .personal-account-avatar svg { width: 13px; height: 13px; }
  body.immersive-workbench .personal-account-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
  body.immersive-workbench .personal-account-copy strong, body.immersive-workbench .personal-account-copy small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .personal-account-copy strong { font-size: 11px; font-weight: 500; }
  body.immersive-workbench .personal-account-copy small { display: block; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .personal-account-settings { display: grid; place-items: center; flex: none; width: 26px; height: 26px; color: var(--muted); }
  body.immersive-workbench .personal-account-settings svg { width: 14px; height: 14px; }
  body.immersive-workbench .immersive-titlebar { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 12px; height: 32px; min-height: 32px; padding: 0 20px; margin: 0; border: 0; background: var(--nav-bg); box-shadow: inset 0 -1px 0 var(--line); overflow: visible; }
  body.immersive-workbench .immersive-titlebar > strong { font-size: 11px; font-weight: 500; }
  body.immersive-workbench .container-tabs { min-width: 0; flex: 1; height: 32px; display: flex; align-items: stretch; overflow: auto; scrollbar-width: none; gap: 2px; }
  body.immersive-workbench .container-tabs::-webkit-scrollbar { display: none; }
  body.immersive-workbench .container-tab { max-width: 168px; min-width: 72px; flex: 0 1 auto; display: flex; align-items: center; gap: 6px; padding: 0 8px; font: inherit; font-size: 12px; font-weight: 500; color: var(--muted); background: transparent; border: 0; cursor: pointer; box-shadow: inset 0 -2px 0 transparent; }
  body.immersive-workbench .container-tab:hover { color: var(--ink); }
  body.immersive-workbench .container-tab[aria-current] { color: var(--ink); font-weight: 650; box-shadow: inset 0 -2px 0 var(--blue); }
  body.immersive-workbench .container-tab.is-pinned { letter-spacing: -.01em; }
  body.immersive-workbench .container-tab span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .container-tab-close { width: 18px; height: 18px; border-radius: 4px; margin-left: 2px; color: var(--muted); display: grid; place-items: center; opacity: .7; padding: 0; border: 0; background: transparent; }
  body.immersive-workbench .container-tab-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .container-tab-close svg { width: 11px; height: 11px; }
  body.immersive-workbench .immersive-plugin-stage > .goal-frame-surface { overflow: hidden; background: var(--canvas); padding: 0; }
  body.immersive-workbench .immersive-goal-tools { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--muted); }
  body.immersive-workbench .immersive-icon-button { width: 28px; height: 28px; padding: 0; flex: none; display: inline-grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  body.immersive-workbench .immersive-icon-button svg { height: 16px; width: 16px; }
  body.immersive-workbench .immersive-show-directory { display: none; }
  body.immersive-workbench .is-directory-collapsed .immersive-show-directory { display: inline-grid; }
  body.immersive-workbench .immersive-plugin-stage { grid-column: 2; grid-row: 2; position: relative; min-width: 0; min-height: 0; overflow: hidden; container: plugin-stage / inline-size; }
  body.immersive-workbench .immersive-plugin-stage > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .desktop-work-surface { min-height: 0; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface { min-height: 0; background: var(--paper); padding: 32px clamp(18px, 4%, 56px); }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface > [data-operation-detail] { max-width: 980px; margin: auto; }
  body.immersive-workbench .immersive-plugin-stage > .document-pane { padding: 0; }
  body.immersive-workbench .immersive-plugin-stage > .goal-canvas-shell { overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .immersive-sidebar-scrim { display: none; }
  body.immersive-workbench .immersive-plugin-stage > .immersive-market { overflow: hidden; display: flex; flex-direction: column; padding-top: clamp(24px, 6vh, 72px); padding-bottom: 24px; }
  body.immersive-workbench .plugin-market-heading, body.immersive-workbench .plugin-market-controls, body.immersive-workbench .plugin-market-status, body.immersive-workbench .plugin-market-note, body.immersive-workbench .immersive-market [data-market-retry] { flex: none; }
  body.immersive-workbench .plugin-market-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; width: 100%; }
  body.immersive-workbench .plugin-market-heading, body.immersive-workbench .plugin-market-controls, body.immersive-workbench .plugin-market-grid, body.immersive-workbench .plugin-market-status, body.immersive-workbench .plugin-market-note { max-width: 940px; margin-left: auto; margin-right: auto; }
  body.immersive-workbench .plugin-market-heading > span, body.immersive-workbench .plugin-market-note { font-size: 11px; color: var(--muted); }
  body.immersive-workbench .plugin-market-heading h1 { font-size: 32px; font-weight: 550; margin: 10px 0; letter-spacing: -.03em; }
  body.immersive-workbench .plugin-market-heading p { color: var(--muted); font-size: 13px; }
  body.immersive-workbench .plugin-market-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; margin-top: 28px; }
  body.immersive-workbench .plugin-market-controls label { display: grid; gap: 6px; font-size: 11px; color: var(--muted); flex: 1 1 160px; }
  body.immersive-workbench .plugin-market-controls input[type=search], body.immersive-workbench .plugin-market-controls select { width: 100%; min-height: 36px; padding: 7px 10px; background: var(--nav-bg); border: 1px solid var(--line); border-radius: 6px; color: var(--ink); font: inherit; font-size: 12px; }
  body.immersive-workbench .plugin-market-controls .plugin-market-filter { display: flex; flex: none; align-items: center; min-height: 36px; gap: 7px; }
  body.immersive-workbench .plugin-market-filter input { width: 14px; height: 14px; margin: 0; }
  body.immersive-workbench .plugin-market-status { min-height: 20px; font-size: 12px; color: var(--muted); }
  body.immersive-workbench .plugin-market-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 18px; }
  body.immersive-workbench .plugin-market-grid article { padding: 24px; border: 1px solid var(--line); border-radius: 10px; background: var(--nav-bg); }
  body.immersive-workbench .plugin-market-icon { color: var(--muted); margin-bottom: 24px; }
  body.immersive-workbench .plugin-market-icon svg { width: 25px; height: 25px; }
  body.immersive-workbench .plugin-market-grid h2 { font-size: 17px; font-weight: 500; margin: 0; }
  body.immersive-workbench .plugin-market-grid p { font-size: 12px; line-height: 1.7; color: var(--muted); margin: 10px 0 28px; }
  body.immersive-workbench .plugin-market-grid footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--muted); }
  body.immersive-workbench .plugin-market-grid button { padding: 7px 11px; min-height: 32px; border: 1px solid var(--line-strong); border-radius: 6px; color: var(--ink); background: var(--nav-raised); cursor: pointer; font: inherit; }
  body.immersive-workbench [data-artifact-directory] { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .artifact-version-list a { font-size: 11px; }
  body.immersive-workbench .artifact-version-list small { font-size: 10px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail, body.immersive-workbench .immersive-artifact-surface .artifact-empty { max-width: 800px; margin: 24px auto; }
  body.immersive-workbench .artifact-reference-label input, body.immersive-workbench .artifact-content-reference input { width: 100%; padding: 10px; font: inherit; color: var(--ink); background: var(--nav-bg); border: 1px solid var(--line); border-radius: 6px; }
  body.immersive-workbench .artifact-export { color: var(--ink); }
  body.immersive-workbench :is(.immersive-icon-button, .navigator-directory-toggle, .navigator-project-selector, .tree-tool):hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench :focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  body.immersive-workbench :is(.immersive-titlebar button, .navigator-native-row button, .immersive-plugin-link):focus-visible { outline-offset: -2px; }
  body.immersive-workbench ::selection { color: var(--ink); background: var(--blue-soft); }
  body.immersive-workbench :is(input, textarea) { caret-color: var(--blue); }
  body.immersive-workbench * { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  body.immersive-workbench button:disabled { cursor: default; opacity: .45; }
  @media (max-width: 1050px) { body.immersive-workbench { --immersive-sidebar-width: 236px; } body.immersive-workbench .immersive-titlebar { padding: 0 16px; gap: 8px; } }
  @media (max-width: 600px) {
    body.immersive-workbench .immersive-workspace { grid-template-columns: 0 minmax(0, 1fr); }
    body.immersive-workbench .immersive-workspace > .tree-pane { display: none; position: fixed; inset: 0 auto 0 0; width: 264px; z-index: 40; box-shadow: 12px 0 40px #00000035; }
    body.immersive-workbench .immersive-workspace.is-directory-drawer-open > .tree-pane { display: flex; }
    body.immersive-workbench .immersive-sidebar-scrim:not([hidden]) { display: block; position: fixed; inset: 0; z-index: 35; border: 0; padding: 0; background: #08091080; }
    body.immersive-workbench .immersive-titlebar { padding: 0 12px; gap: 8px; }
    body.immersive-workbench .immersive-show-directory { display: inline-grid; }
    body.immersive-workbench .immersive-goal-tools > span { display: none; }
    body.immersive-workbench .immersive-plugin-link { min-height: 44px; }
    body.immersive-workbench .tree-search input { font-size: 16px; }
    body.immersive-workbench .tree-search kbd { display: none; }
    body.immersive-workbench .tree-node { min-height: 38px; }
  }
`;
