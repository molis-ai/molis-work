/** Shared workspace layout, terminal pane, and dark-theme chrome rules. */
export const WORKSPACE_PANES_STYLES = `
  .tree-resizer, .tui-resizer { background: var(--page); }
  .tree-resizer::after, .tui-resizer::after { background: var(--line); }
  .document-pane { background: var(--paper); }
  .document-section { padding: 16px 0; border-bottom-color: var(--line); }
  .document-section h2, .document-subsection h3 { letter-spacing: -.015em; }

  .tui-pane, .tui-tabs, .tui-owner { background: var(--rail); }
  .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  .tui-tabs { height: 42px; border-bottom-color: var(--line); }
  .tui-mode-label {
    height: 100%;
    padding: 0 8px;
    border-bottom: 1px solid var(--ink-soft);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: var(--weight-control, 500);
  }
  .tui-stage { padding: 12px 12px 12px; gap: 8px; }
  .tui-tab.is-active { color: var(--ink); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
  .tui-owner {
    min-width: 0;
    padding: 8px 12px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .tui-owner-copy { min-width: 0; flex: 1 1 auto; display: grid; gap: 4px; }
  .tui-owner-copy > strong { min-width: 0; overflow: hidden; color: var(--ink); font-size: 15px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .tui-owner-binding { min-width: 0; color: var(--muted); display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .tui-owner-binding i { width: 5px; height: 5px; border-radius: 50%; background: var(--green); flex: 0 0 auto; }
  .tui-owner-binding b { font-weight: var(--weight-control, 500); }
  .tui-owner-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
  .tui-owner-actions > .mw-object-status { flex: 0 0 auto; }
  .tui-focus-return {
    min-height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: 400;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
  }
  .tui-menu {
    border-color: var(--line-strong);
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--lift-3);
  }
  .tui-menu > strong { color: var(--ink); }
  .tui-menu input,
  .tui-menu select {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink);
  }
  .tui-menu input::placeholder { color: var(--faint); }
  .tui-runtime-choices button,
  .tui-menu-actions button:not(.mw-btn) {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink-soft);
  }
  .tui-runtime-choices button:hover,
  .tui-runtime-choices button.is-selected {
    border-color: var(--line-strong);
    background: var(--nav-active);
    color: var(--ink);
  }
  .tui-runtime-choices button:disabled {
    border-color: var(--line);
    background: var(--rail);
    color: var(--faint);
    opacity: .72;
  }
  .tui-menu-missing {
    border: 1px solid color-mix(in srgb, var(--amber), var(--line) 62%);
    background: var(--amber-soft);
    color: var(--amber);
  }
  .tui-chrome button:not(.mw-btn) { border-color: var(--line-strong); border-radius: 8px; background: var(--paper); }
  .tui-terminal { border-color: var(--terminal-border); border-radius: 11px; box-shadow: none; }
  .tui-empty { color: var(--muted); }
  body[data-desktop-shell="true"] .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .tui-owner { padding-inline: 16px; }
  body[data-desktop-shell="true"] .tui-owner-copy > strong { font-size: 15px; }
  body[data-desktop-shell="true"] .tui-tabs { padding-inline: 12px 12px; }
  body[data-desktop-shell="true"] .tui-stage { padding: 12px 16px 16px; }
  body[data-desktop-shell="true"] .tui-chrome { padding: 0 4px; }
  body[data-desktop-shell="true"] .tui-terminal { border-radius: 10px; }

  html[data-resolved-theme="dark"] .topbar,
  html[data-resolved-theme="dark"] .tree-pane,
  html[data-resolved-theme="dark"] .tree-chrome,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tui-pane,
  html[data-resolved-theme="dark"] .tui-tabs,
  html[data-resolved-theme="dark"] .tui-owner,
  html[data-resolved-theme="dark"] .settings-navigation { background: var(--rail); }
  html[data-resolved-theme="dark"] .document-pane,
  html[data-resolved-theme="dark"] .settings-document,
  html[data-resolved-theme="dark"] .theme-menu,
  html[data-resolved-theme="dark"] .dialog-shell { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .locale-switch { background: var(--paper); }
  html[data-resolved-theme="dark"] .project-context,
  html[data-resolved-theme="dark"] .top-action,
  html[data-resolved-theme="dark"] a.top-action,
  html[data-resolved-theme="dark"] .tree-tool,
  html[data-resolved-theme="dark"] a.tree-tool,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tree-dep-copy strong { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not(.mw-slider, .mw-input):not(.global-search-query):not([data-mw-plain-input]):not([data-inline-title]),
  html[data-resolved-theme="dark"] textarea:not(.mw-textarea),
  html[data-resolved-theme="dark"] select,
  html[data-resolved-theme="dark"] .tree-filter,
  html[data-resolved-theme="dark"] .tree-search input,
  html[data-resolved-theme="dark"] .tree-search kbd,
  html[data-resolved-theme="dark"] .tui-tab.is-active {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 86%, var(--rail));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .tree-filter-option { border-color: var(--line); }
  html[data-resolved-theme="dark"] .runtime-plan-shell > footer .runtime-plan-apply {
    color: var(--action-ink) !important;
  }
  html[data-resolved-theme="dark"] .navigator-view-switch { background: var(--rail); }
  html[data-resolved-theme="dark"] .navigator-view-switch button.is-active { border-color: var(--line-strong); background: var(--rail); }
  html[data-resolved-theme="dark"] .tree-node:hover,
  html[data-resolved-theme="dark"] .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 64%, transparent); }

  @media (max-width: 1120px) {
    .topbar .project-context > strong { display: none; }
  }

  @media (min-width: 761px) and (max-width: 1180px) {
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: var(--tree-width, clamp(260px, 30vw, 320px)) 5px minmax(0, 1fr);
    }
    .workspace.is-desktop-tui .tui-resizer { display: none; }
    .workspace.is-desktop-tui .tui-pane {
      position: absolute;
      z-index: 12;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(430px, 48vw);
      border-left: 1px solid var(--line-strong);
      box-shadow: var(--lift-1);
    }
    .workspace.is-desktop-tui.is-tui-collapsed .tui-pane {
      visibility: hidden;
      pointer-events: none;
    }
    .workspace.is-desktop-tui .tui-expand {
      top: 50%;
      min-height: 104px;
      border-radius: 7px 0 0 7px;
      box-shadow: var(--lift-1);
    }
    html[data-resolved-theme="dark"] .workspace.is-desktop-tui .tui-pane {
      box-shadow: var(--lift-1);
    }
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(520px, 1fr) 5px minmax(300px, 36vw);
    }
  }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] {
      grid-template-columns: minmax(0, 1fr) 5px minmax(330px, 32vw) !important;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      min-width: 0;
      grid-template-rows: auto 0 auto minmax(0, 1fr) 0;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .navigator-project { grid-row: 1; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header { grid-row: 2; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-chrome { grid-row: 3; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-scroll { grid-row: 4; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-footer { grid-row: 5; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer { display: none; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .document-pane { min-width: 0; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-expand { display: none !important; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-expand { display: none; }
  }

  @media (min-width: 761px) {
    .workspace,
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed,
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: var(--tree-width, clamp(300px, 27vw, 400px)) 5px minmax(0, 1fr) !important;
      grid-template-rows: 50px minmax(0, 1fr);
    }
    .workspace > .tree-pane {
      grid-column: 1;
      grid-row: 1 / -1;
    }
    .workspace > .tree-resizer {
      grid-column: 2;
      grid-row: 1 / -1;
    }
    .workspace > .workbench-header {
      grid-column: 3;
      grid-row: 1;
      min-height: 50px;
      padding: 0 16px;
      display: flex;
    }
    body:not([data-desktop-shell="true"]) .workspace > .workbench-header {
      padding: 0 24px;
      background: var(--paper);
    }
    body:not([data-desktop-shell="true"]) .workbench-switch {
      align-self: stretch;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      gap: 16px;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button {
      position: relative;
      min-height: 49px;
      padding: 0 4px;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: transparent;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active { color: var(--ink); background: transparent; box-shadow: none; }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active::after { background: var(--blue); }
    .workspace > .document-pane,
    .workspace > .tui-pane {
      grid-column: 3;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
    }
    .workspace.is-desktop-tui > .tui-pane {
      position: relative !important;
      inset: auto !important;
      width: auto !important;
      border-left: 0;
      box-shadow: none !important;
    }
    .workspace > .tui-resizer,
    .workspace > .tui-expand { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .tui-pane,
    .workspace[data-workspace-mode="graph"] > .document-pane,
    .workspace[data-workspace-mode="graph"] > .tui-pane,
    .workspace[data-workspace-mode="runtime"] > .document-pane { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .document-pane { display: block; }
    .workspace[data-workspace-mode="runtime"] > .tui-pane { display: grid; }
    .workspace[data-workspace-mode="graph"] > .workbench-header { display: none; }
    .tree-pane[data-navigator-view="graph"] .tree-scroll { padding: 8px 12px 16px; overflow: auto; }
    .navigator-view-switch { display: grid; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: auto 34px auto minmax(0, 1fr) 46px;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer { display: flex; }
    html[data-resolved-theme="dark"] .workbench-switch { background: var(--rail); }
    html[data-resolved-theme="dark"] .workbench-switch button.is-active { background: var(--paper); box-shadow: none; }
  }

  @media (max-width: 760px) {
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .app { grid-template-rows: 44px 44px minmax(0, 1fr); }
    .topbar { min-width: 0; }
    .topbar[data-mobile-surface="document"] { transform: translateZ(.001px); }
    .brand { min-width: auto; padding: 0 12px; border-right: 0; }
    .brand strong { font-size: 15px; }
    .project-context { min-width: 0; padding: 0 8px; }
    .project-context span { max-width: 150px; }
    .top-spacer, body[data-desktop-shell="true"] .top-spacer { display: block; }
    .top-action { width: 30px; padding: 0; justify-content: center; }
    .top-action span, .theme-picker > summary span { display: none; }
    .theme-picker > summary .theme-caret { display: none; }
    .theme-menu { right: 0; }
    .workspace, .workspace.is-desktop-tui { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
    .workspace.is-graph-view, .workspace.is-desktop-tui.is-graph-view { grid-template-columns: minmax(0, 1fr); }
    .tree-pane { border-right: 0; }
    body[data-desktop-shell="true"] .desktop-pane-header { display: none; }
    .workbench-header { display: none; }
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto auto minmax(0, 1fr) 42px; }
    .navigator-view-switch { width: 100%; grid-template-columns: repeat(2, 1fr); }
    .tui-pane { grid-template-rows: 52px 38px minmax(0, 1fr); }
  }
`;
