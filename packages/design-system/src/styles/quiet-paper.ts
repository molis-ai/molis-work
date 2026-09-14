/** AP3 visual layer: quiet-paper. */
export const QUIET_PAPER_STYLES = `  /* Quiet Paper visual replacement. Persistent hierarchy comes from calm
     surfaces and spacing; color is reserved for action, focus, and real state. */
  body {
    background: var(--page);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .topbar {
    border-bottom-color: transparent;
    background: var(--page);
  }
  .brand { border-right-color: transparent; }
  .brand svg { color: var(--ink); }
  .top-action,
  a.top-action {
    border-radius: var(--radius-control);
    color: var(--muted);
  }
  .top-action:hover,
  a.top-action:hover,
  .top-action.is-current,
  a.top-action.is-current {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  body[data-desktop-shell="true"] .app { grid-template-rows: 44px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar {
    min-height: 44px;
    padding-bottom: 0;
    background: var(--page);
  }
  body[data-desktop-shell="true"] .brand svg { color: var(--ink-soft); }

  .workspace { background: var(--page); }
  .tree-pane,
  .tree-chrome,
  .tree-footer,
  .navigator-project,
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    border-color: transparent;
    background: var(--rail);
  }
  .navigator-project {
    padding: 13px 14px 8px;
    gap: 4px;
  }
  .navigator-project-primary > strong {
    color: var(--ink);
    font-size: 13px;
    font-weight: 680;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    min-height: 30px;
    padding-inline: 14px;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong {
    color: var(--faint);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .035em;
  }
  body[data-desktop-shell="true"] .tree-pane {
    grid-template-rows: auto 30px auto minmax(0, 1fr) 42px;
  }

  .tree-chrome { padding: 7px 10px 9px; }
  body[data-desktop-shell="true"] .tree-chrome { padding: 7px 12px 9px; }
  .tree-search input,
  input:not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    border-color: transparent;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--paper) 68%, var(--rail));
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .tree-search input { height: 32px; padding-inline: 30px 46px; }
  .tree-search kbd {
    border: 0;
    border-radius: 5px;
    background: transparent;
  }
  .navigator-view-switch,
  .workbench-switch {
    padding: 2px;
    border: 0;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .navigator-view-switch button,
  .workbench-switch button { border-radius: 7px; }
  .navigator-view-switch button.is-active,
  .workbench-switch button.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 3px rgba(28, 29, 26, .08);
  }
  .tree-tool,
  a.tree-tool {
    border-color: transparent;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
  }
  .tree-tool:hover,
  a.tree-tool:hover {
    border-color: transparent;
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .tree-scroll { padding-inline: 10px; }
  .tree-children { border-left-color: color-mix(in srgb, var(--ink) 9%, transparent); }
  .tree-node,
  .navigator-goal-row { border-radius: var(--radius-item); }
  .tree-node:hover,
  .navigator-goal-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .tree-node.is-selected,
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    box-shadow: none;
  }
  .tree-node.is-selected .tree-copy small { color: var(--muted); }
  .navigator-goal-row.is-selected .navigator-goal-leading { color: var(--blue-dark); }
  .navigator-group { border-bottom-color: transparent; }
  .navigator-group + .navigator-group { margin-top: 3px; }
  .navigator-group > header { height: 36px; }
  .navigator-group > header strong { color: var(--muted); letter-spacing: .025em; }
  .tree-footer { padding-inline: 14px; color: var(--muted); }

  .tree-resizer,
  .tui-resizer { background: var(--page); }
  .tree-resizer::after,
  .tui-resizer::after { background: transparent; }
  .tree-resizer:hover::after,
  .tui-resizer:hover::after,
  .tree-resizer:focus-visible::after,
  .tui-resizer:focus-visible::after { background: var(--line-strong); }
  .document-pane {
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  body[data-desktop-shell="true"] .goal-document {
    width: min(100%, 980px);
    margin-inline: auto;
    padding: 30px clamp(28px, 3.2vw, 48px) 68px;
  }
  body[data-desktop-shell="true"] .goal-header { padding-bottom: 20px; }
  body[data-desktop-shell="true"] .goal-title-row h1 {
    font-size: clamp(25px, 2vw, 31px);
    line-height: 1.18;
    letter-spacing: -.032em;
  }
  .goal-title-outcome { max-width: 72ch; color: var(--muted); }
  .document-action,
  .goal-more > summary {
    border-color: transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
  }
  .document-action:hover,
  .goal-more > summary:hover {
    border-color: transparent;
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .goal-focus-outcome,
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  .document-section { border-bottom-color: color-mix(in srgb, var(--line) 78%, transparent); }
  .goal-focus-outcome { padding-block: 25px 24px; }
  .goal-focus-outcome > span { color: var(--blue-dark); }
  .goal-focus-outcome p { max-width: 72ch; color: var(--ink); }
  .goal-now { padding-block: 23px; }
  .button-primary,
  .goal-primary-action,
  .planning-primary-action,
  .project-index-create,
  .project-index-start a:first-child,
  .project-migration-submit,
  .runtime-plan-apply,
  .tui-chrome .tui-advance:not(:disabled),
  .tui-menu-actions button[type="submit"],
  .human-review-jump,
  .guidance-primary-action,
  .planning-edit-footer button[type="submit"],
  body[data-desktop-shell="true"] .source-now button:not(:disabled),
  body[data-desktop-shell="true"] .source-mobile-add {
    border-color: var(--action) !important;
    border-radius: var(--radius-control) !important;
    background: var(--action) !important;
    color: var(--action-ink) !important;
    box-shadow: none !important;
  }
  .button-primary:hover,
  .goal-primary-action:hover,
  .planning-primary-action:hover,
  .project-index-create:hover,
  .project-index-start a:first-child:hover,
  .project-migration-submit:hover,
  .runtime-plan-apply:hover,
  .tui-chrome .tui-advance:hover:not(:disabled),
  .tui-menu-actions button[type="submit"]:hover,
  .human-review-jump:hover,
  .guidance-primary-action:hover,
  .planning-edit-footer button[type="submit"]:hover,
  body[data-desktop-shell="true"] .source-now button:hover:not(:disabled),
  body[data-desktop-shell="true"] .source-mobile-add:hover {
    background: color-mix(in srgb, var(--action) 90%, var(--action-ink)) !important;
    color: var(--action-ink) !important;
    opacity: 1;
  }
  .button-primary:disabled,
  .goal-primary-action:disabled,
  .project-migration-submit:disabled,
  .runtime-plan-apply:disabled,
  .tui-chrome .tui-advance:disabled,
  .guidance-primary-action:disabled,
  .planning-edit-footer button[type="submit"]:disabled,
  body[data-desktop-shell="true"] .source-now button:disabled {
    border-color: var(--line) !important;
    background: var(--rail) !important;
    color: var(--faint) !important;
    opacity: 1 !important;
  }
  .button-danger {
    border-color: var(--danger-action) !important;
    background: var(--danger-action) !important;
    color: var(--danger-action-ink) !important;
  }
  .button-danger:hover {
    background: color-mix(in srgb, var(--danger-action) 90%, var(--danger-action-ink)) !important;
    color: var(--danger-action-ink) !important;
  }
  .goal-now-blockers { border-top-color: var(--line); }
  .goal-focus-criteria li,
  .goal-focus-context dl > div { border-top-color: color-mix(in srgb, var(--line) 78%, transparent); }
  .goal-focus-context dl {
    padding-block: 3px;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .goal-focus-context dl > div { border-top: 0; }

  .theme-menu,
  .tui-menu,
  .dialog-shell,
  .runtime-plan-dialog,
  .project-migration-dialog {
    border-color: var(--line);
    border-radius: var(--radius-surface);
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button { border-radius: 8px; }
  .theme-menu button[aria-pressed="true"] {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .tui-pane,
  .tui-tabs,
  .tui-owner { background: var(--rail); }
  .tui-tab.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  .tui-mode-label { border-bottom-color: var(--ink-soft); }
  .tui-terminal { border-color: var(--terminal-border); border-radius: 12px; }

  .settings-content { background: var(--page); }
  .settings-navigation {
    margin: 8px 0 8px 8px;
    padding: 16px 10px;
    border: 0;
    border-radius: var(--radius-surface) 0 0 var(--radius-surface);
    background: var(--rail);
  }
  .settings-navigation a { border-radius: 8px; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .settings-navigation a[aria-current="page"] {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    box-shadow: none;
  }
  .settings-content {
    margin: 8px 8px 8px 0;
    border-radius: 0 var(--radius-surface) var(--radius-surface) 0;
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .settings-shell--standalone .settings-content {
    margin-left: 8px;
    border-radius: var(--radius-surface);
  }
  .settings-document { padding: 44px clamp(30px, 4vw, 56px) 84px; }
  .settings-heading { border-bottom-color: var(--line); }
  .preference-option {
    min-height: 88px;
    border-color: var(--line);
    border-radius: 12px;
    background: var(--paper);
  }
  .preference-option:hover,
  .preference-option[aria-pressed="true"],
  .preference-option[aria-current="true"] {
    border-color: var(--line-strong);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, var(--paper));
  }
  .preference-option .preference-check { color: var(--blue-dark); }
  .settings-record-action button,
  .settings-button,
  .settings-action-section button,
  .settings-import-row button,
  .project-record-tools form button,
  .service-action-row button {
    border-color: var(--line-strong);
    border-radius: var(--radius-control);
    color: var(--ink-soft);
    background: var(--paper);
  }
  .settings-record-action button:hover,
  .settings-button:hover,
  .settings-action-section button:hover,
  .settings-import-row button:hover,
  .project-record-tools form button:hover,
  .service-action-row button:hover {
    border-color: var(--line-strong);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, var(--paper));
  }
  .project-rules-intro {
    margin: 22px 0 18px;
    padding: 0 0 22px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
  }
  .project-rules-intro ol { gap: 0; }
  .project-rules-intro li {
    padding: 9px 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .project-rules-intro li + li { border-left: 1px solid var(--line); }
  .project-rules-intro li > span:first-child {
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .policy-source {
    border-color: var(--line);
    border-radius: 12px;
  }
  .policy-source--goal { border-color: var(--line-strong); }
  .policy-source > summary,
  .policy-source--goal > summary {
    background: color-mix(in srgb, var(--paper) 42%, var(--rail));
  }
  .policy-mode-options label > span,
  .policy-toggle,
  .policy-counter { border-radius: var(--radius-control); }
  .policy-mode-options input:checked + span {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--ink) 6%, var(--paper));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent);
  }
  .policy-form-group > header > span {
    color: var(--ink-soft);
    background: var(--rail);
  }

  .project-index-panel {
    border: 0;
    border-radius: 16px;
    background: var(--paper);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .project-index-heading { border-bottom-color: var(--line); }
  .project-index-desktop-note {
    border: 0;
    border-radius: var(--radius-control);
    background: var(--rail);
    color: var(--ink-soft);
    font-weight: 520;
  }
  .project-list a:hover { background: color-mix(in srgb, var(--ink) 5%, var(--paper)); }
  .project-list a:hover svg { color: var(--ink); }
  .project-index-migration,
  .project-index-note { background: color-mix(in srgb, var(--paper) 42%, var(--rail)); }
  .project-index-start a,
  .project-index-migrate { border-radius: var(--radius-control); }
  .project-index-start a:first-child {
    border-color: var(--action);
    color: var(--action-ink);
    background: var(--action);
  }

  html[data-resolved-theme="dark"] .tree-node.is-selected,
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected,
  html[data-resolved-theme="dark"] .settings-navigation a[aria-current="page"] {
    background: color-mix(in srgb, var(--ink) 9%, transparent);
  }
  html[data-resolved-theme="dark"] .document-pane,
  html[data-resolved-theme="dark"] .settings-content { box-shadow: inset 0 0 0 1px var(--line); }

  @media (min-width: 761px) {
    body[data-board-view] .workspace { padding: 0 8px 8px; }
    body[data-board-view] .tree-pane {
      border-right: 0;
      border-radius: var(--radius-surface) 0 0 var(--radius-surface);
      overflow: hidden;
    }
    body[data-board-view] .document-pane {
      border-radius: var(--radius-surface);
      overflow: auto;
    }
    body[data-board-view] .tui-pane {
      border-left: 0;
      border-radius: 0 var(--radius-surface) var(--radius-surface) 0;
      overflow: hidden;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 1120px);
      padding: 14px 24px 36px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project { padding: 7px 9px 5px; }
  }

  @media (max-width: 760px) {
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .app { grid-template-rows: 44px 44px minmax(0, 1fr); }
    body[data-board-view] .workspace { background: var(--paper); }
    .mobile-switch {
      border-bottom: 0;
      background: var(--page);
    }
    .mobile-switch button.is-active { color: var(--ink); }
    .mobile-switch button.is-active::after { background: var(--ink-soft); }
    .tree-pane,
    .document-pane,
    .tui-pane { border-radius: 0; box-shadow: none; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .companion-runtime {
      border-color: transparent;
      border-radius: 12px;
      background: var(--rail);
    }
    body[data-desktop-shell="true"] .goal-now-body {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
    .settings-navigation,
    .settings-content,
    .settings-shell--standalone .settings-content {
      margin: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .project-rules-intro li + li { border-left: 0; border-top: 1px solid var(--line); }
  }

`;

