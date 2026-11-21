/** AP3 visual layer: navigation-ownership. */
export const NAVIGATION_OWNERSHIP_STYLES = `  /* Runtime pane: owner and tab bars, stage, parent guard, child choices, chrome buttons, menu; settings navigation. */
  .tui-resizer { background: var(--line); }
  .tui-resizer:hover { background: var(--blue); }
  .tree-resizer::after,
  .tui-resizer::after { inset-inline: 1px; background: transparent; }
  .tui-owner,
  .tui-tabs { background: color-mix(in srgb, var(--paper) 96%, var(--rail)); border-color: var(--line); }
  .tui-tab { color: var(--muted); }
  .tui-tab.is-active { color: var(--ink); background: var(--rail); }
  .tui-stage { background: var(--paper); }
  .tui-parent-guard { padding: 16px 4px 16px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  .tui-child-choices { padding-left: 24px; gap: 0; }
  .tui-child-choice { padding: 12px 4px; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
  .tui-child-choice:hover { border-color: var(--line-strong); background: var(--nav-hover); }
  .tui-chrome button:not(.mw-btn) { border-color: var(--line-strong); background: var(--paper); color: var(--ink-soft); }
  .tui-chrome button:not(.mw-btn):hover:not(:disabled) { border-color: var(--line-strong); background: var(--nav-hover); color: var(--ink); }
  .tui-chrome button:not(.mw-btn):disabled { border-color: var(--line); background: transparent; color: var(--faint); }
  .tui-pane[data-tui-read-only="true"] .tui-chrome { opacity: 1; }
  .tui-chrome button:disabled,
  .tui-chrome .tui-advance:disabled { border-color: var(--line); background: var(--rail); color: var(--faint); }
  .tui-terminal { color: var(--terminal-ink); }
  .tui-empty { color: var(--terminal-muted); }
  .settings-navigation { margin: 0; padding: 32px 12px; border: 0; border-right: 1px solid var(--line); border-radius: 0; background: var(--rail); }
  .settings-navigation a { border-radius: 6px; }
  .settings-navigation a:hover { background: var(--nav-hover); }
  .settings-navigation a[aria-current="page"] { color: var(--ink); background: var(--nav-active); box-shadow: none; }
  @media (max-width: 760px) {
    .settings-navigation { margin: 0; padding: 8px 8px; border-right: 0; border-bottom: 1px solid var(--line); }
    .settings-navigation a { min-height: 44px; }
  }
  .tui-menu { border: 1px solid var(--line-strong); border-radius: 10px; background: var(--paper); box-shadow: var(--shadow); }
  /* A read-only Runtime pane shows only its parent guard: no tabs, chrome, terminal or menu. */
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] { grid-template-rows: 58px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-tabs,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-chrome,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-terminal,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-menu { display: none !important; }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-stage { padding: 0 16px 16px; grid-template-areas: "guard"; grid-template-rows: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-parent-guard { min-height: 100%; max-height: none; padding-top: 16px; border-bottom: 0; align-content: start; }
  }

  /* Navigation ownership correction: directory controls its own rail, while
     Focus and Runtime stay with the selected Goal. */

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
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle:hover {
      color: var(--ink);
      background: var(--nav-hover);
    }
    body[data-desktop-shell="true"] .navigator-directory-toggle:focus-visible,
    body[data-desktop-shell="true"] .tui-focus-return:focus-visible {
      outline: var(--focus-stroke);
      outline-offset: var(--focus-stroke-inset);
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
      padding-inline: 8px;
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
      box-shadow: var(--lift-1);
    }

    /* Light location states stay embedded in their rail. Paper and elevation
       remain reserved for content surfaces and overlays. */
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .desktop-goal-directory .tree-entry.is-selected,
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .feed-list-item.is-selected {
      background: color-mix(in srgb, var(--blue) 8%, transparent) !important;
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .navigator-project-settings[aria-current="page"],
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .workspace.is-directory-collapsed .navigator-directory-toggle {
      background: color-mix(in srgb, var(--ink) 7%, transparent);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .personal-account:hover,
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .tui-focus-return:hover {
      background: var(--nav-hover);
      box-shadow: none;
    }
    html[data-resolved-theme="light"] body[data-desktop-shell="true"] .personal-account:hover .personal-account-settings {
      background: transparent;
    }

    body[data-desktop-shell="true"] .tui-owner {
      padding-inline: 16px;
    }
    body[data-desktop-shell="true"] .tui-owner-actions > .goal-status {
      min-height: 28px;
      padding: 4px 8px;
      border-radius: 8px;
    }
    body[data-desktop-shell="true"] .tui-focus-return {
      min-height: 28px;
      padding: 0 8px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      position: static;
      font-size: 11px;
      font-weight: 400;
      transition: color 130ms var(--ease-quint), background 130ms var(--ease-quint);
    }
    body[data-desktop-shell="true"] .tui-focus-return:hover { color: var(--ink); background: var(--paper); }
    body[data-desktop-shell="true"] .tui-focus-return svg { width: 12px; height: 12px; }
  }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .tui-focus-return { display: none !important; }

    body[data-desktop-shell="true"] .feed-directory-tools { padding: 8px 12px; }
    body[data-desktop-shell="true"] .feed-directory-toolbar {
      min-width: 0;
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: center;
      gap: 8px;
    }

    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .workspace { grid-row: 3; }
  }

`;

