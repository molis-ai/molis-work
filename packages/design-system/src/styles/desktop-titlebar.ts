/** AP3 visual layer: desktop-titlebar. */
export const DESKTOP_TITLEBAR_STYLES = `  /* The Goal document pane. It comes before the desktop shell's rule for the pane below, which overrides it at the same
     specificity. */
  body[data-board-view] .document-pane,
  .document-pane { padding: var(--focus-canvas-inset); scroll-padding-top: var(--focus-canvas-inset); background: color-mix(in srgb, var(--page) 78%, var(--rail)); }
  @media (max-width: 760px) {
    body[data-board-view] .document-pane,
    .document-pane { --focus-canvas-inset: 8px; }
  }
  /* Project name in the titlebar and the narrow app grid. */
  .navigator-project-primary > strong { min-width: 0; overflow: hidden; font-size: 15px; font-weight: var(--weight-control, 500); letter-spacing: -.015em; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .app,
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
  }
  /* Desktop shell frame: safe-area variables, the app grid, project menu, drag regions and work surface. */
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] { --desktop-project-control-center-y: calc(var(--desktop-titlebar-height) / 2); --desktop-native-control-row-height: var(--desktop-titlebar-height); --desktop-project-safe-inline-start: var(--desktop-native-project-safe-inline-start, 2px); --desktop-settings-safe-inline-start: var(--desktop-native-settings-safe-inline-start, 2px); }
    body[data-desktop-shell="true"][data-native-desktop="true"],
    html[data-native-desktop="true"] body[data-desktop-shell="true"] { --desktop-native-project-safe-inline-start: var(--desktop-window-safe-inline-start, 88px); --desktop-native-settings-safe-inline-start: var(--desktop-window-safe-inline-start, 88px); }
    body[data-desktop-shell="true"] .app { gap: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); background: var(--page); }
    body[data-desktop-shell="true"] .navigator-project-selector > svg:last-child { color: var(--faint); }
    body[data-desktop-shell="true"] .navigator-project-menu-popover > span { min-height: 24px; align-items: center; }
    body[data-desktop-shell="true"] .navigator-project-option,
    body[data-desktop-shell="true"] .navigator-project-manage { min-width: 0; min-height: 34px; padding: 0 8px; border-radius: 8px; color: inherit; display: flex; align-items: center; gap: 8px; text-decoration: none; }
    body[data-desktop-shell="true"] .navigator-project-option > span { flex: 1 1 auto; }
    body[data-desktop-shell="true"] .navigator-project-option strong { min-width: 0; }
    body[data-desktop-shell="true"] .navigator-project-settings { grid-template-columns: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .personal-account { grid-template-columns: 32px minmax(0, 1fr) 30px; }
    body[data-desktop-shell="true"] .desktop-titlebar-drag { -webkit-app-region: drag; user-select: none; }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .navigator-project-settings { -webkit-app-region: no-drag; }
    body[data-desktop-shell="true"] .document-pane { --focus-canvas-inset: 0px; padding-inline: 4px 12px; padding-bottom: 12px; grid-column: 3; grid-row: 2; background: var(--page); }
  }

  /* One Codex-style desktop titlebar contract. The native controls and work
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
      width: 16px;
      height: 16px;
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
  }

  @media (prefers-reduced-motion: reduce) {
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .desktop-module-item,
    body[data-desktop-shell="true"] .tree-row { transition: none; transform: none; }
    .theme-picker > summary .theme-caret { transition: none; }
    .focus-section-card,
    .focus-section-card-caret,
    .focus-section-card-reveal,
    .focus-section-card-content { transition: none; }
  }

`;
