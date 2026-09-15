/** AP3 visual layer: foundation. */
export const FOUNDATION_STYLES = `  :root {
    color-scheme: light;
    --page: #f6f6f7;
    --paper: #ffffff;
    --ink: #19191b;
    --ink-soft: #424247;
    --muted: #62626b;
    --faint: #66666f;
    --line: #e8e8eb;
    --line-strong: #dcdce1;
    --rail: #f1f1f3;
    --blue: #5068b7;
    --blue-dark: #344b9b;
    --blue-soft: #e9edfb;
    --green: #347759;
    --green-soft: #edf6f0;
    --amber: #936b2d;
    --amber-soft: #f8f2e7;
    --red: #a64e51;
    --red-soft: #f9eeee;
    --terminal: #171719;
    --terminal-ink: #f1f1f3;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
    --action: #202023;
    --action-ink: #fbfbfc;
    --danger-action: var(--red);
    --danger-action-ink: var(--page);
    --shadow-soft: 0 1px 2px rgba(25, 25, 31, .045), 0 4px 12px rgba(25, 25, 31, .035);
    --shadow-raised: 0 2px 5px rgba(25, 25, 31, .055), 0 10px 28px rgba(25, 25, 31, .06);
    --shadow: 0 12px 32px rgba(25, 25, 31, .095);
    --shadow-color: #19202c;
    --radius-item: 6px;
    --radius-control: 8px;
    --radius-surface: 10px;
    --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  }

  html[data-resolved-theme="dark"] {
    color-scheme: dark;
    --page: #121214;
    --paper: #1b1b1e;
    --ink: #f0f0f2;
    --ink-soft: #c6c6cc;
    --muted: #96969f;
    --faint: #85858e;
    --line: #2b2b30;
    --line-strong: #38383f;
    --rail: #171719;
    --blue: #91a7f2;
    --blue-dark: #b1c0f6;
    --blue-soft: #292f46;
    --green: #78b391;
    --green-soft: #20332a;
    --amber: #d0a15b;
    --amber-soft: #372f22;
    --red: #e08386;
    --red-soft: #3b2528;
    --shadow-color: #000000;
    --terminal: #101012;
    --terminal-ink: #f0f0f2;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
    --action: #f0f0f2;
    --action-ink: #202023;
    --shadow-soft: 0 1px 2px rgba(0, 0, 0, .22), 0 5px 14px rgba(0, 0, 0, .14);
    --shadow-raised: 0 3px 7px rgba(0, 0, 0, .24), 0 13px 32px rgba(0, 0, 0, .18);
    --shadow: 0 22px 58px rgba(0, 0, 0, .38);
  }

  html[data-resolved-terminal-theme="light"] {
    --terminal: #fbfbfc;
    --terminal-ink: #202023;
    --terminal-muted: #65656e;
    --terminal-faint: #7b7b84;
    --terminal-border: #dedee3;
    --terminal-selection: #dce4f8;
  }

  html[data-resolved-terminal-theme="dark"] {
    --terminal: #101012;
    --terminal-ink: #f0f0f2;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
  }

  body {
    background: var(--page);
    color: var(--ink);
    font: 13px/1.5 var(--font);
    letter-spacing: -.003em;
  }

  body[data-navigation-pending="true"] { cursor: progress; }
  body[data-navigation-pending="true"]::before {
    content: "";
    position: fixed;
    z-index: 1000;
    top: 0;
    left: 0;
    width: 38%;
    height: 2px;
    background: var(--blue);
    transform-origin: left center;
    animation: molis-work-navigation-progress .7s ease-in-out infinite alternate;
    pointer-events: none;
  }
  body[data-navigation-pending="true"] a[aria-busy="true"] { color: var(--blue-dark); }
  @keyframes molis-work-navigation-progress {
    from { transform: scaleX(.45); opacity: .72; }
    to { transform: translateX(160%) scaleX(1.1); opacity: 1; }
  }

  svg { stroke-width: 1.7; }
  button, input, textarea, select { font-family: var(--font); }
  button:focus-visible, input:focus-visible, textarea:focus-visible,
  select:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue), transparent 28%);
    outline-offset: 2px;
  }

  .app { grid-template-rows: 48px minmax(0, 1fr); }
  .topbar {
    border-bottom-color: var(--line);
    background: color-mix(in srgb, var(--paper) 94%, var(--rail));
    box-shadow: none;
    isolation: isolate;
    transform: translateZ(0);
  }
  .brand {
    min-width: 164px;
    padding: 0 20px;
    gap: 9px;
    border-right-color: var(--line);
  }
  .brand svg { width: 18px; height: 18px; font-size: 18px; stroke-width: 2; }
  .brand strong { font-size: 16px; font-weight: 680; letter-spacing: -.025em; }
  .project-context { padding: 0 12px 0 18px; color: var(--ink-soft); }
  .project-context strong, .project-context span { overflow: hidden; text-overflow: ellipsis; }
  .project-context a { color: var(--blue-dark); }
  .navigator-project {
    padding: 9px 10px 8px;
    border-bottom-color: var(--line);
    background: color-mix(in srgb, var(--paper) 58%, var(--rail));
    gap: 5px;
  }
  .navigator-project-primary > strong { color: var(--ink); font-size: 12px; font-weight: 680; letter-spacing: -.01em; }
  .top-action {
    height: 30px;
    margin-right: 8px;
    padding: 0 9px;
    border-radius: 8px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  a.top-action { color: var(--muted); }
  .top-action svg { width: 15px; height: 15px; font-size: 15px; }
  .locale-switch { margin-right: 6px; border-color: var(--line); border-radius: 9px; background: var(--paper); }
  .locale-switch a { border-radius: 7px; font-size: 11px; font-weight: 620; }

  .desktop-pane-header { display: none; }
  .goal-title-kicker { display: none; }

  body[data-desktop-shell="true"] .app { grid-template-rows: 42px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar {
    position: relative;
    min-height: 42px;
    padding-left: 88px;
    padding-bottom: 6px;
    background: color-mix(in srgb, var(--rail) 98%, var(--paper));
    -webkit-user-select: none;
    user-select: none;
  }
  body[data-desktop-shell="true"] .brand {
    position: absolute;
    left: 50%;
    z-index: 2;
    min-width: auto;
    height: 30px;
    padding: 0;
    gap: 6px;
    border-right: 0;
    transform: translateX(-50%);
  }
  body[data-desktop-shell="true"] .brand svg { width: 14px; height: 14px; color: var(--blue); display: block; }
  body[data-desktop-shell="true"] .brand strong { font-size: 12px; font-weight: 680; letter-spacing: -.01em; }
  body[data-desktop-shell="true"] .project-context {
    height: 28px;
    max-width: min(30vw, 360px);
    padding: 0 12px 0 0;
    border-left: 0;
    font-size: 11px;
  }
  body[data-desktop-shell="true"] .project-context strong { display: none; }
  body[data-desktop-shell="true"] .project-context span { font-weight: 620; }
  body[data-desktop-shell="true"] .project-context a { font-size: 10px; }
  body[data-desktop-shell="true"] .top-action,
  body[data-desktop-shell="true"] .theme-picker > summary { height: 26px; }
  body[data-desktop-shell="true"] .locale-switch a { min-height: 24px; }
  body[data-desktop-shell="true"] .top-action { margin-right: 6px; font-size: 11px; }

  body[data-desktop-shell="true"] .desktop-pane-header {
    min-width: 0;
    min-height: 56px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line);
    background: var(--rail);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  body[data-desktop-shell="true"] .desktop-pane-header strong { font-size: 14px; font-weight: 680; letter-spacing: -.015em; }
  body[data-desktop-shell="true"] .desktop-pane-header small {
    min-width: 0;
    overflow: hidden;
    color: var(--faint);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator { min-height: 34px; padding-inline: 10px; }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong { color: var(--muted); font-size: 10px; font-weight: 680; letter-spacing: .02em; }
  body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto 34px auto minmax(0, 1fr) 46px; }
  body[data-desktop-shell="true"] .document-pane { position: relative; }
  body[data-desktop-shell="true"] .document-pane > .desktop-pane-header {
    position: sticky;
    top: 0;
    z-index: 8;
    background: color-mix(in srgb, var(--paper) 96%, var(--rail));
  }
  @media (min-width: 1181px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui {
      grid-template-columns: var(--tree-width, clamp(360px, 30vw, 480px)) 5px minmax(430px, 1fr) 5px var(--tui-width, clamp(440px, 37vw, 620px));
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(620px, 1fr) 1px minmax(330px, 390px);
    }
  }
  body[data-desktop-shell="true"] .tree-chrome {
    padding: 10px 12px 9px;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 5px 7px;
  }
  body[data-desktop-shell="true"] .tree-search { grid-column: 1 / -1; grid-row: 1; }
  body[data-desktop-shell="true"] .navigator-view-switch { grid-column: 1; grid-row: 2; }
  body[data-desktop-shell="true"] .tree-tools { grid-column: 2; grid-row: 2; justify-content: flex-end; }
  body[data-desktop-shell="true"] .tree-tool { width: 26px; height: 26px; padding: 0; justify-content: center; }
  body[data-desktop-shell="true"] .tree-tool span,
  body[data-desktop-shell="true"] .tree-tool small { display: none; }
  body[data-desktop-shell="true"] .tree-scroll { padding: 8px 12px 18px; }
  body[data-desktop-shell="true"] .goal-status { min-height: 19px; padding: 0 5px; font-size: 10px; }
  body[data-desktop-shell="true"] .goal-status svg { width: 10px; height: 10px; }
  body[data-desktop-shell="true"] .tree-relations { margin-bottom: 3px; }
  body[data-desktop-shell="true"] .tree-relations > summary { min-height: 21px; padding-block: 1px; }
  body[data-desktop-shell="true"] .goal-document { width: 100%; padding: 23px 28px 52px; }
  body[data-desktop-shell="true"] .goal-header { padding-bottom: 18px; }
  body[data-desktop-shell="true"] .goal-title-kicker { min-height: 20px; margin-bottom: 4px; display: flex; align-items: center; }
  body[data-desktop-shell="true"] .goal-title-kicker .goal-status { background: transparent; padding-inline: 0; }
  body[data-desktop-shell="true"] .goal-title-row h1 { font-size: clamp(24px, 2vw, 30px); }
  body[data-desktop-shell="true"] .goal-title-actions .document-action--quick {
    width: 34px;
    min-width: 34px;
    padding: 0;
    justify-content: center;
  }
  body[data-desktop-shell="true"] .goal-title-actions .document-action--quick span { display: none; }
  body[data-desktop-shell="true"] .goal-now { padding: 18px 0; }
  body[data-desktop-shell="true"] .goal-now-body { margin-top: 11px; }
  body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 15px; }
  body[data-desktop-shell="true"] .goal-focus-criteria { padding: 18px 0 21px; }

  .theme-picker { position: relative; flex: 0 0 auto; }
  .theme-picker > summary { list-style: none; margin-right: 4px; cursor: pointer; }
  .theme-picker > summary::-webkit-details-marker { display: none; }
  .theme-picker > summary .theme-caret { width: 11px; height: 11px; transition: transform .16s ease; }
  .theme-picker[open] > summary { color: var(--blue-dark); background: var(--blue-soft); }
  .theme-picker[open] > summary .theme-caret { transform: rotate(180deg); }
  .theme-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 7px);
    right: 4px;
    width: 166px;
    padding: 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button {
    width: 100%;
    min-height: 34px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    display: grid;
    grid-template-columns: 17px minmax(0, 1fr) 15px;
    align-items: center;
    gap: 8px;
    text-align: left;
    cursor: pointer;
  }
  .theme-menu button:hover { color: var(--ink); background: var(--rail); }
  .theme-menu button[aria-pressed="true"] { color: var(--blue-dark); background: var(--blue-soft); }
  .theme-menu button > svg { width: 15px; height: 15px; }
  .theme-menu button .theme-check { opacity: 0; }
  .theme-menu button[aria-pressed="true"] .theme-check { opacity: 1; }

  .workspace { grid-template-columns: var(--tree-width, clamp(292px, 22vw, 380px)) 5px minmax(0, 1fr); }
  .workspace.is-desktop-tui {
    grid-template-columns: var(--tree-width, clamp(292px, 22vw, 380px)) 5px minmax(400px, 1fr) 5px var(--tui-width, min(36vw, 600px));
  }
  .workspace.is-graph-view,
  .workspace.is-desktop-tui.is-graph-view,
  .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed {
    grid-template-columns: minmax(620px, 1fr) 5px minmax(310px, 370px);
  }
  .workspace.is-graph-view .tui-resizer,
  .workspace.is-graph-view .tui-pane,
  .workspace.is-graph-view .tui-expand { display: none; }
  .workbench-header {
    min-width: 0;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    display: none;
    align-items: center;
  }
  .workbench-switch {
    min-width: 0;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--paper) 76%, var(--rail));
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .workbench-switch button {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 620 11px/1 var(--font);
    cursor: pointer;
  }
  .workbench-switch button svg { width: 12px; height: 12px; }
  .workbench-switch button:hover { color: var(--ink); }
  .workbench-switch button.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 4px rgba(22, 31, 43, .08);
  }
  .tree-pane {
    grid-template-rows: auto auto minmax(0, 1fr) 42px;
    border-right-color: var(--line);
    background: var(--rail);
  }
  .tree-chrome, .tree-footer {
    border-color: var(--line);
    background: var(--rail);
  }
  .tree-chrome { padding: 9px 10px 7px; gap: 5px; }
  .navigator-view-switch {
    width: fit-content;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: color-mix(in srgb, var(--paper) 72%, var(--rail));
    display: grid;
    grid-template-columns: repeat(2, minmax(74px, 1fr));
    gap: 2px;
  }
  .navigator-view-switch button {
    min-height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 650;
    cursor: pointer;
  }
  .navigator-view-switch button svg { width: 12px; height: 12px; }
  .navigator-view-switch button.is-active { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px rgba(22, 31, 43, .08); }
  .tree-search input {
    height: 30px;
    border-color: var(--line);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
  }
  .tree-search kbd { border-color: var(--line); background: var(--paper); color: var(--faint); }
  .tree-scroll { padding: 8px 10px 16px; }
  .tree-children { margin-left: 14px; padding-left: 9px; border-left-color: color-mix(in srgb, var(--line-strong) 68%, transparent); }
  .tree-row { min-height: 38px; }
  .tree-toggle, .tree-guide { flex-basis: 18px; width: 18px; color: var(--faint); }
  .tree-toggle { border-radius: 6px; }
  .tree-toggle:hover { color: var(--ink-soft); background: color-mix(in srgb, var(--paper) 72%, transparent); }
  .tree-node {
    min-height: 36px;
    padding: 5px 8px;
    border-radius: 8px;
    color: var(--ink);
  }
  .tree-node:hover { background: color-mix(in srgb, var(--paper) 66%, transparent); }
  .tree-node.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--blue-soft) 86%, var(--paper));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 30%, transparent);
  }
  .tree-node.is-selected .tree-copy small { color: color-mix(in srgb, var(--blue-dark), var(--muted) 45%); }
  .tree-node.is-selected .goal-status { color: inherit; }
  .tree-copy { grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; align-items: baseline; }
  .tree-copy strong { font-size: 12.5px; font-weight: 610; }
  .tree-copy > small {
    display: block;
    min-width: max-content;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  .tree-progress {
    grid-column: 1 / -1;
    width: fit-content;
    margin-top: 3px;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .tree-progress > i { width: 34px; height: 2px; overflow: hidden; background: var(--line-strong); }
  .tree-progress > i > b { display: block; width: var(--tree-progress); height: 100%; background: var(--green); }
  .tree-progress.is-blocked { color: var(--red); }
  .tree-progress.is-blocked > i > b { background: var(--red); }
  .tree-relations { margin: 0 0 5px 18px; color: var(--muted); }
  .tree-relations > summary {
    width: fit-content;
    max-width: calc(100% - 6px);
    min-height: 22px;
    padding: 1px 6px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    list-style: none;
    cursor: pointer;
  }
  .tree-relations > summary::-webkit-details-marker { display: none; }
  .tree-relations > summary:hover { color: var(--ink-soft); background: color-mix(in srgb, var(--paper) 62%, transparent); }
  .tree-relations > summary svg { width: 10px; height: 10px; }
  .tree-relations > summary > svg:last-child { color: var(--faint); transition: transform .16s ease; }
  .tree-relations[open] > summary > svg:last-child { transform: rotate(180deg); }
  .tree-relations > summary strong { font-size: 10px; font-weight: 620; }
  .tree-relations > summary em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-style: normal; }
  .tree-relations.is-ready > summary em { color: var(--green); }
  .tree-relations.is-waiting > summary em { color: var(--amber); }
  .tree-relations.is-blocked > summary em { color: var(--red); }
  .tree-deps { margin: 2px 6px 6px 0; padding: 3px 0 2px 5px; border-left: 1px solid var(--line); }
  .tree-dep { min-height: 28px; padding: 3px 6px; align-items: center; }
  .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 48%, transparent); }
  .tree-dep-copy { gap: 0; }
  .tree-dep-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-soft); font-size: 10px; }
  .tree-dep-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }
  .tree-dep > em { max-width: 84px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-style: normal; }
  .tree-dep.is-waiting > em { color: var(--amber); }
  .tree-dep.is-ready > em { color: var(--green); }
  .tree-dep.is-blocked > em { color: var(--red); }
  .goal-status {
    min-height: 19px;
    padding: 1px 5px;
    gap: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-size: 10px;
    font-weight: 650;
  }
  .goal-status svg { width: 11px; height: 11px; font-size: 11px; }
  .tree-footer { padding: 0 16px; color: var(--ink-soft); font-size: 11px; }

  .goal-navigator { min-width: 0; padding: 2px 0 18px; }
  .navigator-group { border-bottom: 1px solid var(--line); }
  .navigator-group:last-child { border-bottom: 0; }
  .navigator-group > header {
    height: 42px;
    padding: 0 8px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .navigator-group > header > span { min-width: 0; display: inline-flex; align-items: center; gap: 8px; }
  .navigator-group > header i,
  .navigator-goal-leading i {
    width: 7px;
    height: 7px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    display: block;
  }
  .navigator-group > header strong { color: var(--ink-soft); font-size: 10px; font-weight: 680; letter-spacing: .045em; text-transform: uppercase; }
  .navigator-group > header small { color: var(--faint); font-size: 10px; font-variant-numeric: tabular-nums; }
  .navigator-group > header > svg { width: 12px; height: 12px; color: var(--faint); }
  .navigator-group > ul { list-style: none; margin: 0 0 7px; padding: 0; }
  .navigator-goal { min-width: 0; }
  .navigator-goal-row {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 6px 8px 6px calc(8px + var(--navigator-depth, 0) * 14px);
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    text-align: left;
    cursor: pointer;
  }
  .navigator-goal-row:hover { color: var(--ink); background: color-mix(in srgb, var(--paper) 64%, transparent); }
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: var(--blue-soft);
    box-shadow: inset 2px 0 0 var(--blue);
  }
  .navigator-goal-leading { color: var(--faint); display: grid; place-items: center; }
  .navigator-goal-leading i { width: 8px; height: 8px; border-width: 1.5px; }
  .navigator-goal-row.is-selected .navigator-goal-leading { color: var(--blue); }
  .navigator-goal-copy { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .navigator-goal-copy > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 570; letter-spacing: -.008em; }
  .navigator-goal-copy .tree-progress { flex: 0 0 auto; margin: 0; }
  .navigator-goal-copy .tree-progress > i { display: none; }
  .navigator-relation-count { color: var(--faint); display: inline-flex; align-items: center; gap: 3px; font-size: 9px; }
  .navigator-relation-count svg { width: 10px; height: 10px; }
  .navigator-relation-count b { font-weight: 600; }
  .navigator-goal-row .goal-status { min-height: 19px; padding-inline: 6px; font-size: 10px; }
  .navigator-goal-row .goal-status svg { display: none; }
  .navigator-goal > .tree-relations { display: none; }
  .navigator-group--ready > header i { color: var(--green); background: var(--green); border-color: var(--green); }
  .navigator-group--active > header i { color: var(--amber); background: var(--amber); border-color: var(--amber); }
  .navigator-group--waiting > header i { color: var(--faint); }
  .navigator-group--blocked > header i { color: var(--red); background: var(--red); border-color: var(--red); }
  .navigator-group--done > header i { color: var(--faint); background: var(--faint); border-color: var(--faint); }

  html[data-resolved-theme="dark"] .navigator-goal-row:hover { background: color-mix(in srgb, var(--paper) 78%, var(--rail)); }
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected {
    background: color-mix(in srgb, var(--blue-soft) 88%, var(--paper));
  }

  .tree-pane[data-navigator-view="graph"] .tree-scroll { padding: 0; overflow: hidden; }
  .tree-pane[data-navigator-view="graph"] .goal-list-view { display: none; }

`;

