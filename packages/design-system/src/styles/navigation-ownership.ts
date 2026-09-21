/** AP3 visual layer: navigation-ownership. */
export const NAVIGATION_OWNERSHIP_STYLES = `  /* Navigation ownership correction: directory controls its own rail, while
     Focus and Runtime stay with the selected Goal. */
  .mobile-project-bar { display: none; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .navigator-directory-toggle,
    body[data-desktop-shell="true"] .tui-focus-return {
      border: 0;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 8px;
      display: grid;
      place-items: center;
      -webkit-app-region: no-drag;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle:hover {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle:focus-visible,
    body[data-desktop-shell="true"] .goal-mode-switch button:focus-visible,
    body[data-desktop-shell="true"] .tui-focus-return:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: -2px;
      box-shadow: none;
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle svg { width: 14px; height: 14px; }

    body[data-desktop-shell="true"] .workspace.is-directory-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-directory-collapsed,
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: 0 0 minmax(0, 1fr) !important;
      position: relative;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed > .tree-pane {
      width: max(44px, calc(var(--desktop-project-safe-inline-start) + 44px));
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding-inline: 6px;
      background: transparent;
      overflow: visible;
      position: absolute;
      inset: 0 auto auto 0;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed > .workbench-header {
      padding-inline-start: max(54px, calc(var(--desktop-project-safe-inline-start) + 50px));
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed > .tree-pane > :not(.navigator-project) {
      display: none !important;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed > .tree-resizer {
      width: 0;
      display: none;
      pointer-events: none;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project {
      min-width: 32px;
      padding: 0 0 0 var(--desktop-project-safe-inline-start);
      display: block !important;
    }
    body[data-desktop-shell="true"][data-native-desktop="true"] .workspace.is-directory-collapsed .navigator-project,
    html[data-native-desktop="true"] body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project {
      padding: 0 0 0 var(--desktop-project-safe-inline-start);
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project-primary {
      grid-template-columns: 32px;
      justify-content: start;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project-menu,
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project-settings,
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .desktop-titlebar-drag--left {
      display: none;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-directory-toggle {
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: 0 3px 10px color-mix(in srgb, var(--shadow-color) 30%, transparent);
    }

    body[data-desktop-shell="true"] .goal-mode-switch {
      min-height: 30px;
      padding: 2px;
      border-radius: 9px;
      background: color-mix(in srgb, var(--rail) 76%, transparent);
      display: inline-flex;
      align-items: center;
      gap: 1px;
    }
    body[data-desktop-shell="true"] .goal-mode-switch button {
      min-height: 26px;
      padding: 0 8px;
      border: 0;
      border-radius: 7px;
      color: var(--muted);
      background: transparent;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 9.5px;
      font-weight: 400;
      cursor: pointer;
      transition: color .14s ease, background .14s ease, box-shadow .14s ease;
    }
    body[data-desktop-shell="true"] .goal-mode-switch button:hover { color: var(--ink); }
    body[data-desktop-shell="true"] .goal-mode-switch button.is-active {
      color: var(--ink);
      background: var(--paper);
      box-shadow: 0 2px 7px color-mix(in srgb, var(--shadow-color) 28%, transparent);
    }
    body[data-desktop-shell="true"] .goal-mode-switch button svg { width: 12px; height: 12px; }

    /* Light location states stay embedded in their rail. Paper and elevation
       remain reserved for content surfaces and overlays. */
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-goal-directory .tree-entry.is-selected,
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .feed-list-item.is-selected {
      background: color-mix(in srgb, var(--blue) 8%, transparent) !important;
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .goal-mode-switch button.is-active {
      background: color-mix(in srgb, var(--blue) 10%, transparent);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a[aria-current="page"] {
      background: color-mix(in srgb, var(--ink) 8%, transparent);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .navigator-project-settings[aria-current="page"],
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-directory-toggle {
      background: color-mix(in srgb, var(--ink) 7%, transparent);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .personal-account:hover,
    html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-navigation > .personal-sidebar-footer .personal-account[aria-current="page"],
    html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action:hover,
    html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a:hover,
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .tui-focus-return:hover {
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .personal-account:hover .personal-account-settings {
      background: transparent;
    }

    body[data-desktop-shell="true"] .tui-owner {
      padding-inline: 18px;
    }
    body[data-desktop-shell="true"] .tui-owner-actions > .goal-status {
      min-height: 28px;
      padding: 2px 9px;
      border-radius: 8px;
    }
    body[data-desktop-shell="true"] .tui-focus-return {
      min-height: 28px;
      padding: 0 9px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      position: static;
      font-size: 9.5px;
      font-weight: 400;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .tui-focus-return:hover { color: var(--ink); background: var(--paper); }
    body[data-desktop-shell="true"] .tui-focus-return svg { width: 12px; height: 12px; }
  }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-mode-switch,
    body[data-desktop-shell="true"] .tui-focus-return { display: none !important; }

    body[data-desktop-shell="true"] .feed-directory-tools { padding: 8px 10px; }
    body[data-desktop-shell="true"] .feed-directory-toolbar {
      min-width: 0;
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: center;
      gap: 6px;
    }
    body[data-desktop-shell="true"] .feed-directory-search,
    body[data-desktop-shell="true"] .feed-filter-trigger { height: 44px; min-height: 44px; border-radius: 10px; }
    body[data-desktop-shell="true"] .feed-directory-search { padding-inline: 12px; }
    body[data-desktop-shell="true"] .feed-directory-search input { font-size: 13px; }
    body[data-desktop-shell="true"] .feed-filter-control { position: static; }
    body[data-desktop-shell="true"] .feed-filter-trigger {
      width: 44px;
      padding: 0;
      border: 0;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 64%, transparent);
      display: grid;
      place-items: center;
      position: relative;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .feed-filter-trigger:hover,
    body[data-desktop-shell="true"] .feed-filter-trigger.is-active { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
    body[data-desktop-shell="true"] .feed-filter-trigger:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; box-shadow: none; }
    body[data-desktop-shell="true"] .feed-filter-trigger > svg { width: 16px; height: 16px; }
    body[data-desktop-shell="true"] .feed-filter-trigger > span {
      min-width: 16px;
      height: 16px;
      padding: 0 3px;
      border-radius: 8px;
      color: var(--action-ink);
      background: var(--action);
      display: grid;
      place-items: center;
      position: absolute;
      top: -4px;
      right: -4px;
      font-size: 8px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      box-shadow: 0 2px 6px color-mix(in srgb, var(--shadow-color) 34%, transparent);
    }
    body[data-desktop-shell="true"] .feed-filter-trigger > span[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-filter-panel {
      width: auto;
      max-height: calc(100dvh - 126px);
      padding: 12px;
      border: 0;
      border-radius: 12px;
      color: var(--ink);
      background: var(--paper);
      box-shadow: 0 12px 30px color-mix(in srgb, var(--shadow-color) 56%, transparent);
      position: absolute;
      z-index: 18;
      top: calc(100% + 7px);
      left: 0;
      right: 0;
      overflow: auto;
      overscroll-behavior: contain;
    }
    body[data-desktop-shell="true"] .feed-filter-panel[hidden] { display: none; }
    body[data-desktop-shell="true"] .feed-filter-panel > header { min-height: 44px; display: flex; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .feed-filter-panel > header strong { font-size: 13px; font-weight: 400; }
    body[data-desktop-shell="true"] .feed-filter-panel > header .mw-btn { margin-left: auto; }
    body[data-desktop-shell="true"] .feed-filter-section { padding-top: 8px; border-top: 1px solid var(--line); display: grid; gap: 5px; }
    body[data-desktop-shell="true"] .feed-filter-section + .feed-filter-section { margin-top: 8px; }
    body[data-desktop-shell="true"] .feed-filter-section > span { color: var(--faint); font-size: 10.5px; font-weight: 400; letter-spacing: .03em; }
    body[data-desktop-shell="true"] .feed-filter-options { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
    body[data-desktop-shell="true"] .feed-filter-option {
      min-width: 0;
      min-height: 44px;
      padding: 0 9px;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 12px;
      align-items: center;
      gap: 5px;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .feed-filter-option:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); font-weight: 400; }
    body[data-desktop-shell="true"] .feed-filter-option:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; box-shadow: none; }
    body[data-desktop-shell="true"] .feed-filter-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .feed-filter-option svg { width: 11px; height: 11px; opacity: 0; }
    body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] svg { opacity: 1; }
    body[data-desktop-shell="true"] .feed-filter-summary { margin: 8px 1px 0; padding-top: 8px; border-top: 1px solid var(--line); color: var(--faint); font-size: 10.5px; line-height: 1.45; }

    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .app:has(> .mobile-project-bar) {
      grid-template-rows: 48px 44px minmax(0, 1fr);
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-bar {
      min-width: 0;
      height: 48px;
      padding: 7px 10px 5px;
      border-bottom: 1px solid var(--line);
      grid-column: 1;
      grid-row: 1;
      background: var(--rail);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 34px;
      align-items: center;
      gap: 5px;
      position: relative;
      overflow: visible;
      z-index: 80;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher {
      min-width: 0;
      position: relative;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher > .navigator-project-selector {
      width: 100%;
      height: 34px;
      padding: 0 9px;
      border-radius: 9px;
      color: var(--ink-soft);
      background: color-mix(in srgb, var(--paper) 72%, transparent);
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr) 12px;
      align-items: center;
      gap: 7px;
      list-style: none;
      cursor: pointer;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher > .navigator-project-selector::-webkit-details-marker { display: none; }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher > .navigator-project-selector strong {
      overflow: hidden;
      font-size: 11.5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-menu-popover {
      width: min(310px, calc(100vw - 20px));
      max-height: min(70vh, 540px);
      padding: 7px;
      border: 0;
      border-radius: 12px;
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: 0 14px 34px color-mix(in srgb, var(--shadow-color) 62%, transparent);
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      overflow-y: auto;
      z-index: 120;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-menu-popover > span {
      min-height: 24px;
      padding: 0 8px;
      color: var(--faint);
      display: flex;
      align-items: center;
      font-size: 9px;
      font-weight: 400;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-menu-popover nav {
      display: grid;
      gap: 1px;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option,
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-manage {
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
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option { justify-content: space-between; }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option:hover,
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option.is-current,
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-manage:hover {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option > span {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option strong {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option svg,
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-manage svg {
      width: 13px;
      height: 13px;
      color: var(--muted);
      flex: 0 0 auto;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-option > svg { color: var(--blue-dark); }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-switcher .navigator-project-manage {
      margin-top: 4px;
      color: var(--muted);
      font-size: 10.5px;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-settings {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 72%, transparent);
      display: grid;
      place-items: center;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-project-settings svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .mobile-switch { grid-row: 2; }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .workspace { grid-row: 3; }
  }

  @media (max-width: 680px) {
    body[data-desktop-shell="true"] .feed-source-row {
      grid-template-columns: 22px minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .feed-source-side {
      grid-column: 2;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      justify-items: start;
    }
  }

  @media (max-width: 900px) {
    body[data-desktop-shell="true"] .feed-decision-work .decision-guidance,
    body[data-desktop-shell="true"] .feed-decision-work .review-context,
    body[data-desktop-shell="true"] .feed-decision-work .risk-decision-choice {
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .feed-decision-work .decision-guidance > section {
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
    body[data-desktop-shell="true"] .feed-decision-work .decision-guidance > section:last-child { border-bottom: 0; }
    body[data-desktop-shell="true"] .feed-decision-work .decision-scenario dl > div,
    body[data-desktop-shell="true"] .feed-decision-work .risk-decision-details > div,
    body[data-desktop-shell="true"] .feed-decision-work .decision-reason {
      grid-template-columns: minmax(0, 1fr);
      gap: 3px;
    }
    body[data-desktop-shell="true"] .feed-decision-work .decision-receipt { grid-template-columns: minmax(0, 1fr); }
  }

`;

