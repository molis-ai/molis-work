/** AP3 visual layer: personal-workbench-v2. */
export const PERSONAL_WORKBENCH_V2_STYLES = `  /* Personal workbench v2: Codex-density application rail, project index,
     and a Goal dossier whose real contract is visible in the first viewport. */
  .goal-brief-grid,
  .goal-title-facts { display: none; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .app {
      padding: 0;
      gap: 0;
      grid-template-columns: 216px minmax(0, 1fr);
      grid-template-rows: 44px minmax(0, 1fr);
      background: var(--page);
    }

    body[data-desktop-shell="true"] .personal-sidebar {
      padding: 0 8px 8px;
      border-right: 1px solid var(--line);
      grid-template-rows: 48px auto auto auto auto minmax(12px, 1fr) auto;
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
    }
    .personal-sidebar-brand {
      min-height: 48px;
      padding: 0 8px 0 72px;
      gap: 7px;
    }
    .personal-sidebar-brand svg { width: 16px; height: 16px; }
    .personal-sidebar-brand strong { font-size: 14px; font-weight: 400; }

    .personal-space-context {
      min-height: 36px;
      margin: 2px 0 8px;
      padding: 3px 7px;
      border: 0;
      border-radius: 7px;
      grid-template-columns: 26px minmax(0, 1fr);
      gap: 7px;
      background: transparent;
    }
    .personal-space-mark {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-space-mark svg { width: 13px; height: 13px; }
    .personal-space-copy strong { font-size: 11.5px; }
    .personal-space-copy small { font-size: 9px; }

    .personal-quick-actions {
      margin: 0 0 13px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 34px;
      gap: 5px;
    }
    .personal-new-goal {
      min-height: 34px;
      margin: 0;
      padding: 0 9px;
      border-radius: 7px;
      font-size: 11.5px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--action-ink) 10%, transparent);
    }
    .personal-new-goal:hover { transform: none; }
    .personal-search-button {
      width: 34px;
      min-height: 34px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 64%, transparent);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .personal-search-button:hover { color: var(--ink); background: var(--paper); }
    .personal-search-button svg { width: 14px; height: 14px; }

    .personal-nav-section { min-width: 0; margin: 0 0 14px; }
    .personal-nav-section > h2 {
      min-height: 23px;
      margin: 0;
      padding: 0 8px;
      color: var(--faint);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 400;
      letter-spacing: .02em;
    }
    .personal-nav-section > h2 a {
      width: 24px;
      height: 23px;
      border-radius: 5px;
      color: var(--faint);
      display: grid;
      place-items: center;
    }
    .personal-nav-section > h2 a:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-nav-section > h2 svg { width: 13px; height: 13px; }
    .personal-primary-nav { gap: 1px; }
    .personal-nav-item {
      min-height: 30px;
      padding: 0 8px;
      border-radius: 6px;
      grid-template-columns: 17px minmax(0, 1fr) auto;
      gap: 7px;
      font-size: 11.5px;
    }
    .personal-nav-item svg { width: 14px; height: 14px; }
    .personal-nav-item.is-current {
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-nav-item.is-planned { opacity: .62; }
    .personal-nav-item.is-planned > small {
      padding: 0;
      color: var(--faint);
      background: transparent;
      font-size: 8.5px;
      font-weight: 400;
    }
    .personal-nav-item > strong {
      min-width: 16px;
      padding: 1px 4px;
      border-radius: 8px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 7%, transparent);
      font-size: 9px;
      text-align: center;
    }

    .personal-project-link {
      min-height: 38px;
      padding: 4px 8px;
      border-radius: 7px;
      grid-template-columns: 17px minmax(0, 1fr) 7px;
      gap: 7px;
    }
    .personal-project-link > svg { width: 14px; height: 14px; }
    .personal-project-link > span { min-width: 0; display: grid; gap: 0; }
    .personal-project-link strong {
      overflow: hidden;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-project-link small { color: var(--faint); font-size: 8.5px; }
    .personal-project-link > i { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
    .personal-project-link.is-current { background: color-mix(in srgb, var(--ink) 4%, transparent); }

    .personal-sidebar-spacer { min-height: 0; }
    .personal-sidebar-footer {
      padding: 8px 0 0;
      border-top: 1px solid var(--line);
    }
    .personal-account {
      min-height: 46px;
      padding: 5px 6px;
      border-radius: 8px;
      color: var(--ink-soft);
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) 26px;
      align-items: center;
      gap: 7px;
      text-decoration: none;
    }
    .personal-account:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-account-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      display: grid;
      place-items: center;
    }
    .personal-account-avatar svg { width: 14px; height: 14px; }
    .personal-account-copy { min-width: 0; display: grid; gap: 1px; }
    .personal-account-copy strong { font-size: 11px; font-weight: 400; }
    .personal-account-copy small { color: var(--faint); display: flex; align-items: center; gap: 5px; font-size: 8.5px; }
    .personal-account-copy small i { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
    .personal-account-settings { width: 26px; height: 26px; border-radius: 6px; color: var(--muted); display: grid; place-items: center; }
    .personal-account:hover .personal-account-settings { color: var(--ink); background: var(--paper); }
    .personal-account-settings svg { width: 14px; height: 14px; }

    body[data-desktop-shell="true"] .topbar {
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .desktop-project-context {
      min-height: 43px;
      gap: 5px;
      color: var(--faint);
      font-size: 10px;
    }
    body[data-desktop-shell="true"] .desktop-project-context > span,
    body[data-desktop-shell="true"] .desktop-project-context > strong {
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-project-context > strong { max-width: min(42vw, 520px); color: var(--ink-soft); font-size: 10.5px; font-weight: 400; }
    body[data-desktop-shell="true"] .desktop-project-context > svg { width: 11px; height: 11px; }
    body[data-desktop-shell="true"] .desktop-project-sync { margin-left: auto; }

    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-column: 2;
      grid-row: 2;
      grid-template-columns: clamp(284px, var(--tree-width, 300px), 320px) 1px minmax(0, 1fr) !important;
      grid-template-rows: 40px minmax(0, 1fr);
      border: 0;
      border-radius: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .tree-resizer { width: 1px; background: var(--line); }
    body[data-desktop-shell="true"] .tree-resizer::after { width: 9px; }
    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: 62px 28px auto minmax(0, 1fr) 30px;
      background: color-mix(in srgb, var(--rail) 80%, var(--page));
    }
    body[data-desktop-shell="true"] .navigator-project {
      min-height: 62px;
      padding: 9px 10px 7px;
      border-bottom: 1px solid var(--line);
      display: grid;
    }
    body[data-desktop-shell="true"] .navigator-project-primary { min-height: 27px; }
    body[data-desktop-shell="true"] .tree-pane > .navigator-project { grid-row: 1; }
    body[data-desktop-shell="true"] .tree-pane > .desktop-pane-header { grid-row: 2; }
    body[data-desktop-shell="true"] .tree-pane > .tree-chrome { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane > .tree-scroll { grid-row: 4; }
    body[data-desktop-shell="true"] .tree-pane > .tree-footer { grid-row: 5; }
    body[data-desktop-shell="true"] .desktop-pane-header--navigator {
      min-height: 28px;
      padding: 0 10px;
      border-bottom: 0;
    }
    body[data-desktop-shell="true"] .tree-chrome { padding: 5px 8px 7px; }
    body[data-desktop-shell="true"] .tree-search { height: 30px; }
    body[data-desktop-shell="true"] .tree-scroll { padding: 4px 8px 12px; }
    body[data-desktop-shell="true"] .tree-footer { min-height: 30px; padding: 0 9px; }
    body[data-desktop-shell="true"] .tree-footer small { display: none; }

    body[data-desktop-shell="true"] .workspace > .workbench-header {
      min-height: 40px;
      padding: 0 14px;
      border-bottom: 1px solid var(--line);
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .workbench-switch { min-height: 31px; }
    body[data-desktop-shell="true"] .workbench-switch button { min-height: 27px; padding-inline: 9px; font-size: 10px; }

    body[data-desktop-shell="true"] .document-pane {
      --focus-canvas-inset: 0px;
      padding: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .goal-document {
      width: 100%;
      min-height: 100%;
      gap: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .goal-hero,
    body[data-desktop-shell="true"] .goal-workspace-panels {
      border: 0;
      border-radius: 0;
      background: var(--paper);
      overflow: visible;
    }
    body[data-desktop-shell="true"] .goal-hero { padding: 15px 22px 0; border-bottom: 1px solid var(--line); }
    body[data-desktop-shell="true"] .goal-header { padding-bottom: 10px; }
    body[data-desktop-shell="true"] .goal-title-kicker { min-height: 20px; margin-bottom: 5px; gap: 10px; }
    body[data-desktop-shell="true"] .goal-title-facts {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--faint);
      font-size: 9px;
    }
    body[data-desktop-shell="true"] .goal-title-facts span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    body[data-desktop-shell="true"] .goal-title-facts svg { width: 10px; height: 10px; }
    body[data-desktop-shell="true"] .goal-title-row { align-items: flex-start; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-row h1 {
      max-width: 30ch;
      font-size: clamp(20px, 1.7vw, 25px);
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    body[data-desktop-shell="true"] .goal-title-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-title-actions .mw-btn { min-height: 28px; }

    body[data-desktop-shell="true"] .goal-brief-grid {
      margin-top: 10px;
      border-top: 1px solid var(--line);
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .goal-brief-item {
      min-width: 0;
      padding: 10px 12px 11px;
      border-left: 1px solid var(--line);
    }
    body[data-desktop-shell="true"] .goal-brief-item:first-child { padding-left: 0; border-left: 0; }
    body[data-desktop-shell="true"] .goal-brief-item h2 {
      margin: 0 0 4px;
      color: var(--faint);
      font-size: 9.5px;
      font-weight: 400;
    }
    body[data-desktop-shell="true"] .goal-brief-item p {
      margin: 0;
      overflow: hidden;
      color: var(--ink-soft);
      display: -webkit-box;
      font-size: 11px;
      line-height: 1.45;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    body[data-desktop-shell="true"] .goal-workspace-panels { padding: 14px 22px 42px; }
    body[data-desktop-shell="true"] .goal-focus-layout { gap: 10px; }
    body[data-desktop-shell="true"] .goal-focus-main { gap: 10px; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context {
      padding: 13px 14px 15px;
      border-radius: 8px;
    }
    body[data-desktop-shell="true"] .goal-now > header h2,
    body[data-desktop-shell="true"] .goal-focus-criteria h2,
    body[data-desktop-shell="true"] .goal-focus-context h2 { font-size: 12px; }
    body[data-desktop-shell="true"] .goal-now-body { margin-top: 7px; }
    body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 14px; line-height: 1.4; }
    body[data-desktop-shell="true"] .goal-now-body p { margin-top: 3px; font-size: 10.5px; }
    body[data-desktop-shell="true"] .goal-now-body small { margin-top: 3px; font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-focus-criteria > header p,
    body[data-desktop-shell="true"] .goal-focus-context > header p { display: none; }
    body[data-desktop-shell="true"] .goal-focus-criteria > ul { margin-top: 8px; }
    body[data-desktop-shell="true"] .goal-focus-criteria li { min-height: 32px; padding: 6px 0; }
    body[data-desktop-shell="true"] .goal-focus-criteria li > span:last-child > strong { font-size: 10.5px; }
    body[data-desktop-shell="true"] .goal-focus-criteria li small { font-size: 9px; }
    body[data-desktop-shell="true"] .goal-focus-criteria > a { margin-top: 8px; font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-focus-context > dl { margin-top: 7px; }
    body[data-desktop-shell="true"] .goal-focus-context dl > div { min-height: 28px; padding: 5px 0; }
    body[data-desktop-shell="true"] .goal-focus-context dt { font-size: 9px; }
    body[data-desktop-shell="true"] .goal-focus-context dd { font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime { padding: 12px; border-radius: 8px; gap: 8px; }
  }

  @container (min-width: 610px) {
    body[data-desktop-shell="true"] .goal-focus-layout {
      grid-template-columns: minmax(0, 1fr) minmax(188px, 218px);
      align-items: start;
      gap: 10px;
    }
  }

  @media (min-width: 761px) and (max-width: 1040px) {
    body[data-desktop-shell="true"] .app { grid-template-columns: 196px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: clamp(250px, var(--tree-width, 272px), 282px) 1px minmax(0, 1fr) !important;
    }
    .personal-sidebar-brand { padding-left: 64px; }
    .personal-nav-item.is-planned > small { display: none; }
    body[data-desktop-shell="true"] .goal-brief-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    body[data-desktop-shell="true"] .goal-brief-item--outcome { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-bottom: 1px solid var(--line); }
  }

`;

