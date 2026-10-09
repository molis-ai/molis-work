/** AP3 visual layer: personal-workbench-v3. */
export const PERSONAL_WORKBENCH_V3_STYLES = `  /* Personal workbench v3: one directory, project-scoped tabs, and soft work surfaces. */
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] {
      --desktop-titlebar-height: 48px;
      --desktop-titlebar-control-height: 34px;
      --desktop-project-control-center-y: calc(var(--desktop-titlebar-height) / 2);
      --desktop-native-control-row-height: var(--desktop-titlebar-height);
      --desktop-project-safe-inline-start: var(--desktop-native-project-safe-inline-start, 2px);
      --desktop-settings-safe-inline-start: var(--desktop-native-settings-safe-inline-start, 2px);
    }
    body[data-desktop-shell="true"][data-native-desktop="true"],
    html[data-native-desktop="true"] body[data-desktop-shell="true"] {
      --desktop-native-project-safe-inline-start: var(--desktop-window-safe-inline-start, 88px);
      --desktop-native-settings-safe-inline-start: var(--desktop-window-safe-inline-start, 88px);
    }
    body[data-desktop-shell="true"] .app {
      height: 100dvh;
      padding: 0;
      gap: 0;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      background: var(--page);
    }
    body[data-desktop-shell="true"] .topbar { display: none; }
    body[data-desktop-shell="true"] .mobile-switch { display: none; }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-column: 1;
      grid-row: 1;
      grid-template-columns: var(--tree-width, clamp(286px, 26vw, 334px)) 8px minmax(0, 1fr) !important;
      grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
      border: 0;
      border-radius: 0;
      background: var(--page);
      overflow: hidden;
    }

    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      min-width: 0;
      min-height: 0;
      padding: 0 8px;
      border: 0;
      grid-column: 1;
      grid-row: 1 / -1;
      grid-template-rows: auto minmax(0, 1fr) auto !important;
      color: var(--ink-soft);
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
      box-shadow: none;
      overflow: visible;
      z-index: 2;
    }
    body[data-desktop-shell="true"] .tree-resizer {
      width: 8px;
      border: 0;
      grid-column: 2;
      grid-row: 2 / -1;
      background: transparent;
      z-index: 3;
    }
    body[data-desktop-shell="true"] .tree-resizer::after {
      width: 8px;
      background: transparent;
    }
    body[data-desktop-shell="true"] .tree-resizer:hover::after,
    body[data-desktop-shell="true"] .tree-resizer.is-dragging::after {
      background: color-mix(in srgb, var(--blue) 18%, transparent);
    }

    body[data-desktop-shell="true"] .navigator-project {
      min-width: 0;
      min-height: var(--desktop-titlebar-height);
      padding: 0 4px 0 var(--desktop-project-safe-inline-start);
      border: 0;
      grid-row: 1;
      background: transparent;
      position: relative;
      z-index: 24;
    }
    body[data-desktop-shell="true"] .navigator-project-primary {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      display: grid;
      grid-template-columns: minmax(0, 178px) 28px 28px minmax(12px, 1fr);
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .navigator-project-menu {
      min-width: 0;
      position: relative;
    }
    body[data-desktop-shell="true"] .navigator-project-selector {
      min-width: 0;
      height: 30px;
      padding: 0 8px;
      border-radius: 8px;
      color: var(--ink-soft);
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr) 12px;
      align-items: center;
      gap: 8px;
      list-style: none;
      cursor: pointer;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .navigator-project-selector::-webkit-details-marker { display: none; }
    body[data-desktop-shell="true"] .navigator-project-selector:hover,
    body[data-desktop-shell="true"] .navigator-project-menu[open] > .navigator-project-selector {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-project-selector:focus-visible {
      outline: var(--focus-stroke);
      outline-offset: var(--focus-stroke-inset);
      box-shadow: none;
    }
    body[data-desktop-shell="true"] .navigator-project-selector > svg:first-child {
      width: 16px;
      height: 16px;
      color: var(--muted);
    }
    body[data-desktop-shell="true"] .navigator-project-selector > svg:last-child { width: 12px; height: 12px; color: var(--faint); transition: transform 130ms var(--ease-quint); }
    body[data-desktop-shell="true"] .navigator-project-menu[open] .navigator-project-selector > svg:last-child { transform: rotate(180deg); }
    body[data-desktop-shell="true"] .navigator-project-selector strong { min-width: 0; overflow: hidden; color: inherit; font-size: 12px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .navigator-project-menu-popover {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: min(310px, calc(100vw - 24px));
      padding: 8px;
      border: 0;
      border-radius: 12px;
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: var(--lift-3);
      z-index: 80;
    }
    body[data-desktop-shell="true"] .navigator-project-menu-popover > span {
      min-height: 24px;
      padding: 0 8px;
      color: var(--faint);
      display: flex;
      align-items: center;
      font-size: 11px;
      font-weight: 400;
    }
    body[data-desktop-shell="true"] .navigator-project-menu-popover nav { display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .navigator-project-option,
    body[data-desktop-shell="true"] .navigator-project-manage {
      min-width: 0;
      min-height: 34px;
      padding: 0 8px;
      border-radius: 8px;
      color: inherit;
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    body[data-desktop-shell="true"] .navigator-project-option { justify-content: space-between; }
    body[data-desktop-shell="true"] .navigator-project-option:hover,
    body[data-desktop-shell="true"] .navigator-project-option.is-current,
    body[data-desktop-shell="true"] .navigator-project-manage:hover { color: var(--ink); background: var(--nav-hover); }
    body[data-desktop-shell="true"] .navigator-project-option > span { min-width: 0; flex: 1 1 auto; display: flex; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .navigator-project-option strong { min-width: 0; overflow: hidden; font-size: 11px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .navigator-project-option svg,
    body[data-desktop-shell="true"] .navigator-project-manage svg { width: 14px; height: 14px; color: var(--muted); flex: 0 0 auto; }
    body[data-desktop-shell="true"] .navigator-project-option > svg { color: var(--blue-dark); }
    body[data-desktop-shell="true"] .navigator-project-manage { margin-top: 4px; color: var(--muted); font-size: 11px; }
    body[data-desktop-shell="true"] .navigator-project-settings {
      width: 28px;
      height: 28px;
      min-height: 28px;
      padding: 0;
      border-radius: 7px;
      color: var(--muted);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      place-items: center;
      gap: 0;
      text-decoration: none;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .navigator-project-settings:hover {
      color: var(--ink);
      background: var(--nav-hover);
    }
    body[data-desktop-shell="true"] .navigator-project-settings svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .desktop-titlebar-drag--left { min-width: 12px; width: auto; }

    body[data-desktop-shell="true"] .desktop-directory-panel {
      min-width: 0;
      min-height: 0;
      grid-row: 2;
      overflow: hidden;
    }
    body[data-desktop-shell="true"] .desktop-directory-panel[hidden] { display: none !important; }
    body[data-desktop-shell="true"] .desktop-directory-root,
    body[data-desktop-shell="true"] .desktop-directory-secondary {
      padding: 4px 4px 12px;
      overflow: auto;
      overscroll-behavior: contain;
    }
    body[data-desktop-shell="true"] .desktop-module-list { display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .desktop-module-item {
      width: 100%;
      min-width: 0;
      min-height: 40px;
      padding: 4px 8px;
      border: 0;
      border-radius: 8px;
      color: var(--ink-soft);
      background: transparent;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .desktop-module-item:hover {
      color: var(--ink);
      background: var(--nav-hover);
    }
    body[data-desktop-shell="true"] .desktop-module-item.is-current {
      color: var(--ink);
      background: var(--nav-active);
    }
    body[data-desktop-shell="true"] .desktop-module-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .desktop-module-item--inbox { color: var(--ink-soft); background: transparent; }
    body[data-desktop-shell="true"] .desktop-module-item--inbox.is-current { color: var(--ink); background: var(--nav-active); }
    body[data-desktop-shell="true"] .desktop-module-item > svg { width: 14px; height: 14px; color: var(--muted); }
    body[data-desktop-shell="true"] .desktop-module-item > svg:last-child { width: 12px; height: 12px; color: var(--faint); opacity: .66; }
    body[data-desktop-shell="true"] .desktop-module-item:hover > svg:last-child { opacity: 1; }
    body[data-desktop-shell="true"] .desktop-module-item > span { min-width: 0; display: grid; gap: 0; }
    body[data-desktop-shell="true"] .desktop-module-item strong,
    body[data-desktop-shell="true"] .desktop-module-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .desktop-module-item strong { color: inherit; font-size: 12px; font-weight: var(--weight-control, 500); }
    body[data-desktop-shell="true"] .desktop-module-item small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .desktop-module-item em {
      color: var(--muted);
      font-size: 11px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-module-item.is-planned { opacity: .62; cursor: default; }
    body[data-desktop-shell="true"] .desktop-module-item.is-planned:hover { background: transparent; }

    body[data-desktop-shell="true"] .desktop-directory-heading {
      min-height: 40px;
      padding: 4px 8px;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .desktop-directory-heading > button {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .desktop-directory-heading > button:hover { color: var(--ink); background: var(--nav-hover); }
    body[data-desktop-shell="true"] .desktop-directory-heading > button:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .desktop-directory-heading > button svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .desktop-directory-heading > span { min-width: 0; display: grid; gap: 0; }
    body[data-desktop-shell="true"] .desktop-directory-heading strong { font-size: 13px; font-weight: var(--weight-control, 500); }
    body[data-desktop-shell="true"] .desktop-directory-heading small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .desktop-directory-empty {
      margin: 8px 4px;
      padding: 24px 16px;
      border-radius: 14px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 56%, transparent);
      display: grid;
      justify-items: start;
      gap: 8px;
    }
    body[data-desktop-shell="true"] .desktop-directory-empty svg { width: 20px; height: 20px; stroke-width: 1.6; }
    body[data-desktop-shell="true"] .desktop-directory-empty strong { color: var(--ink-soft); font-size: 12px; }
    body[data-desktop-shell="true"] .desktop-directory-empty p { margin: 0; color: var(--faint); font-size: 11px; line-height: 1.5; }
    body[data-desktop-shell="true"] .desktop-directory-empty span { color: var(--blue-dark); font-size: 11px; font-weight: 400; }

    body[data-desktop-shell="true"] .desktop-goal-directory {
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      background: transparent;
    }
    body[data-desktop-shell="true"] .desktop-goal-directory:not([hidden]) { display: grid; }
    body[data-desktop-shell="true"] .desktop-goal-directory .desktop-directory-heading { grid-row: 1; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-chrome {
      min-height: 30px;
      padding: 0 8px 4px;
      border: 0;
      grid-row: 2;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      flex-wrap: wrap;
    }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-search { display: flex; flex: 1 0 100%; order: -1; }
    body[data-desktop-shell="true"] .navigator-view-switch {
      width: auto;
      padding: 4px;
      border: 0;
      border-radius: 9px;
      grid-template-columns: repeat(2, 28px);
      background: color-mix(in srgb, var(--paper) 54%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-view-switch button { width: 28px; min-height: 26px; padding: 0; }
    body[data-desktop-shell="true"] .navigator-view-switch button::after { display: none; }
    body[data-desktop-shell="true"] .navigator-view-switch button span { display: none; }
    body[data-desktop-shell="true"] .navigator-view-switch button.is-active {
      color: var(--blue-dark);
      background: color-mix(in srgb, var(--blue) 11%, var(--paper));
      box-shadow: none;
    }
    body[data-desktop-shell="true"] .tree-tools { min-width: 0; width: 100%; display: flex; justify-content: flex-start; gap: 4px; }
    body[data-desktop-shell="true"] .tree-create { height: 26px; min-height: 26px; }
    body[data-desktop-shell="true"] .tree-tool { width: 26px; height: 26px; min-height: 26px; padding: 0; border: 0; border-radius: 7px; justify-content: center; }
    body[data-desktop-shell="true"] .tree-tool:hover { color: var(--ink); background: var(--nav-hover); box-shadow: none; }
    body[data-desktop-shell="true"] .tree-tool span,
    body[data-desktop-shell="true"] .tree-tool small { display: none; }
    body[data-desktop-shell="true"] .tree-scroll {
      min-height: 0;
      padding: 4px 4px 12px;
      grid-row: 3;
    }
    body[data-desktop-shell="true"] .tree-row { min-height: 30px; border-radius: 7px; transition: background 130ms var(--ease-quint); }
    body[data-desktop-shell="true"] .tree-row:hover,
    body[data-desktop-shell="true"] .tree-row:has(.tree-node.is-selected) {
      background: var(--nav-active);
    }
    body[data-desktop-shell="true"] .tree-toggle,
    body[data-desktop-shell="true"] .tree-guide { width: 16px; height: 24px; flex-basis: 16px; }
    body[data-desktop-shell="true"] .tree-node { min-height: 28px; padding: 4px 8px; border-radius: 7px; }
    body[data-desktop-shell="true"] .tree-node:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .tree-node.is-selected { background: transparent; box-shadow: none; }
    body[data-desktop-shell="true"] .tree-copy strong { font-size: 12px; font-weight: var(--weight-control, 500); }
    body[data-desktop-shell="true"] .tree-node .goal-status { font-size: 11px; }
    body[data-desktop-shell="true"] .tree-footer {
      min-height: 28px;
      padding: 0 8px 4px;
      border: 0;
      grid-row: 4;
      color: var(--faint);
      background: transparent;
    }
    body[data-desktop-shell="true"] .tree-footer small { display: none; }

    body[data-desktop-shell="true"] .personal-sidebar-footer {
      min-height: 58px;
      margin: 0;
      padding: 4px 4px 8px;
      border: 0;
      grid-row: 3;
    }
    body[data-desktop-shell="true"] .personal-account {
      min-height: 46px;
      padding: 4px 8px;
      border-radius: 11px;
      grid-template-columns: 32px minmax(0, 1fr) 30px;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .personal-account:hover {
      color: var(--ink);
      background: var(--paper);
      box-shadow: var(--lift-1);
    }
    body[data-desktop-shell="true"] .personal-account-copy strong { font-size: 12px; }
    body[data-desktop-shell="true"] .personal-account-copy small { color: var(--faint); font-size: 11px; }

    body[data-desktop-shell="true"] .workspace > .workbench-header {
      min-width: 0;
      min-height: 48px;
      padding: 0 12px;
      border: 0;
      grid-column: 3;
      grid-row: 1;
      background: var(--page);
      display: block;
    }
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] > .workbench-header {
      display: block;
    }
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] > .goal-momentum {
      grid-column: 3;
      grid-row: 2;
    }
    body[data-desktop-shell="true"] .desktop-workbench-bar {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      display: grid;
      grid-template-columns: minmax(0, max-content) minmax(72px, 1fr);
      align-items: center;
      gap: 8px;
    }
    body[data-desktop-shell="true"] .desktop-titlebar-drag {
      min-width: 72px;
      width: auto;
      height: 100%;
      -webkit-app-region: drag;
      user-select: none;
    }
    body[data-desktop-shell="true"] .desktop-work-tabs {
      min-width: 0;
      max-width: min(56vw, 680px);
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    body[data-desktop-shell="true"] .desktop-work-tabs::-webkit-scrollbar { display: none; }
    body[data-desktop-shell="true"] .desktop-work-tab {
      flex: 0 0 clamp(136px, 12vw, 190px);
      min-width: 0;
      max-width: 245px;
      flex: 0 0 clamp(132px, 16vw, 190px);
      height: 34px;
      padding: 0 4px 0 0;
      border-radius: 10px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 46%, transparent);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-selected {
      color: var(--ink);
      background: var(--paper);
      box-shadow: var(--lift-1);
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tab {
      position: relative;
      border-radius: 7px;
      background: transparent;
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tabs { gap: 0; }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tab + .desktop-work-tab::before {
      content: "";
      position: absolute;
      top: 8px;
      bottom: 8px;
      left: 0;
      width: 1px;
      background: color-mix(in srgb, var(--line-strong) 70%, transparent);
      pointer-events: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tab:hover:not(.is-selected) {
      color: var(--ink-soft);
      background: var(--nav-hover);
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tab.is-selected {
      color: var(--ink);
      background: transparent;
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-work-tab.is-selected::after {
      content: "";
      position: absolute;
      left: 10px;
      bottom: 0;
      width: 28px;
      height: 2px;
      border-radius: 1px;
      background: var(--blue);
      pointer-events: none;
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-utility {
      flex-basis: auto;
      min-width: max-content;
      padding-right: 0;
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-utility > [role="tab"] {
      padding: 0 12px;
      display: flex;
      white-space: nowrap;
      cursor: default;
    }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] {
      min-width: 0;
      height: 34px;
      padding: 0 4px 0 12px;
      border: 0;
      color: inherit;
      background: transparent;
      display: grid;
      grid-template-columns: 7px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      text-align: left;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i[data-status="executing"],
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i[data-status="ready"] { background: var(--green); }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] span { overflow: hidden; font-size: 11px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .desktop-work-tab > button:last-child {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 7px;
      color: var(--faint);
      background: transparent;
      opacity: 0;
      cursor: pointer;
      transition: opacity 130ms var(--ease-quint), color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .desktop-work-tab:hover > button:last-child,
    body[data-desktop-shell="true"] .desktop-work-tab:focus-within > button:last-child { opacity: 1; }
    body[data-desktop-shell="true"] .desktop-work-tab > button:last-child:hover { color: var(--ink); background: var(--nav-hover); }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .navigator-project-settings,
    body[data-desktop-shell="true"] .desktop-work-tabs { -webkit-app-region: no-drag; }

    body[data-desktop-shell="true"] .document-pane {
      --focus-canvas-inset: 0px;
      min-width: 0;
      min-height: 0;
      padding: 0 12px 12px 4px;
      grid-column: 3;
      grid-row: 2;
      background: var(--page);
    }
    body[data-desktop-shell="true"] .desktop-work-surface {
      min-width: 0;
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .desktop-work-surface:has(> .goal-event-document) {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    body[data-desktop-shell="true"] .desktop-work-surface[hidden] { display: none !important; }
    body[data-desktop-shell="true"] .desktop-utility-surface {
      padding: clamp(28px, 5vw, 64px);
      background: var(--page);
      align-content: start;
    }
    body[data-desktop-shell="true"][data-native-desktop="true"] .navigator-project,
    html[data-native-desktop="true"] body[data-desktop-shell="true"] .navigator-project {
      padding: 0 !important;
    }
    body[data-desktop-shell="true"] .desktop-utility-surface:not([hidden]) { display: grid; gap: 32px; }
    body[data-desktop-shell="true"] .desktop-utility-heading {
      min-width: 0;
      max-width: 760px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      align-items: start;
      gap: 16px;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading > svg {
      width: 20px;
      height: 20px;
      margin-top: 4px;
      color: var(--muted); stroke-width: 1.6; }
    body[data-desktop-shell="true"] .desktop-utility-heading h1 {
      margin: 0;
      color: var(--ink);
      font-size: 24px;
      font-weight: var(--weight-title, 600);
      letter-spacing: -.025em;
      line-height: 1.15;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading p {
      margin: 8px 0 0;
      max-width: 64ch;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading > span {
      min-height: 24px;
      padding: 0 8px;
      border-radius: 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 400;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-utility-note {
      max-width: 760px;
      padding: 24px 24px;
      border-radius: 14px;
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
    body[data-desktop-shell="true"] .desktop-utility-note strong { color: var(--ink); font-size: 13px; }
    body[data-desktop-shell="true"] .desktop-utility-note p { margin: 8px 0 0; max-width: 68ch; color: var(--muted); font-size: 12px; line-height: 1.65; }
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .tui-resizer,
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .tui-pane { display: none !important; }
    body[data-desktop-shell="true"] .goal-document {
      width: 100%;
      min-height: 100%;
      gap: 12px;
      padding: 0 12px 32px;
      background: transparent;
    }
    body[data-desktop-shell="true"] .goal-hero,
    body[data-desktop-shell="true"] .goal-workspace-panels {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }
    body[data-desktop-shell="true"] .goal-hero { padding: 16px 8px 0; }
    body[data-desktop-shell="true"] .goal-header { padding: 0 4px 12px; }
    body[data-desktop-shell="true"] .goal-title-kicker { min-height: 26px; margin-bottom: 8px; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-kicker .goal-status {
      min-height: 26px;
      padding: 4px 8px;
      gap: 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 11px;
    }
    body[data-desktop-shell="true"] .goal-title-kicker .goal-status svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .goal-title-row h1 { max-width: 34ch; font-size: 24px; line-height: 1.18; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-brief-grid {
      margin: 8px 0 12px;
      border: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    body[data-desktop-shell="true"] .goal-brief-item,
    body[data-desktop-shell="true"] .goal-brief-item:first-child {
      min-height: 104px;
      padding: 12px 16px;
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
    body[data-desktop-shell="true"] .goal-brief-item h2 { margin-bottom: 8px; color: var(--ink); font-size: 11px; font-weight: var(--weight-title, 600); }
    body[data-desktop-shell="true"] .goal-brief-item p { color: var(--ink-soft); font-size: 11px; line-height: 1.55; -webkit-line-clamp: 4; }
    body[data-desktop-shell="true"] .goal-workspace-panels {
      min-height: max(420px, calc(100dvh - 340px));
      padding: 8px 8px 48px;
      display: grid;
      align-items: stretch;
    }
    body[data-desktop-shell="true"] .goal-focus-layout { gap: 12px; }
    body[data-desktop-shell="true"] .goal-focus-main { gap: 12px; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context,
    body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime {
      padding: 16px 16px;
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: var(--lift-1);
    }

    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] {
      grid-template-rows: 58px minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-tabs,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-chrome,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-terminal,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-menu {
      display: none !important;
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-stage {
      padding: 0 16px 16px;
      grid-template-areas: "guard";
      grid-template-rows: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-parent-guard {
      min-height: 100%;
      max-height: none;
      padding-top: 16px;
      border-bottom: 0;
      align-content: start;
    }

    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) {
      height: 100dvh;
      display: grid;
      grid-template-columns: clamp(286px, 310px, 334px) minmax(0, 1fr);
      grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
      background: var(--page);
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      min-height: var(--desktop-native-control-row-height);
      padding: 0 12px;
      border: 0;
      grid-column: 2;
      grid-row: 1;
      background: var(--page);
      display: flex;
      box-shadow: none;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .brand { display: none; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context {
      width: fit-content;
      max-width: min(62vw, 460px);
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: 10px;
      color: var(--ink);
      background: transparent;
      box-shadow: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context strong,
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context strong { color: var(--ink); font-size: 11px; font-weight: var(--weight-control, 500); }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context small { color: var(--faint); font-size: 11px; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action {
      width: 30px;
      height: 30px;
      min-height: 30px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action:hover { color: var(--ink); background: var(--paper); box-shadow: var(--lift-1); }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action span { display: none; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .settings-shell { display: contents; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-navigation {
      min-width: 0;
      min-height: 0;
      padding: 0 8px;
      border: 0;
      grid-column: 1;
      grid-row: 1 / -1;
      grid-template-rows: var(--desktop-titlebar-height) 50px minmax(0, 1fr) auto;
      gap: 0;
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
      box-shadow: none;
      display: grid;
      overflow: visible;
      z-index: 2;
    }
    body[data-desktop-shell="true"] .feed-directory {
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      background: transparent;
    }
    body[data-desktop-shell="true"] .feed-directory:not([hidden]) { display: grid; }
    body[data-desktop-shell="true"] .feed-directory-heading { grid-template-columns: 24px minmax(0, 1fr) 24px; }
    body[data-desktop-shell="true"] .feed-directory-tools {
      padding: 4px 8px 8px;
      display: grid;
      gap: 8px;
    }
    body[data-desktop-shell="true"] .feed-directory-search {
      min-width: 0;
      height: 30px;
      padding: 0 8px;
      border-radius: 8px;
      color: var(--faint);
      background: color-mix(in srgb, var(--paper) 64%, transparent);
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .feed-directory-search:focus-within { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .feed-directory-search svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-directory-search input { min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; color: var(--ink); background: transparent; font-size: 11px; }
    body[data-desktop-shell="true"] .feed-directory-toolbar {
      min-width: 0;
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 30px;
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .feed-filter-control { position: static; }
    body[data-desktop-shell="true"] .feed-filter-trigger {
      width: 30px;
      height: 30px;
      min-height: 30px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 64%, transparent);
      display: grid;
      place-items: center;
      position: relative;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .feed-filter-trigger:hover,
    body[data-desktop-shell="true"] .feed-filter-trigger.is-active { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
    body[data-desktop-shell="true"] .feed-filter-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .feed-filter-trigger > svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .feed-filter-trigger > span {
      min-width: 14px;
      height: 14px;
      padding: 0 4px;
      border-radius: 7px;
      color: var(--action-ink);
      background: var(--action);
      display: grid;
      place-items: center;
      position: absolute;
      top: -4px;
      right: -4px;
      font-size: 11px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      box-shadow: var(--lift-1);
    }
    body[data-desktop-shell="true"] .feed-filter-trigger > span[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-filter-panel {
      width: auto;
      max-height: min(480px, calc(100dvh - 150px));
      padding: 12px;
      border: 0;
      border-radius: 12px;
      color: var(--ink);
      background: var(--paper);
      box-shadow: var(--lift-3);
      position: absolute;
      z-index: 18;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      overflow: auto;
      overscroll-behavior: contain;
    }
    body[data-desktop-shell="true"] .feed-filter-panel[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-filter-panel > header { min-height: 28px; display: flex; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .feed-filter-panel > header strong { font-size: 12px; font-weight: var(--weight-control, 500); }
    body[data-desktop-shell="true"] .feed-filter-panel > header .mw-btn { margin-left: auto; }
    body[data-desktop-shell="true"] .feed-filter-section { padding-top: 8px; border-top: 1px solid var(--line); display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-filter-section + .feed-filter-section { margin-top: 8px; }
    body[data-desktop-shell="true"] .feed-filter-section > span { color: var(--faint); font-size: 11px; font-weight: 400; letter-spacing: .03em; }
    body[data-desktop-shell="true"] .feed-filter-options { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    body[data-desktop-shell="true"] .feed-filter-option {
      min-width: 0;
      min-height: 30px;
      padding: 0 8px;
      border: 0;
      border-radius: 7px;
      color: var(--muted);
      background: transparent;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 12px;
      align-items: center;
      gap: 4px;
      font: inherit;
      font-size: 11px;
      text-align: left;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .feed-filter-option:hover { color: var(--ink); background: var(--nav-hover); }
    body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); font-weight: 400; }
    body[data-desktop-shell="true"] .feed-filter-option:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .feed-filter-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-filter-option svg { width: 12px; height: 12px; opacity: 0; }
    body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] svg { opacity: 1; }
    body[data-desktop-shell="true"] .feed-filter-summary { margin: 8px 1px 0; padding-top: 8px; border-top: 1px solid var(--line); color: var(--faint); font-size: 11px; line-height: 1.45; }
    body[data-desktop-shell="true"] .feed-item-scroll { min-height: 0; padding: 1px 4px 8px; overflow-y: auto; }
    body[data-desktop-shell="true"] .feed-list-item {
      width: 100%;
      min-width: 0;
      padding: 8px 8px;
      border: 0;
      border-radius: 10px;
      color: var(--ink-soft);
      background: transparent;
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      text-align: left;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .feed-list-item:hover { background: var(--nav-hover); }
    body[data-desktop-shell="true"] .feed-list-item.is-selected { color: var(--ink); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); }
    body[data-desktop-shell="true"] .feed-list-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .feed-list-icon { width: 22px; height: 22px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--paper) 66%, transparent); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-list-icon svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-list-copy { min-width: 0; display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-list-copy > span { min-width: 0; display: flex; align-items: center; gap: 4px; }
    body[data-desktop-shell="true"] .feed-list-copy em { flex: 0 0 auto; color: var(--blue-dark); font-size: 11px; font-style: normal; font-weight: 400; letter-spacing: .02em; }
    body[data-desktop-shell="true"] .feed-list-copy small { min-width: 0; overflow: hidden; color: var(--faint); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-list-copy strong { overflow: hidden; font-size: 11px; font-weight: var(--weight-control, 500); line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-list-copy p { margin: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.4; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    body[data-desktop-shell="true"] .feed-list-copy time { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
    body[data-desktop-shell="true"] .feed-list-empty { margin: 8px 4px; padding: 24px 12px; border-radius: 12px; color: var(--faint); background: color-mix(in srgb, var(--paper) 48%, transparent); display: grid; justify-items: center; gap: 8px; text-align: center; }
    body[data-desktop-shell="true"] .feed-list-empty[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-list-empty svg { width: 20px; height: 20px; stroke-width: 1.6; }
    body[data-desktop-shell="true"] .feed-list-empty strong { color: var(--ink-soft); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-list-empty p { margin: 0; font-size: 11px; line-height: 1.45; }
    body[data-desktop-shell="true"] .feed-list-empty .mw-btn { justify-self: center; }
    body[data-desktop-shell="true"] .feed-directory-footer { min-height: 38px; padding: 4px 8px; border-top: 1px solid color-mix(in srgb, var(--line) 62%, transparent); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    body[data-desktop-shell="true"] .feed-directory-footer span { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .feed-directory-footer small { color: var(--faint); font-size: 11px; }

    body[data-desktop-shell="true"] .feed-workbench { width: 100%; background: var(--page); }
    body[data-desktop-shell="true"] .feed-workbench:not([hidden]) { display: block; }
    body[data-desktop-shell="true"] .feed-detail { width: min(100%, 980px); margin: 0 auto; padding: clamp(28px, 5vw, 72px) clamp(20px, 6vw, 76px) 80px; }
    body[data-desktop-shell="true"] .feed-detail-header { max-width: 74ch; }
    body[data-desktop-shell="true"] .feed-detail-kicker { margin-bottom: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .feed-detail-kicker span { padding: 4px 8px; border-radius: 999px; color: var(--muted); background: color-mix(in srgb, var(--rail) 64%, var(--paper)); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .feed-detail-kicker span:first-child { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); }
    body[data-desktop-shell="true"] .feed-detail-header h1 { margin: 0; max-width: 22ch; color: var(--ink); font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.04em; line-height: 1.05; }
    body[data-desktop-shell="true"] .feed-detail-header > p { margin: 16px 0 0; color: var(--muted); font-size: 13px; line-height: 1.68; }
    body[data-desktop-shell="true"] .feed-detail-meta { margin-top: 16px; color: var(--faint); display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 11px; }
    body[data-desktop-shell="true"] .feed-detail-meta span,
    body[data-desktop-shell="true"] .feed-detail-meta a,
    body[data-desktop-shell="true"] .feed-detail-meta .mw-btn { color: inherit; display: inline-flex; align-items: center; gap: 4px; }
    body[data-desktop-shell="true"] .feed-detail-meta .mw-btn { padding: 0; }
    body[data-desktop-shell="true"] .feed-detail-meta a:hover { color: var(--blue-dark); }
    body[data-desktop-shell="true"] .feed-detail-meta svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-detail-actions { margin-top: 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .feed-detail-actions button:not(.mw-btn), body[data-desktop-shell="true"] .feed-linked-goal { min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 62%, var(--paper)); display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 11px; font-weight: 400; text-decoration: none; cursor: pointer; }
    body[data-desktop-shell="true"] .feed-detail-actions button:not(.mw-btn):hover:not(:disabled), body[data-desktop-shell="true"] .feed-linked-goal:hover { transform: translateY(-1px); box-shadow: var(--lift-1); }
    body[data-desktop-shell="true"] .feed-detail-actions button:focus-visible, body[data-desktop-shell="true"] .feed-linked-goal:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
    body[data-desktop-shell="true"] .feed-detail-actions button:disabled { opacity: .52; cursor: default; }
    body[data-desktop-shell="true"] .feed-detail-actions .feed-action-subtle { color: var(--faint); background: transparent; }
    body[data-desktop-shell="true"] .feed-detail-actions svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-action-status { margin: 8px 0 0; color: var(--danger); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-detail-body { max-width: 74ch; margin-top: 48px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); }
    body[data-desktop-shell="true"] .feed-detail-body h2 { margin: 0 0 12px; color: var(--faint); font-size: 11px; font-weight: var(--weight-title, 600); letter-spacing: .08em; text-transform: uppercase; }
    body[data-desktop-shell="true"] .feed-detail-body > div { color: var(--ink-soft); font-size: 13px; line-height: 1.82; white-space: pre-wrap; }
    body[data-desktop-shell="true"] .feed-detail-tags { max-width: 74ch; margin-top: 16px; display: flex; flex-wrap: wrap; gap: 4px; }
    body[data-desktop-shell="true"] .feed-detail-tags span { padding: 4px 8px; border-radius: 999px; color: var(--muted); background: color-mix(in srgb, var(--rail) 58%, transparent); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-materials { max-width: 780px; margin-top: 48px; }
    body[data-desktop-shell="true"] .feed-materials > header { margin-bottom: 8px; display: flex; align-items: end; justify-content: space-between; gap: 16px; }
    body[data-desktop-shell="true"] .feed-materials > header span { color: var(--faint); font-size: 11px; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
    body[data-desktop-shell="true"] .feed-materials > header h2 { margin: 4px 0 0; color: var(--ink); font-size: 17px; font-weight: var(--weight-title, 600); }
    body[data-desktop-shell="true"] .feed-materials > header small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-materials ul { margin: 0; padding: 0; list-style: none; }
    body[data-desktop-shell="true"] .feed-materials li { padding: 12px 4px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: start; gap: 8px; }
    body[data-desktop-shell="true"] .feed-materials li > span { width: 22px; height: 22px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--rail) 62%, transparent); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-materials li svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-materials li div { min-width: 0; display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-materials li strong { color: var(--ink-soft); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-materials li small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-materials li p { margin: 4px 0 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.5; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
    body[data-desktop-shell="true"] .feed-material-content { margin-top: 8px; color: var(--muted); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-material-content summary { color: var(--blue-dark); cursor: pointer; }
    body[data-desktop-shell="true"] .feed-material-content > div { max-height: 320px; margin-top: 8px; padding: 12px; overflow: auto; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 54%, transparent); font-size: 11px; line-height: 1.7; white-space: pre-wrap; }
    body[data-desktop-shell="true"] .feed-material-unavailable { color: var(--danger) !important; }
    body[data-desktop-shell="true"] .feed-materials li > a { width: 26px; height: 26px; border-radius: 7px; color: var(--faint); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-materials li > a:hover { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 8%, transparent); }
    body[data-desktop-shell="true"] .feed-materials .feed-material-empty { grid-template-columns: 22px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .feed-detail-empty { min-height: 60vh; padding: 48px; color: var(--faint); display: grid; place-items: center; align-content: center; gap: 8px; text-align: center; }
    body[data-desktop-shell="true"] .feed-detail-empty[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-detail-empty svg { width: 20px; height: 20px; stroke-width: 1.6; }
    body[data-desktop-shell="true"] .feed-detail-empty h1 { margin: 0; color: var(--ink-soft); font-size: 17px; }
    body[data-desktop-shell="true"] .feed-detail-empty p { max-width: 46ch; margin: 0; font-size: 11px; line-height: 1.55; }

  }

    body[data-desktop-shell="true"] .feed-source-dialog { width: min(94vw, 820px); height: min(90vh, 860px); max-height: min(90vh, 860px); padding: 0; overflow: hidden; border: 0; border-radius: 18px; color: var(--ink); background: var(--paper); box-shadow: var(--lift-3); }
    body[data-desktop-shell="true"] .feed-source-dialog::backdrop { background: var(--scrim); }
    body[data-desktop-shell="true"] .feed-source-dialog-shell { height: 100%; max-height: min(90vh, 860px); display: grid; grid-template-rows: auto minmax(0, 1fr); }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header { padding: 24px 24px 16px; border-bottom: 1px solid color-mix(in srgb, var(--line) 66%, transparent); display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px; align-items: start; gap: 12px; }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header > span { width: 34px; height: 34px; border-radius: 10px; color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header svg { width: 16px; height: 16px; }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header h2 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header p { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
    body[data-desktop-shell="true"] .feed-source-dialog-shell > header .mw-btn { width: 30px; height: 30px; padding: 0; }
    body[data-desktop-shell="true"] .feed-source-dialog-scroll { min-height: 0; padding: 4px 24px 24px; overflow-y: auto; }
    body[data-desktop-shell="true"] .feed-source-section { padding: 24px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 62%, transparent); }
    body[data-desktop-shell="true"] .feed-source-section-title { margin-bottom: 12px; display: flex; align-items: end; justify-content: space-between; gap: 16px; }
    body[data-desktop-shell="true"] .feed-source-section-title h3 { margin: 0; color: var(--ink); font-size: 15px; }
    body[data-desktop-shell="true"] .feed-source-section-title small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-list { display: grid; gap: 8px; }
    body[data-desktop-shell="true"] .feed-source-row { min-width: 0; padding: 12px; border-radius: 11px; background: color-mix(in srgb, var(--rail) 54%, var(--paper)); display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: start; gap: 8px; }
    body[data-desktop-shell="true"] .feed-source-mark { width: 28px; height: 28px; border-radius: 8px; color: var(--muted); background: var(--paper); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-source-mark svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-source-row > div:nth-child(2) { min-width: 0; display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-source-row > div:nth-child(2) > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    body[data-desktop-shell="true"] .feed-source-row strong { font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-row em { padding: 4px 4px; border-radius: 999px; color: var(--muted); background: var(--paper); font-size: 11px; font-style: normal; }
    body[data-desktop-shell="true"] .feed-source-row p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
    body[data-desktop-shell="true"] .feed-source-row small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-actions, body[data-desktop-shell="true"] .feed-connector-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    body[data-desktop-shell="true"] .feed-source-dialog button:not(.mw-btn):not(.feed-source-choice):not(.mw-select-picker__trigger):not(.mw-menu__item) { min-height: 28px; padding: 0 8px; border: 0; border-radius: 7px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 72%, var(--paper)); font-size: 11px; font-weight: 400; cursor: pointer; }
    body[data-desktop-shell="true"] .feed-source-dialog button:not(.mw-btn):not(.feed-source-choice):not(.mw-select-picker__trigger):not(.mw-menu__item):hover:not(:disabled) { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); }
    body[data-desktop-shell="true"] .feed-source-dialog button:focus-visible, body[data-desktop-shell="true"] .feed-source-dialog summary:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
    body[data-desktop-shell="true"] .feed-source-dialog button:disabled { opacity: .45; cursor: default; }
    body[data-desktop-shell="true"] .feed-source-actions button:first-child svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-source-empty { margin: 0; padding: 16px; border-radius: 10px; color: var(--muted); background: color-mix(in srgb, var(--rail) 48%, transparent); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    body[data-desktop-shell="true"] .feed-source-form { min-width: 0; padding: 12px; border-radius: 10px; background: color-mix(in srgb, var(--rail) 48%, var(--paper)); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
    body[data-desktop-shell="true"] .feed-source-dialog label { min-width: 0; display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-source-dialog label > span { color: var(--faint); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .feed-source-dialog input, body[data-desktop-shell="true"] .feed-source-dialog select { width: 100%; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid color-mix(in srgb, var(--line) 78%, transparent); border-radius: 7px; outline: 0; color: var(--ink); background: var(--paper); font: inherit; font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-dialog input:focus, body[data-desktop-shell="true"] .feed-source-dialog select:focus { border-color: var(--ink); outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    body[data-desktop-shell="true"] .feed-connector-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card { min-width: 0; padding: 12px; border-radius: 12px; background: color-mix(in srgb, var(--rail) 52%, var(--paper)); display: grid; align-content: start; gap: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card strong { font-size: 12px; }
    body[data-desktop-shell="true"] .feed-connector-card em { color: var(--blue-dark); font-size: 11px; font-style: normal; }
    body[data-desktop-shell="true"] .feed-connector-card > p, body[data-desktop-shell="true"] .feed-connector-card details p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
    body[data-desktop-shell="true"] .feed-connector-card details { padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; gap: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card summary { color: var(--muted); font-size: 11px; cursor: pointer; }
    body[data-desktop-shell="true"] .feed-connector-card details[open] summary { margin-bottom: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card details label + label { margin-top: 8px; }
    body[data-desktop-shell="true"] .feed-connector-card details > button, body[data-desktop-shell="true"] .feed-connector-card details > .feed-connector-actions { margin-top: 8px; }
    body[data-desktop-shell="true"] .feed-source-progress, body[data-desktop-shell="true"] .feed-source-dialog .form-error { position: sticky; bottom: 0; margin: 0; padding: 8px 12px; border-radius: 8px; font-size: 11px; }
    body[data-desktop-shell="true"] .feed-source-progress { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); }
    body[data-desktop-shell="true"] .feed-source-dialog .form-error { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--paper)); }

    @media (max-width: 680px) {
      body[data-desktop-shell="true"] .feed-source-dialog { width: calc(100vw - 18px); height: calc(100dvh - 18px); max-height: calc(100dvh - 18px); }
      body[data-desktop-shell="true"] .feed-source-dialog-shell { max-height: calc(100dvh - 18px); }
      body[data-desktop-shell="true"] .feed-source-dialog-scroll { padding-inline: 16px; }
      body[data-desktop-shell="true"] .feed-source-dialog-shell > header { padding-inline: 16px; }
      body[data-desktop-shell="true"] .feed-source-form-grid, body[data-desktop-shell="true"] .feed-connector-grid { grid-template-columns: 1fr; }
      body[data-desktop-shell="true"] .feed-source-dialog button:not(.mw-btn):not(.feed-source-choice):not(.mw-select-picker__trigger):not(.mw-menu__item) { min-height: 36px; }
      body[data-desktop-shell="true"] .feed-source-row { grid-template-columns: 28px minmax(0, 1fr); }
      body[data-desktop-shell="true"] .feed-source-actions { grid-column: 2; }
    }

  @media (min-width: 761px) {

    body.settings-page[data-desktop-shell="true"] .settings-desktop-project {
      min-width: 0;
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding: 0 4px 0 var(--desktop-settings-safe-inline-start);
      grid-row: 1;
      display: grid;
      grid-template-columns: minmax(0, 178px) 28px minmax(12px, 1fr);
      grid-template-rows: var(--desktop-native-control-row-height);
      align-content: start;
      align-items: center;
      gap: 4px;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading {
      min-height: 50px;
      padding: 4px 8px 4px;
      grid-row: 2;
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a {
      width: 28px;
      min-height: 28px;
      padding: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a:hover { color: var(--ink); background: var(--paper); }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a svg { width: 14px; height: 14px; transform: rotate(180deg); }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > span { min-width: 0; display: grid; gap: 4px; }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading strong { font-size: 13px; font-weight: var(--weight-control, 500); }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading small { overflow: hidden; color: var(--faint); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    body.settings-page[data-desktop-shell="true"] .settings-nav-body { min-height: 0; padding: 4px; grid-row: 3; overflow-y: auto; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-label { display: none; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group { gap: 4px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group + .settings-nav-group { margin: 0; padding: 0; border: 0; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a {
      min-height: 52px;
      padding: 8px 8px;
      border-radius: 11px;
      color: var(--ink-soft);
      grid-template-columns: 20px minmax(0, 1fr);
      gap: 8px;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a:hover,
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a[aria-current="page"] {
      color: var(--ink);
      background: var(--paper);
      box-shadow: none;
    }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a > svg { width: 16px; height: 16px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a strong { font-size: 12px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a small { color: var(--faint); font-size: 11px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation > .personal-sidebar-footer { grid-row: 4; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-content {
      min-width: 0;
      min-height: 0;
      padding: 0 16px 24px 12px;
      grid-column: 2;
      grid-row: 2;
      overflow: hidden;
      overscroll-behavior: contain;
      background: var(--page);
    }
    body.settings-page[data-desktop-shell="true"] .settings-document,
    body.settings-page[data-desktop-shell="true"] .guidance-document,
    body.settings-page[data-desktop-shell="true"] .planning-catalog,
    body.settings-page[data-desktop-shell="true"] .planning-detail,
    body.settings-page[data-desktop-shell="true"] .planning-edit,
    body.settings-page[data-desktop-shell="true"] .work-planning {
      width: min(100%, 1060px);
      min-height: 0;
      margin: 0 auto;
      padding: 16px 16px 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: transparent;
    }
    body.settings-page[data-desktop-shell="true"] .settings-body { padding-bottom: 48px; }
    body.settings-page[data-desktop-shell="true"] .settings-heading { margin-bottom: 16px; padding: 0 4px; border: 0; }
    body.settings-page[data-desktop-shell="true"] .settings-heading h1 { font-size: 30px; letter-spacing: -.025em; }
    body.settings-page[data-desktop-shell="true"] .settings-heading p { max-width: 72ch; color: var(--muted); }
    body.settings-page[data-desktop-shell="true"] .appearance-settings { border: 0; display: grid; gap: 8px; }
    body.settings-page[data-desktop-shell="true"] .preference-section { padding: 16px 0; border: 0; }
    body.settings-page[data-desktop-shell="true"] .project-rules-intro li + li { border: 0; }
    body.settings-page[data-desktop-shell="true"] .project-rules-intro li {
      border: 0;
      border-radius: 10px;
      background: color-mix(in srgb, var(--rail) 70%, var(--paper));
    }
    body.settings-page[data-desktop-shell="true"] .settings-section,
    body.settings-page[data-desktop-shell="true"] .settings-action-section,
    body.settings-page[data-desktop-shell="true"] .diagnostics-summary,
    body.settings-page[data-desktop-shell="true"] .launcher-section,
    body.settings-page[data-desktop-shell="true"] .project-rules-intro,
    body.settings-page[data-desktop-shell="true"] .policy-form,
    body.settings-page[data-desktop-shell="true"] .planning-library-note,
    body.settings-page[data-desktop-shell="true"] .planning-composition-overview {
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
    body.settings-page[data-desktop-shell="true"][data-settings-section="diagnostics"] .diagnostics-summary,
    body.settings-page[data-desktop-shell="true"][data-settings-section="diagnostics"] .launcher-section {
      padding: 24px 24px;
    }
    body.settings-page[data-desktop-shell="true"][data-settings-section="diagnostics"] .diagnostics-summary + .launcher-section,
    body.settings-page[data-desktop-shell="true"][data-settings-section="diagnostics"] .launcher-section + .diagnostics-summary {
      margin-top: 12px;
    }
    body.settings-page[data-desktop-shell="true"][data-settings-section="diagnostics"] .diagnostics-summary > div:first-child p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.55;
    }
  }

  @media (min-width: 761px) and (max-width: 1180px) {
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: var(--tree-width, clamp(274px, 27vw, 300px)) 7px minmax(0, 1fr) !important;
    }
    body[data-desktop-shell="true"] .desktop-work-tab { max-width: 190px; }
    body[data-desktop-shell="true"] .goal-brief-grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
    body[data-desktop-shell="true"] .goal-brief-item--outcome { grid-column: 1 / -1; min-height: 82px; }
  }

  @media (max-width: 760px) {
    body:not([data-desktop-shell="true"]) .topbar .brand { flex: 0 0 auto; padding-right: 8px; }
    body:not([data-desktop-shell="true"]) .topbar .brand strong { display: none; }
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .navigator-project,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .personal-sidebar-footer,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-directory-secondary,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .desktop-directory-heading,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .feed-directory .desktop-directory-heading { display: none !important; }
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-directory-root,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory,
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .feed-directory { display: none !important; }
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .tree-pane[data-desktop-directory="root"] .desktop-directory-root {
      grid-row: 1;
      display: block !important;
      padding: 12px 8px 16px;
    }
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .tree-pane[data-desktop-directory="goals"] .desktop-goal-directory {
      min-height: 0;
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) 42px;
    }
    body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .tree-pane[data-desktop-directory="feed"] .feed-directory {
      min-height: 0;
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) 42px;
    }
    body[data-desktop-shell="true"] .desktop-module-list { display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .desktop-module-item {
      width: 100%;
      min-width: 0;
      min-height: 48px;
      padding: 4px 12px;
      border: 0;
      border-radius: 9px;
      color: var(--ink-soft);
      background: transparent;
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      text-align: left;
    }
    body[data-desktop-shell="true"] .desktop-module-item:hover,
    body[data-desktop-shell="true"] .desktop-module-item.is-current {
      color: var(--ink);
      background: var(--nav-active);
    }
    body[data-desktop-shell="true"] .desktop-module-item > svg { width: 16px; height: 16px; color: var(--muted); }
    body[data-desktop-shell="true"] .desktop-module-item > span { min-width: 0; display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .desktop-module-item strong,
    body[data-desktop-shell="true"] .desktop-module-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .desktop-module-item strong { color: inherit; font-size: 12px; font-weight: var(--weight-control, 500); }
    body[data-desktop-shell="true"] .desktop-module-item small,
    body[data-desktop-shell="true"] .desktop-module-item em { color: var(--faint); font-size: 11px; font-style: normal; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-chrome { grid-row: 1; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-scroll { grid-row: 2; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-footer { grid-row: 3; }
    body[data-desktop-shell="true"] .feed-directory .feed-directory-tools { grid-row: 1; padding-top: 8px; }
    body[data-desktop-shell="true"] .feed-directory .feed-item-scroll { grid-row: 2; }
    body[data-desktop-shell="true"] .feed-directory .feed-directory-footer { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: minmax(0, 1fr) !important; }
    body[data-desktop-shell="true"] .feed-directory-tools { min-width: 0; padding: 8px 8px; display: grid; gap: 8px; }
    body[data-desktop-shell="true"] .feed-directory-search { height: 34px; padding: 0 8px; border-radius: 9px; color: var(--faint); background: var(--paper); display: grid; grid-template-columns: 15px minmax(0, 1fr); align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .feed-directory-search svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .mobile-switch button {
      min-width: 0;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .mobile-switch button svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .feed-directory-search input { min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; color: var(--ink); background: transparent; font-size: 11px; }
    body[data-desktop-shell="true"] .feed-item-scroll { min-height: 0; padding: 4px 8px 12px; overflow-y: auto; }
    body[data-desktop-shell="true"] .feed-list-item { width: 100%; min-width: 0; padding: 8px 8px; border: 0; border-radius: 10px; color: var(--ink-soft); background: transparent !important; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: start; gap: 8px; text-align: left; }
    body[data-desktop-shell="true"] .feed-list-item.is-selected { color: var(--ink); background: color-mix(in srgb, var(--blue) 12%, var(--paper)) !important; }
    body[data-desktop-shell="true"] .feed-list-icon { width: 24px; height: 24px; border-radius: 8px; color: var(--muted); background: var(--paper); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .feed-list-icon svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .feed-list-copy { min-width: 0; display: grid; gap: 4px; }
    body[data-desktop-shell="true"] .feed-list-copy > span { min-width: 0; display: flex; gap: 4px; }
    body[data-desktop-shell="true"] .feed-list-copy em { color: var(--blue-dark); font-size: 11px; font-style: normal; font-weight: 400; }
    body[data-desktop-shell="true"] .feed-list-copy small { min-width: 0; overflow: hidden; color: var(--faint); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-list-copy strong { overflow: hidden; font-size: 11px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-list-copy p { margin: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.42; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    body[data-desktop-shell="true"] .feed-list-copy time { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-directory-footer { min-height: 42px; padding: 8px 12px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    body[data-desktop-shell="true"] .feed-directory-footer span, body[data-desktop-shell="true"] .feed-directory-footer small { color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-workbench:not([hidden]) { display: block; }
    body[data-desktop-shell="true"] .feed-detail { width: 100%; margin: 0; padding: 24px 16px 60px; }
    body[data-desktop-shell="true"] .feed-detail-kicker, body[data-desktop-shell="true"] .feed-detail-meta, body[data-desktop-shell="true"] .feed-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    body[data-desktop-shell="true"] .feed-detail-kicker span { padding: 4px 8px; border-radius: 999px; color: var(--muted); background: var(--paper); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-detail-header h1 { font-size: 20px; }
    body[data-desktop-shell="true"] .feed-detail-header > p, body[data-desktop-shell="true"] .feed-detail-body > div { color: var(--muted); font-size: 13px; line-height: 1.7; }
    body[data-desktop-shell="true"] .feed-detail-meta { margin-top: 16px; color: var(--faint); font-size: 11px; }
    body[data-desktop-shell="true"] .feed-detail-actions { margin-top: 24px; }
    body[data-desktop-shell="true"] .feed-detail-actions { align-items: stretch; }
    body[data-desktop-shell="true"] .feed-detail-actions button:not(.mw-btn), body[data-desktop-shell="true"] .feed-linked-goal { min-height: 34px; padding: 0 12px; border: 0; border-radius: 8px; color: var(--ink-soft); background: var(--paper); display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 1 1 44%; font-size: 11px; text-decoration: none; }
    body[data-desktop-shell="true"] .feed-detail-body, body[data-desktop-shell="true"] .feed-materials { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--line); }
    body[data-desktop-shell="true"] .feed-detail-body > div { white-space: pre-wrap; }
    body[data-desktop-shell="true"] .feed-materials ul { padding: 0; list-style: none; }
    body[data-desktop-shell="true"] .feed-materials li { padding: 12px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    body[data-desktop-shell="true"] .feed-materials li > span { display: none; }
    body[data-desktop-shell="true"] .feed-materials li p { color: var(--muted); font-size: 11px; line-height: 1.5; }
  }

`;
