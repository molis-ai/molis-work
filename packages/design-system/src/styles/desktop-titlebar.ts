/** AP3 visual layer: desktop-titlebar. */
export const DESKTOP_TITLEBAR_STYLES = `  /* One Codex-style desktop titlebar contract. The native controls and work
     tabs live on row one; project selection gets the full second row. */
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] {
      --desktop-project-header-height: calc(var(--desktop-titlebar-height) * 2);
    }
    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      padding-top: 0 !important;
      box-sizing: border-box;
    }
    body[data-desktop-shell="true"] .navigator-project {
      height: var(--desktop-project-header-height);
      min-height: var(--desktop-project-header-height);
      padding: 0 !important;
      margin: 0;
      box-sizing: border-box;
      display: grid;
      grid-template-rows: var(--desktop-titlebar-height) var(--desktop-titlebar-height);
      align-content: start;
      gap: 0;
    }
    body[data-desktop-shell="true"] .navigator-native-row {
      min-width: 0;
      height: var(--desktop-titlebar-height);
      padding: 0 8px 0 var(--desktop-project-safe-inline-start);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .navigator-project-primary {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      margin: 0;
      padding: 0 8px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent);
      grid-template-columns: minmax(0, 1fr) var(--desktop-titlebar-control-height) var(--desktop-titlebar-control-height);
      align-items: center;
      gap: 4px;
    }
    body[data-desktop-shell="true"] .navigator-project-menu {
      width: 100%;
    }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .navigator-project-settings,
    body[data-desktop-shell="true"] .navigator-project-notifications,
    body[data-desktop-shell="true"] .navigator-directory-toggle {
      height: var(--desktop-titlebar-control-height);
      min-height: var(--desktop-titlebar-control-height);
      align-self: center;
    }
    body[data-desktop-shell="true"] .navigator-project-settings,
    body[data-desktop-shell="true"] .navigator-project-notifications,
    body[data-desktop-shell="true"] .navigator-directory-toggle {
      width: var(--desktop-titlebar-control-height);
    }
    body[data-desktop-shell="true"] .navigator-project-notifications {
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
      opacity: .72;
      cursor: default;
      -webkit-app-region: no-drag;
    }
    body[data-desktop-shell="true"] .navigator-project-notifications svg {
      width: 15px;
      height: 15px;
    }
    body[data-desktop-shell="true"] .workspace > .workbench-header,
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] > .workbench-header {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding-block: 0;
      display: flex;
      align-items: center;
    }
    body[data-desktop-shell="true"] .desktop-workbench-bar {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      align-items: center;
    }
    body[data-desktop-shell="true"] .desktop-work-tabs,
    body[data-desktop-shell="true"] .desktop-work-tab,
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] {
      height: var(--desktop-titlebar-control-height);
      min-height: var(--desktop-titlebar-control-height);
      align-self: center;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-project {
      height: var(--desktop-project-header-height);
      min-height: var(--desktop-project-header-height);
      padding: 0 !important;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: var(--desktop-titlebar-height) var(--desktop-titlebar-height);
      align-content: start;
      gap: 0;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-project .navigator-native-row {
      padding-inline-start: var(--desktop-settings-safe-inline-start);
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-navigation {
      grid-template-rows: var(--desktop-project-header-height) 50px minmax(0, 1fr) auto;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding-block: 0;
      align-items: center;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context,
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action {
      height: var(--desktop-titlebar-control-height);
      min-height: var(--desktop-titlebar-control-height);
      align-self: center;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed > .tree-pane {
      padding-inline: 0;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      grid-template-rows: var(--desktop-titlebar-height);
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-project-primary {
      display: none !important;
    }
    body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-native-row .desktop-titlebar-drag--left {
      display: block !important;
    }
    body[data-desktop-shell="true"][data-native-desktop="true"] .navigator-native-row,
    html[data-native-desktop="true"] body[data-desktop-shell="true"] .navigator-native-row,
    body[data-desktop-shell="true"][data-native-desktop="true"] .desktop-workbench-bar,
    html[data-native-desktop="true"] body[data-desktop-shell="true"] .desktop-workbench-bar {
      transform: translateY(-2px);
    }
    body.settings-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar,
    html[data-native-desktop="true"] body.settings-page[data-desktop-shell="true"] > .topbar,
    body.project-index-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar,
    html[data-native-desktop="true"] body.project-index-page[data-desktop-shell="true"] > .topbar {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
    }
    body.project-index-page[data-desktop-shell="true"][data-native-desktop="true"] > .project-index,
    html[data-native-desktop="true"] body.project-index-page[data-desktop-shell="true"] > .project-index {
      min-height: 0;
      overflow: hidden;
      overscroll-behavior: contain;
    }
    body.settings-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar > *,
    html[data-native-desktop="true"] body.settings-page[data-desktop-shell="true"] > .topbar > *,
    body.project-index-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar > *,
    html[data-native-desktop="true"] body.project-index-page[data-desktop-shell="true"] > .topbar > * {
      transform: translateY(-2px);
    }
  }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .feed-workbench { padding: 12px 12px 36px; }
    body[data-desktop-shell="true"] .feed-detail,
    body[data-desktop-shell="true"] .feed-detail-empty { width: 100%; margin: 0; border-radius: 12px; }
    body[data-desktop-shell="true"] .feed-detail { padding: 22px 16px 28px; }
    body[data-desktop-shell="true"] .feed-detail-empty { min-height: 58vh; padding: 28px 18px; }
    body[data-desktop-shell="true"] .feed-detail-header h1 { font-size: clamp(24px, 8vw, 34px); }
    body[data-desktop-shell="true"] .feed-detail-actions button,
    body[data-desktop-shell="true"] .feed-linked-goal { min-height: 44px; }
    body[data-desktop-shell="true"] .feed-detail-body,
    body[data-desktop-shell="true"] .feed-materials { margin-top: 28px; padding-top: 19px; }
    body[data-desktop-shell="true"] .feed-detail-body > .feed-rich-content { font-size: 13px; line-height: 1.72; }
    body[data-desktop-shell="true"] .feed-rich-content h1 { font-size: 20px; }
    body[data-desktop-shell="true"] .feed-rich-content h2 { font-size: 17px; }
    body[data-desktop-shell="true"] .feed-rich-content h3 { font-size: 15px; }
    body[data-desktop-shell="true"] .feed-rich-content pre { margin-inline: -4px; padding: 12px; border-radius: 8px; }
    body[data-desktop-shell="true"] .source-directory .desktop-directory-heading { display: none !important; }
    body[data-desktop-shell="true"] .source-directory { display: none !important; }
    body[data-desktop-shell="true"] .tree-pane[data-desktop-directory="sources"] .source-directory {
      min-height: 0;
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) 42px;
    }
    body[data-desktop-shell="true"] .source-directory-tools { grid-row: 1; padding: 8px 10px; }
    body[data-desktop-shell="true"] .source-mobile-add {
      min-height: 40px;
      padding: 0 12px;
      border: 0;
      border-radius: 10px;
      color: var(--action-ink);
      background: var(--action);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      font-size: 11px;
      font-weight: 400;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .source-mobile-add svg { width: 13px; height: 13px; }
    body[data-desktop-shell="true"] .source-mobile-add:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    body[data-desktop-shell="true"] .source-list { grid-row: 2; padding: 2px 6px 10px; }
    body[data-desktop-shell="true"] .source-directory .feed-directory-footer { grid-row: 3; }
    body[data-desktop-shell="true"] .source-filter-row { gap: 4px; }
    body[data-desktop-shell="true"] .source-filter-row button { min-height: 40px; border-radius: 9px; font-size: 10px; }
    body[data-desktop-shell="true"] .source-list-item { min-height: 82px; padding: 10px 8px; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 9px; }
    body[data-desktop-shell="true"] .source-list-icon { width: 26px; height: 26px; border-radius: 8px; }
    body[data-desktop-shell="true"] .source-list-icon svg { width: 13px; height: 13px; }
    body[data-desktop-shell="true"] .source-list-copy strong { font-size: 12px; }
    body[data-desktop-shell="true"] .source-list-copy p,
    body[data-desktop-shell="true"] .source-list-copy small { font-size: 9px; }
    body[data-desktop-shell="true"] .source-detail { width: 100%; margin: 0; padding: 16px 12px 56px; }
    body[data-desktop-shell="true"] .source-detail-header { padding: 8px 6px 18px; align-items: stretch; flex-direction: column; gap: 14px; }
    body[data-desktop-shell="true"] .source-detail-identity { grid-template-columns: 38px minmax(0, 1fr); gap: 11px; }
    body[data-desktop-shell="true"] .source-detail-mark { width: 38px; height: 38px; border-radius: 11px; }
    body[data-desktop-shell="true"] .source-detail-header h1 { font-size: 25px; }
    body[data-desktop-shell="true"] .source-detail-health { width: fit-content; margin-left: 49px; padding: 6px 8px; justify-items: start; }
    body[data-desktop-shell="true"] .source-detail-tabs { width: calc(100% - 12px); max-width: none; margin: 0 6px 8px; gap: 2px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
    body[data-desktop-shell="true"] .source-detail-tabs::-webkit-scrollbar { display: none; }
    body[data-desktop-shell="true"] .source-detail-tabs button { min-width: max-content; min-height: 44px; padding-inline: 10px; font-size: 10px; }
    body[data-desktop-shell="true"] .source-detail-panel { min-height: 0; padding: 20px 16px 24px; border-radius: 12px; }
    body[data-desktop-shell="true"] .source-panel-heading { margin-bottom: 12px; }
    body[data-desktop-shell="true"] .source-overview-ledger { grid-template-columns: minmax(0, 1fr); column-gap: 0; }
    body[data-desktop-shell="true"] .source-overview-ledger > div:nth-child(3n+2),
    body[data-desktop-shell="true"] .source-overview-ledger > div:nth-child(3n+3) { padding-left: 0; border-left: 0; }
    body[data-desktop-shell="true"] .source-overview-ledger > div:nth-child(even) { padding-left: 0; border-left: 0; }
    body[data-desktop-shell="true"] .source-overview-ledger > div { grid-template-columns: minmax(92px, .42fr) minmax(0, 1fr); gap: 10px; }
    body[data-desktop-shell="true"] .source-now { padding: 0 0 18px; grid-template-columns: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .source-now button { width: 100%; min-height: 44px; }
    body[data-desktop-shell="true"] .source-config-sheet input,
    body[data-desktop-shell="true"] .source-config-sheet textarea,
    body[data-desktop-shell="true"] .source-config-sheet select,
    body[data-desktop-shell="true"] .source-schedule-sheet select { min-height: 44px; font-size: 13px; }
    body[data-desktop-shell="true"] .source-config-actions,
    body[data-desktop-shell="true"] .source-schedule-actions,
    body[data-desktop-shell="true"] .source-runtime-actions,
    body[data-desktop-shell="true"] .source-schedule-heading,
    body[data-desktop-shell="true"] .source-message-list > header { align-items: stretch; flex-direction: column; }
    body[data-desktop-shell="true"] .source-config-actions button,
    body[data-desktop-shell="true"] .source-schedule-actions button,
    body[data-desktop-shell="true"] .source-runtime-actions button,
    body[data-desktop-shell="true"] .source-runtime-actions summary,
    body[data-desktop-shell="true"] .source-message-list header button { min-height: 44px; }
    body[data-desktop-shell="true"] .source-runtime-actions details,
    body[data-desktop-shell="true"] .source-runtime-actions details[open],
    body[data-desktop-shell="true"] .source-runtime-actions details div { width: 100%; }
    body[data-desktop-shell="true"] .source-message-list li,
    body[data-desktop-shell="true"] .source-run-ledger li { grid-template-columns: 24px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .source-run-ledger li time { grid-column: 2; }
    body[data-desktop-shell="true"] .feed-destination-strip { grid-template-columns: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .feed-destination-strip small { grid-column: 1; }
    body[data-desktop-shell="true"] .inbox-attention-context dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    body[data-desktop-shell="true"] .prototype-honesty-note { font-size: 10px; }
  }

  html[data-onboarding-embed="true"],
  html[data-onboarding-embed="true"] body {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: #0f1011;
  }
  html[data-onboarding-embed="true"] body > .icon-sprite,
  html[data-onboarding-embed="true"] body > dialog,
  html[data-onboarding-embed="true"] body > .toast,
  html[data-onboarding-embed="true"] .mobile-project-bar,
  html[data-onboarding-embed="true"] .mobile-switch,
  html[data-onboarding-embed="true"] .tui-owner-actions,
  html[data-onboarding-embed="true"] .tui-add,
  html[data-onboarding-embed="true"] .tui-tab-close,
  html[data-onboarding-embed="true"] .tui-chrome-actions { display: none !important; }
  html[data-onboarding-embed="true"] .app {
    width: 100% !important;
    height: 100dvh !important;
    min-height: 0 !important;
    display: block !important;
    overflow: hidden !important;
    background: #0f1011 !important;
  }
  html[data-onboarding-embed="true"] .workspace {
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    height: 100dvh !important;
    min-height: 0 !important;
    padding: 0 !important;
    display: block !important;
    overflow: hidden !important;
    background: #0f1011 !important;
  }
  html[data-onboarding-embed="true"] .workspace > :not(.tui-pane) { display: none !important; }
  html[data-onboarding-embed="true"] .workspace > .tui-pane {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    display: grid !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .personal-new-goal { transition: none; }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .desktop-module-item,
    body[data-desktop-shell="true"] .tree-row,
    body[data-desktop-shell="true"] .desktop-work-tab { transition: none; transform: none; }
    .theme-picker > summary .theme-caret { transition: none; }
    .focus-section-card,
    .focus-section-card-caret,
    .focus-section-card-reveal,
    .focus-section-card-content { transition: none; }
  }

`;
