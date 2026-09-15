/** AP3 visual layer: personal-shell. */
export const PERSONAL_SHELL_STYLES = `  /* Personal workspace shell. The application owns the left rail; the
     current project becomes one continuous working surface beside it. */
  .personal-sidebar,
  .desktop-project-context { display: none; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .app {
      height: 100dvh;
      min-height: 0;
      padding: 8px 12px 12px 8px;
      gap: 0 12px;
      grid-template-columns: 244px minmax(0, 1fr);
      grid-template-rows: 56px minmax(0, 1fr);
      background: var(--page);
    }

    body[data-desktop-shell="true"] .personal-sidebar {
      min-width: 0;
      min-height: 0;
      grid-column: 1;
      grid-row: 1 / 3;
      display: grid;
      grid-template-rows: 56px auto auto auto auto minmax(76px, 1fr) auto;
      align-content: start;
      color: var(--ink-soft);
      -webkit-user-select: none;
      user-select: none;
    }

    .personal-sidebar-brand {
      min-width: 0;
      min-height: 56px;
      padding: 0 12px 0 80px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
    }
    .personal-sidebar-brand svg { width: 17px; height: 17px; color: var(--ink); }
    .personal-sidebar-brand strong { font-size: 15px; font-weight: 740; letter-spacing: -.025em; }

    .personal-space-context {
      min-width: 0;
      min-height: 54px;
      margin: 4px 8px 10px;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      background: color-mix(in srgb, var(--paper) 62%, var(--rail));
    }
    .personal-space-mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-space-mark svg { width: 15px; height: 15px; }
    .personal-space-copy { min-width: 0; display: grid; gap: 1px; }
    .personal-space-copy strong {
      overflow: hidden;
      color: var(--ink);
      font-size: 12px;
      font-weight: 690;
      letter-spacing: -.01em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-space-copy small { color: var(--muted); font-size: 10px; }
    .personal-space-state {
      padding: 2px 5px;
      border-radius: 5px;
      color: var(--muted);
      background: var(--rail);
      font-size: 9px;
      font-weight: 650;
    }

    .personal-new-goal {
      min-height: 38px;
      margin: 0 8px 12px;
      padding: 0 11px;
      border: 0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--action-ink);
      background: var(--action);
      font-size: 12px;
      font-weight: 680;
      cursor: pointer;
      transition: opacity .18s ease, transform .18s cubic-bezier(.16, 1, .3, 1);
    }
    .personal-new-goal svg { width: 15px; height: 15px; }
    .personal-new-goal:hover { opacity: .9; transform: translateY(-1px); }
    .personal-new-goal:active { transform: translateY(0); }

    .personal-primary-nav,
    .personal-utility-nav {
      min-width: 0;
      padding: 0 8px;
      display: grid;
      gap: 2px;
    }
    .personal-primary-nav { padding-bottom: 10px; }
    .personal-utility-nav {
      margin: 0 8px;
      padding: 9px 0 10px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .personal-nav-item {
      width: 100%;
      min-width: 0;
      min-height: 34px;
      padding: 0 9px;
      border: 0;
      border-radius: 7px;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      background: transparent;
      font: inherit;
      text-align: left;
      text-decoration: none;
    }
    a.personal-nav-item,
    button.personal-nav-item { cursor: pointer; }
    a.personal-nav-item:hover,
    button.personal-nav-item:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-nav-item.is-current {
      color: var(--ink);
      background: color-mix(in srgb, var(--paper) 72%, var(--rail));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 80%, transparent);
    }
    .personal-nav-item > svg { width: 16px; height: 16px; color: currentColor; }
    .personal-nav-item > span {
      min-width: 0;
      overflow: hidden;
      font-size: 12px;
      font-weight: 610;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-nav-item > strong {
      min-width: 19px;
      min-height: 19px;
      padding: 0 5px;
      border-radius: 5px;
      display: grid;
      place-items: center;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      font-size: 10px;
      font-weight: 700;
    }
    .personal-nav-item.has-pending > strong { color: var(--blue-dark); background: var(--blue-soft); }
    .personal-nav-item kbd {
      color: var(--faint);
      font: 9px/1 var(--font);
    }
    .personal-nav-item.is-planned {
      color: var(--muted);
      cursor: default;
    }
    .personal-nav-item.is-planned > span { font-weight: 560; }
    .personal-nav-item.is-planned > small,
    .personal-nav-item.is-planned > em {
      color: var(--faint);
      font-size: 9px;
      font-style: normal;
      white-space: nowrap;
    }
    .personal-nav-item.is-planned > em {
      display: none;
    }

    .personal-recent-projects {
      min-width: 0;
      min-height: 0;
      padding: 17px 8px 10px;
      align-self: start;
    }
    .personal-recent-projects h2 {
      margin: 0 9px 7px;
      color: var(--faint);
      font-size: 10px;
      font-weight: 650;
    }
    .personal-project-link {
      min-width: 0;
      min-height: 32px;
      padding: 0 9px;
      border-radius: 7px;
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      text-decoration: none;
    }
    .personal-project-link:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-project-link svg { width: 14px; height: 14px; }
    .personal-project-link span {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 610;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .personal-sidebar-footer {
      min-width: 0;
      padding: 10px 8px 2px;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 7px;
    }
    .personal-settings-link {
      min-height: 32px;
      padding: 0 9px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 610;
      text-decoration: none;
    }
    .personal-settings-link:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-settings-link svg { width: 15px; height: 15px; }
    .personal-local-state {
      min-width: 0;
      padding: 4px 9px 0;
      display: grid;
      grid-template-columns: 15px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      color: var(--muted);
    }
    .personal-local-state > svg { width: 14px; height: 14px; margin-top: 2px; }
    .personal-local-state > span { min-width: 0; display: grid; gap: 1px; }
    .personal-local-state strong { color: var(--ink-soft); font-size: 10px; font-weight: 630; }
    .personal-local-state small { overflow: hidden; color: var(--faint); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }

    body[data-desktop-shell="true"]:not(.settings-page) .topbar {
      min-width: 0;
      min-height: 56px;
      grid-column: 2;
      grid-row: 1;
      padding: 0 12px 0 16px;
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 14px 14px 0 0;
      display: flex;
      background: var(--paper);
    }
    body[data-desktop-shell="true"]:not(.settings-page) .topbar > .brand,
    body[data-desktop-shell="true"]:not(.settings-page) .topbar > .top-action { display: none; }
    body[data-desktop-shell="true"]:not(.settings-page) .topbar > .top-spacer { display: block; }
    body[data-desktop-shell="true"] .desktop-project-context {
      min-width: 0;
      min-height: 55px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .desktop-project-mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--ink-soft);
      background: var(--rail);
    }
    .desktop-project-mark svg { width: 15px; height: 15px; }
    .desktop-project-copy { min-width: 0; max-width: min(30vw, 360px); display: grid; gap: 0; }
    .desktop-project-copy small { color: var(--faint); font-size: 9px; }
    .desktop-project-copy strong {
      min-width: 0;
      overflow: hidden;
      color: var(--ink);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.015em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .desktop-project-sync {
      min-height: 22px;
      padding: 0 7px;
      border-radius: 5px;
      display: inline-flex;
      align-items: center;
      color: var(--green);
      background: var(--green-soft);
      font-size: 9px;
      font-weight: 660;
      white-space: nowrap;
    }
    .desktop-project-sync.is-syncing { color: var(--blue-dark); background: var(--blue-soft); }
    .desktop-project-sync.is-offline { color: var(--amber); background: var(--amber-soft); }
    .desktop-project-actions { display: flex; align-items: center; gap: 2px; }
    .desktop-project-actions a {
      min-height: 30px;
      padding: 0 8px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 620;
      text-decoration: none;
    }
    .desktop-project-actions a:hover { color: var(--ink); background: var(--rail); }
    .desktop-project-actions svg { width: 14px; height: 14px; }

    body[data-desktop-shell="true"] .mobile-switch { display: none; }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      min-width: 0;
      min-height: 0;
      grid-column: 2;
      grid-row: 2;
      border: 1px solid var(--line);
      border-radius: 0 0 14px 14px;
      overflow: hidden;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .navigator-project { display: none; }
    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: 34px auto minmax(0, 1fr) 46px;
    }
    body[data-desktop-shell="true"] .tree-pane > .desktop-pane-header { grid-row: 1; }
    body[data-desktop-shell="true"] .tree-pane > .tree-chrome { grid-row: 2; }
    body[data-desktop-shell="true"] .tree-pane > .tree-scroll { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane > .tree-footer { grid-row: 4; }
  }

  @media (min-width: 761px) and (max-width: 1040px) {
    body[data-desktop-shell="true"] .app {
      padding-right: 8px;
      gap: 0 8px;
      grid-template-columns: 224px minmax(0, 1fr);
    }
    .personal-sidebar-brand { padding-left: 72px; }
    .personal-nav-item { padding-inline: 8px; }
    .personal-nav-item.is-planned > small { display: none; }
    .personal-nav-item.is-planned > em { display: none; }
    .desktop-project-actions a span { display: none; }
  }

`;

