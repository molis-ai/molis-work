/** AP3 visual layer: calm-desktop. */
export const CALM_DESKTOP_STYLES = `  /* Calm Desktop visual replacement. The frame is structural, the Goal is
     the canvas, and hierarchy comes from type, alignment, and proportion. */
  body {
    background: var(--page);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.52;
    letter-spacing: 0;
  }

  body[data-desktop-shell="true"] .app { grid-template-rows: 52px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar,
  .topbar {
    min-height: 52px;
    padding: 0;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    box-shadow: none;
  }
  body[data-desktop-shell="true"] .brand,
  .brand {
    position: static;
    min-width: var(--tree-width, clamp(292px, 24vw, 324px));
    height: 100%;
    padding: 0 18px;
    border-right: 0;
    gap: 8px;
    transform: none;
  }
  body[data-desktop-shell="true"] .brand svg,
  .brand svg { width: 17px; height: 17px; color: var(--ink); }
  body[data-desktop-shell="true"] .brand strong,
  .brand strong { font-size: 14px; font-weight: 400; letter-spacing: -.025em; }
  body[data-desktop-shell="true"] .project-context { display: none; }
  body[data-desktop-shell="true"] .top-action,
  body[data-desktop-shell="true"] .theme-picker > summary,
  .top-action,
  .theme-picker > summary {
    height: 32px;
    margin-right: 10px;
    padding-inline: 10px;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    background: transparent;
    font-size: 11px;
  }
  .top-action:hover,
  a.top-action:hover,
  .theme-picker > summary:hover {
    color: var(--ink);
    background: var(--rail);
  }

  body[data-board-view] .workspace,
  .workspace {
    padding: 0;
    background: var(--paper);
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(0, 1fr);
  }
  body[data-desktop-shell="true"] .workspace.is-desktop-tui {
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(420px, 1fr) 4px var(--tui-width, clamp(400px, 34vw, 560px));
  }
  body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(0, 1fr) 0 0;
  }
  .tree-resizer,
  .tui-resizer { background: var(--line); }
  .tree-resizer::after,
  .tui-resizer::after { inset-inline: 1px; background: transparent; }
  .tree-resizer:hover,
  .tui-resizer:hover { background: var(--blue); }

  body[data-board-view] .tree-pane,
  .tree-pane {
    border: 0;
    border-radius: 0;
    background: var(--rail);
    overflow: hidden;
  }
  body[data-desktop-shell="true"] .tree-pane {
    grid-template-rows: auto 32px auto minmax(0, 1fr) 40px;
  }
  .navigator-project {
    min-height: 94px;
    padding: 13px 14px 11px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: var(--rail);
    gap: 4px;
  }
  .navigator-project-primary {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 6px 8px;
  }
  .navigator-project-primary > strong {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: -.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    background: var(--rail);
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong {
    color: var(--muted);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: .03em;
  }

  .tree-chrome,
  body[data-desktop-shell="true"] .tree-chrome {
    padding: 7px 12px 10px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: var(--rail);
    gap: 7px;
  }
  .tree-search input,
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not(.mw-slider):not(.mw-input):not(.mw-textarea):not(.mw-select):not(.global-search-query),
  textarea:not(.mw-textarea),
  select:not(.mw-select) {
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: none;
  }
  .tree-search input { height: 34px; padding-inline: 31px 45px; }
  .tree-search input::placeholder { color: var(--muted); opacity: 1; }
  .tree-search kbd { color: var(--muted); background: transparent; }
  .navigator-view-switch,
  .workbench-switch {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    gap: 12px;
  }
  .navigator-view-switch button,
  .workbench-switch button {
    position: relative;
    min-height: 28px;
    padding: 0 1px;
    border-radius: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
  }
  .navigator-view-switch button::after,
  .workbench-switch button::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: transparent;
  }
  .navigator-view-switch button.is-active,
  .workbench-switch button.is-active {
    color: var(--ink);
    background: transparent;
    box-shadow: none;
  }
  .navigator-view-switch button.is-active::after,
  .workbench-switch button.is-active::after { background: var(--ink); }
  .tree-tool,
  a.tree-tool {
    width: 27px;
    height: 27px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
  }
  .tree-tool:hover,
  a.tree-tool:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }

  .tree-scroll { padding: 8px 9px 20px; }
  .tree-children { border-left-color: var(--line-strong); }
  .tree-node,
  .navigator-goal-row {
    min-height: 38px;
    border: 0;
    border-radius: 6px;
    background: transparent;
  }
  .tree-node {
    padding: 5px 7px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }
  .tree-node:hover,
  .navigator-goal-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .tree-node.is-selected,
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: var(--nav-active);
    box-shadow: none;
  }
  .tree-copy strong,
  .navigator-goal-copy strong { font-size: 13px; font-weight: 400; line-height: 1.35; letter-spacing: -.008em; }
  .tree-node.is-selected .tree-copy strong,
  .navigator-goal-row.is-selected .navigator-goal-copy strong { font-weight: 400; }
  .tree-node.is-selected .tree-copy small { color: var(--muted); }
  .tree-progress { height: auto; background: transparent; }
  .tree-progress > span { color: var(--muted); background: transparent; font-size: 10px; }
  .tree-progress > i { background: var(--line-strong); }
  .tree-progress > i > b { background: var(--blue); }
  .goal-status { --goal-status-tone: var(--ink-soft); }
  .goal-status,
  body[data-desktop-shell="true"] .goal-status {
    min-height: 22px;
    max-width: 100%;
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
    border-radius: 6px;
    color: var(--goal-status-tone);
    background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.2;
  }
  .goal-status > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .goal-status--clarifying,
  .goal-status--executing,
  .goal-status--reviewing,
  .goal-status--revalidating,
  .goal-status--in_progress { --goal-status-tone: var(--tone-progress, var(--blue)); }
  .goal-status--clarification_pending,
  .goal-status--clarification_decision_pending,
  .goal-status--compound_closure_pending,
  .goal-status--execution_pending,
  .goal-status--continue { --goal-status-tone: var(--tone-idle, var(--ink-soft)); }
  .goal-status--completion_pending,
  .goal-status--review_pending,
  .goal-status--waiting_for_human,
  .goal-status--revalidation_pending,
  .goal-status--waiting_user { --goal-status-tone: var(--tone-attention, var(--amber)); }
  .goal-status--clarification_blocked,
  .goal-status--execution_blocked,
  .goal-status--completion_blocked,
  .goal-status--review_blocked,
  .goal-status--revalidation_blocked,
  .goal-status--invalidated,
  .goal-status--blocked { --goal-status-tone: var(--tone-blocked, var(--red)); }
  .goal-status--waiting_children,
  .goal-status--waiting { --goal-status-tone: var(--tone-hold, var(--ink-soft)); }
  .goal-status--satisfied,
  .goal-status--completed { --goal-status-tone: var(--tone-done, var(--green)); }
  .goal-status--trashed,
  .goal-status--archived { --goal-status-tone: var(--tone-quiet, var(--muted)); }
  .tree-node.is-selected .goal-status { color: var(--goal-status-tone); }
  .tree-relations > summary strong { font-size: 10.5px; }
  .tree-relations > summary em {
    min-height: 19px;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, currentColor 24%, var(--line));
    border-radius: 5px;
    background: color-mix(in srgb, currentColor 6%, var(--rail));
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 400;
  }
  .tree-relations > summary { color: var(--muted); }
  .tree-footer {
    padding: 0 14px;
    border: 0;
    border-top: 1px solid var(--line);
    background: var(--rail);
    color: var(--muted);
  }

  body[data-board-view] .document-pane,
  .document-pane {
    border: 0;
    border-radius: 0;
    background: var(--paper);
    box-shadow: none;
    overflow: auto;
  }

  body[data-desktop-shell="true"] .goal-document,
  .goal-document {
    width: min(100%, 880px);
    margin: 0 auto;
    padding: 44px clamp(42px, 5vw, 66px) 88px;
  }
  body[data-desktop-shell="true"] .goal-header,
  .goal-header { padding-bottom: 24px; border: 0; }
  body[data-desktop-shell="true"] .goal-title-kicker,
  .goal-title-kicker { min-height: 20px; margin: 0 0 8px; }
  .goal-title-kicker .goal-status { color: var(--muted); }
  body[data-desktop-shell="true"] .goal-title-row h1,
  .goal-title-row h1 {
    max-width: 22em;
    margin: 0;
    font-size: clamp(27px, 2.25vw, 34px);
    line-height: 1.2;
    letter-spacing: -.035em;
    font-weight: 400;
  }
  .goal-title-outcome {
    max-width: 68ch;
    margin-top: 12px;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.65;
  }
  .goal-more > summary {
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
  }
  .goal-more > summary:hover { color: var(--ink); background: var(--rail); }

  .goal-focus-outcome,
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  .document-section {
    border-color: var(--line);
    background: transparent;
  }
  .goal-now {
    margin: 8px 0 0;
    padding: 30px 0 32px;
    border: 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    column-gap: 34px;
  }
  body[data-desktop-shell="true"] .goal-now { padding: 30px 0 32px; }
  .goal-now > header {
    grid-column: 1;
    align-self: start;
    display: grid;
    justify-items: start;
    gap: 8px;
  }
  .goal-now > header h2,
  .goal-focus-criteria h2,
  .goal-focus-context h2 {
    margin: 0;
    color: var(--ink);
    font-size: 13px;
    font-weight: 400;
    letter-spacing: -.01em;
  }
  .goal-now-body {
    grid-column: 2;
    margin: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 0;
  }
  .goal-now-body > div { gap: 5px; }
  .goal-now-body > div > strong { font-size: 17px; line-height: 1.35; letter-spacing: -.015em; }
  .goal-now-body p { max-width: 62ch; color: var(--ink-soft); }
  .goal-now-body small { max-width: 68ch; color: var(--muted); line-height: 1.55; }
  .mw-btn--primary {
    min-height: var(--control-h);
    padding-inline: var(--control-pad-x);
    border: 1px solid var(--action) !important;
    border-radius: var(--radius-control) !important;
    background: var(--action) !important;
    color: var(--action-ink) !important;
    box-shadow: none !important;
    font-weight: 400;
  }
  .mw-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--action) 90%, var(--action-ink)) !important;
    color: var(--action-ink) !important;
    opacity: 1;
    transform: none;
  }
  .goal-now-blockers { grid-column: 2; margin-top: 20px; border-top-color: var(--line); }

  .goal-focus-criteria,
  .goal-focus-context {
    padding: 30px 0 32px;
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    column-gap: 34px;
  }
  body[data-desktop-shell="true"] .goal-focus-criteria,
  body[data-desktop-shell="true"] .goal-focus-context { padding: 30px 0 32px; }
  .goal-focus-criteria > header,
  .goal-focus-context > header {
    grid-column: 1;
    align-self: start;
    display: grid;
    gap: 5px;
  }
  .goal-focus-criteria > header p,
  .goal-focus-context > header p { color: var(--muted); font-size: 10.5px; line-height: 1.45; }
  .goal-focus-criteria > header > strong { color: var(--muted); font-size: 11px; }
  .goal-focus-criteria > ul,
  .goal-focus-criteria > .empty-row,
  .goal-focus-criteria > a,
  .goal-focus-context > dl { grid-column: 2; }
  .goal-focus-criteria > ul { margin: 0; }
  .goal-focus-criteria li { padding: 12px 0; border-top: 1px solid var(--line); }
  .goal-focus-criteria li:first-child { border-top: 0; padding-top: 0; }
  .goal-focus-criteria > a { width: fit-content; margin-top: 14px; color: var(--blue-dark); font-size: 11px; font-weight: 400; }
  .goal-focus-context { border-bottom: 0; }
  .goal-focus-context dl {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
  }
  .goal-focus-context dl > div {
    min-height: 46px;
    padding: 9px 0;
    border: 0;
    border-top: 1px solid var(--line);
  }
  .goal-focus-context dl > div:nth-child(-n+2) { border-top: 0; padding-top: 0; }
  .goal-focus-context dt { color: var(--muted); font-size: 10px; }
  .goal-focus-context dd { color: var(--ink); font-size: 12px; font-weight: 400; }

  .tui-pane,
  body[data-board-view] .tui-pane {
    border: 0;
    border-radius: 0;
    background: var(--paper);
    color: var(--ink);
  }
  .tui-owner,
  .tui-tabs {
    background: color-mix(in srgb, var(--paper) 96%, var(--rail));
    border-color: var(--line);
  }
  .tui-tab { color: var(--muted); }
  .tui-tab.is-active { color: var(--ink); background: var(--rail); }
  .tui-stage { background: var(--paper); }
  .tui-parent-guard {
    padding: 14px 2px 16px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    gap: 12px;
  }
  .tui-parent-guard-copy p,
  .tui-child-choices > p,
  .tui-owner-binding,
  .tui-child-choice small,
  .tui-status { color: var(--muted); }
  .tui-owner-copy > strong,
  .tui-parent-guard-copy strong,
  .tui-child-choice strong { color: var(--ink); }
  .tui-child-choices { padding-left: 24px; gap: 0; }
  .tui-child-choice {
    padding: 10px 2px;
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
  }
  .tui-child-choice:hover { border-color: var(--line-strong); background: var(--rail); }
  .tui-chrome button:not(.mw-btn) {
    border-color: var(--line-strong);
    background: var(--paper);
    color: var(--ink-soft);
  }
  .tui-chrome button:not(.mw-btn):hover:not(:disabled) { border-color: var(--line-strong); background: var(--rail); color: var(--ink); }
  .tui-chrome button:not(.mw-btn):disabled { border-color: var(--line); background: transparent; color: var(--faint); }
  .tui-pane[data-tui-read-only="true"] .tui-chrome { opacity: 1; }
  .tui-chrome button:disabled,
  .tui-chrome .tui-advance:disabled {
    border-color: var(--line);
    background: var(--rail);
    color: var(--faint);
  }
  .tui-terminal {
    border-color: var(--terminal-border);
    border-radius: 8px;
    background: var(--terminal);
    color: var(--terminal-ink);
  }
  .tui-empty { color: var(--terminal-muted); }
  .tui-empty strong { color: var(--terminal-ink); }
  .tui-empty-mark { color: var(--terminal-faint); }

  .theme-menu,
  .tui-menu,
  .dialog-shell,
  .runtime-plan-dialog {
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button { border-radius: 6px; }
  .theme-menu button[aria-pressed="true"] { color: var(--ink); background: var(--rail); }

  .settings-shell,
  .settings-content { background: var(--paper); }
  .settings-navigation {
    margin: 0;
    padding: 28px 12px;
    border: 0;
    border-right: 1px solid var(--line);
    border-radius: 0;
    background: var(--rail);
  }
  .settings-navigation a { border-radius: 6px; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .settings-navigation a[aria-current="page"] {
    color: var(--ink);
    background: var(--nav-active);
    box-shadow: none;
  }
  .settings-content,
  .settings-shell--standalone .settings-content {
    margin: 0;
    border: 0;
    border-radius: 0;
    background: var(--paper);
    box-shadow: none;
  }
  .settings-document { width: min(100%, 880px); margin: 0 auto; padding: 52px clamp(38px, 5vw, 64px) 90px; }
  .settings-heading { border-bottom-color: var(--line); }
  .preference-option {
    min-height: 84px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
  }
  .preference-option:hover,
  .preference-option[aria-pressed="true"],
  .preference-option[aria-current="true"] {
    border-color: var(--line-strong);
    color: var(--ink);
    background: var(--rail);
  }
  .preference-option .preference-check { color: var(--ink); }

  .project-index-page { background: var(--page); }
  .project-index-panel {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  html[data-resolved-theme="dark"] .project-index-panel { background: transparent; }
  .project-index-heading { border: 0; }
  .project-index-desktop-note { border: 0; background: transparent; }
  .project-index-note { border: 0; background: transparent; }

  html[data-resolved-theme="dark"] .tree-node.is-selected,
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected,
  html[data-resolved-theme="dark"] .settings-navigation a[aria-current="page"] {
    background: var(--nav-active);
    box-shadow: none;
  }

  @media (min-width: 761px) and (max-width: 1080px) {
    body[data-desktop-shell="true"] .goal-document { padding-inline: 36px; }
    .goal-now,
    .goal-focus-criteria,
    .goal-focus-context { grid-template-columns: 104px minmax(0, 1fr); column-gap: 24px; }
  }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .workspace {
      --tree-width: clamp(276px, 22vw, 304px);
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project { min-height: 82px; padding-block: 9px 8px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-chrome { padding-block: 5px 7px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-search input { height: 30px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-goal-row { min-height: 32px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node { padding-block: 3px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-status {
      min-height: 20px;
      padding-inline: 6px;
      border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
      border-radius: 5px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 10px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status {
      min-height: 20px;
      padding-inline: 6px;
      border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
      border-radius: 5px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > span { display: none; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > i {
      width: 24px;
      height: 2px;
      display: block;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 960px);
      padding: 28px 42px 64px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row h1 { font-size: clamp(24px, 1.9vw, 29px); }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context { padding-block: 22px 24px; }
  }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .app,
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .brand,
    .brand { min-width: 0; padding-inline: 14px; border-right: 0; }
    body[data-board-view] .workspace,
    .workspace { grid-template-columns: 1fr; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tree-pane {
      grid-template-rows: auto auto minmax(0, 1fr) 42px;
    }
    .tree-chrome,
    body[data-desktop-shell="true"] .tree-chrome { align-content: start; }
    .mobile-switch { border-bottom: 1px solid var(--line); background: var(--paper); }
    .mobile-switch button.is-active::after { background: var(--ink); }
    body[data-desktop-shell="true"] .goal-document,
    .goal-document { width: 100%; padding: 24px 20px 60px; }
    body[data-desktop-shell="true"] .goal-title-row h1,
    .goal-title-row h1 { max-width: none; font-size: 23px; }
    .goal-now,
    .goal-focus-criteria,
    .goal-focus-context {
      padding-block: 24px;
      grid-template-columns: 1fr;
      gap: 17px;
    }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context {
      padding: 24px 0;
      border-radius: 0;
      background: transparent;
    }
    .goal-now > header,
    .goal-now-body,
    .goal-now-blockers,
    .goal-focus-criteria > header,
    .goal-focus-criteria > ul,
    .goal-focus-criteria > .empty-row,
    .goal-focus-criteria > a,
    .goal-focus-context > header,
    .goal-focus-context > dl { grid-column: 1; }
    .goal-focus-criteria > header p,
    .goal-focus-context > header p { max-width: 34ch; }
    .goal-focus-context dl { grid-template-columns: 1fr; }
    .goal-focus-context dl > div:nth-child(2) { border-top: 1px solid var(--line); padding-top: 9px; }
    .settings-navigation { margin: 0; padding: 6px 8px; border-right: 0; border-bottom: 1px solid var(--line); }
    .settings-navigation a { min-height: 44px; }
    .settings-document { padding: 30px 20px 64px; }
  }

  @container (max-width: 380px) {
    .tree-node .goal-status { max-width: 112px; }
    .tree-node .goal-status > span { white-space: nowrap; }
  }

  /* Project identity leads; utilities fit the title instead of claiming a row. */
  .navigator-project {
    min-height: 68px;
    padding: 10px 12px 8px;
    gap: 5px;
  }
  .navigator-project-primary {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: 8px;
  }
  html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project {
    min-height: 62px;
    padding-block: 7px 6px;
  }

  /* The overview reads as work first, context second. */
  .goal-focus-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .goal-focus-main,
  .goal-focus-aside { min-width: 0; }
  .goal-now {
    margin: 8px 0 0;
    padding: 20px 22px 22px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 76%, var(--paper));
    display: block;
  }
  body[data-desktop-shell="true"] .goal-now { padding: 20px 22px 22px; }
  .goal-now > header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .goal-now > header h2 { font-size: 12px; color: var(--muted); }
  .goal-now-body {
    margin-top: 13px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .goal-now-body > div > strong { font-size: 16px; }
  .goal-now-body p { margin-top: 4px; }
  .goal-now-body small { margin-top: 5px; }
  .goal-now-blockers {
    grid-column: auto;
    margin: 18px 0 0;
    padding-top: 14px;
  }
  .goal-focus-criteria {
    padding: 27px 0 4px;
    border: 0;
    display: block;
  }
  body[data-desktop-shell="true"] .goal-focus-criteria { padding: 27px 0 4px; }
  .goal-focus-criteria > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .goal-focus-criteria > header p { margin-top: 4px; font-size: 11px; }
  .goal-focus-criteria > ul,
  .goal-focus-criteria > .empty-row,
  .goal-focus-criteria > a { grid-column: auto; }
  .goal-focus-criteria > ul { margin-top: 15px; }
  .goal-focus-criteria li { min-height: 44px; padding: 10px 0; }
  .goal-focus-criteria li > span:last-child > strong { font-size: 12.5px; line-height: 1.45; }
  .goal-focus-criteria li small { margin-top: 2px; font-size: 10.5px; line-height: 1.45; }
  .goal-focus-criteria > a { margin-top: 12px; }
  .goal-focus-aside {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
  }
  .goal-focus-context {
    padding: 0;
    border: 0;
    display: block;
  }
  body[data-desktop-shell="true"] .goal-focus-context { padding: 0; }
  .goal-focus-context > header {
    display: block;
  }
  .goal-focus-context > header p { max-width: 34ch; margin-top: 4px; line-height: 1.45; }
  .goal-focus-context > dl {
    margin-top: 13px;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: 1fr;
  }
  .goal-focus-context dl > div,
  .goal-focus-context dl > div:nth-child(-n+2),
  .goal-focus-context dl > div:nth-child(2) {
    min-height: 36px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
    display: grid;
    grid-template-columns: minmax(72px, 36%) minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
  }
  .goal-focus-context dt { font-size: 10px; }
  .goal-focus-context dd { font-size: 11px; font-weight: 400; text-align: right; }
  body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime,
  .goal-focus-aside .companion-runtime {
    margin-top: 24px;
    padding: 15px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime header small { color: var(--muted); font-size: 9.5px; font-weight: 400; }
  .goal-focus-aside .companion-runtime h2 { margin: 2px 0 0; font-size: 14px; letter-spacing: -.015em; }
  .goal-focus-aside .companion-runtime-state {
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 9.5px;
    font-weight: 400;
    white-space: nowrap;
  }
  .goal-focus-aside .companion-runtime-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .goal-focus-aside .companion-runtime-state.is-active { color: var(--green); }
  .goal-focus-aside .companion-runtime-state.is-active i { background: var(--green); }
  .goal-focus-aside .companion-runtime > p { margin: 0; color: var(--ink-soft); font-size: 10.5px; line-height: 1.5; }
  .goal-focus-aside .companion-runtime-progress { display: flex; align-items: center; gap: 8px; }
  .goal-focus-aside .companion-runtime-progress > i { height: 4px; min-width: 0; flex: 1; border-radius: 2px; background: var(--line); overflow: hidden; }
  .goal-focus-aside .companion-runtime-progress b { width: var(--companion-progress); height: 100%; border-radius: inherit; background: var(--blue); display: block; }
  .goal-focus-aside .companion-runtime-progress span { color: var(--muted); font-size: 9.5px; font-variant-numeric: tabular-nums; }
  .goal-focus-aside .companion-runtime dl {
    margin: 0;
    padding-top: 9px;
    border-top: 1px solid var(--line);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime dl div { display: grid; gap: 2px; }
  .goal-focus-aside .companion-runtime dt { color: var(--muted); font-size: 9px; }
  .goal-focus-aside .companion-runtime dd { margin: 0; color: var(--ink); font-size: 10.5px; font-weight: 400; }
  .goal-focus-aside .companion-runtime > button {
    width: fit-content;
    min-height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: 400 10px/1.2 var(--font);
    cursor: pointer;
  }
  .goal-focus-aside .companion-runtime > button svg { width: 11px; height: 11px; }

  @container (min-width: 720px) {
    .goal-focus-layout {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 250px);
      align-items: start;
      gap: 44px;
    }
    .goal-focus-aside {
      margin-top: 8px;
      padding: 4px 0 0 24px;
      border-top: 0;
      border-left: 1px solid var(--line);
    }
  }

  /* Focus is an inset reading surface; each detail tab shares one section-card grammar. */
  body[data-board-view] .document-pane,
  .document-pane {
    --focus-canvas-inset: clamp(12px, 1.4vw, 20px);
    padding: var(--focus-canvas-inset);
    scroll-padding-top: var(--focus-canvas-inset);
    background: color-mix(in srgb, var(--page) 78%, var(--rail));
  }
  body[data-desktop-shell="true"] .goal-document,
  .goal-document {
    width: min(100%, 1040px);
    min-height: calc(100% - (var(--focus-canvas-inset) * 2));
    margin: 0 auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: visible;
    display: grid;
    align-content: start;
    gap: 14px;
  }
  .goal-hero,
  .goal-workspace-panels {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
    overflow: clip;
  }
  .goal-hero { padding: 34px clamp(30px, 4vw, 52px) 0; }
  .goal-workspace-panels { padding: 26px clamp(30px, 4vw, 52px) 70px; }
  body[data-desktop-shell="true"] .goal-header,
  .goal-header { padding-bottom: 22px; }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 960px);
      padding: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-hero {
      padding: 24px 34px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-panels {
      padding: 20px 34px 56px;
    }
  }

  .focus-panel,
  .goal-factors,
  .goal-technical { padding: 0 0 24px; }
  .focus-panel-heading,
  .goal-factors-heading,
  .goal-technical > header {
    margin: 0 0 14px;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: start;
    gap: 9px;
  }
  .focus-panel-heading > svg,
  .goal-factors-heading > span,
  .goal-technical > header > span:first-child {
    width: 18px;
    height: 18px;
    margin-top: 1px;
    color: var(--muted);
  }
  .focus-panel-heading h2,
  .goal-factors-heading h2,
  .goal-technical > header strong {
    margin: 0;
    color: var(--ink);
    font-size: 15px;
    line-height: 1.35;
    letter-spacing: -.015em;
  }
  .focus-panel-heading p,
  .goal-factors-heading p,
  .goal-technical > header small {
    max-width: 68ch;
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
    font-weight: 400;
  }
  .goal-technical > header > span:nth-child(2) { display: block; }
  .goal-technical-body { padding: 0; }

  .focus-section-deck,
  .focus-section-deck.goal-factor-nav,
  .focus-section-deck.progress-overview {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    display: block;
    overflow: visible;
  }
  .focus-section-card-row {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    align-items: stretch;
    gap: 10px;
  }
  .focus-section-card,
  .focus-section-card.goal-record-section {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
    overflow: clip;
    transition:
      border-color .2s ease,
      background-color .2s ease,
      box-shadow .28s cubic-bezier(.16, 1, .3, 1);
  }
  .focus-section-card.is-active {
    border-color: color-mix(in srgb, var(--blue) 42%, var(--line-strong));
    background: var(--paper);
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--blue) 72%, transparent);
  }
  .focus-section-card-trigger,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 84px;
    padding: 13px;
    border: 0;
    border-right: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ink-soft);
    box-shadow: none;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto auto;
    align-items: start;
    justify-content: stretch;
    gap: 9px;
    text-align: left;
    cursor: pointer;
  }
  .focus-section-card-trigger:hover,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 3.5%, transparent);
  }
  .focus-section-card-trigger:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .focus-section-card-icon {
    width: 18px;
    height: 18px;
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .focus-section-card.is-active .focus-section-card-icon { color: var(--ink); }
  .focus-section-card-icon svg { width: 15px; height: 15px; }
  .focus-section-card-copy { min-width: 0; display: grid; gap: 4px; }
  .focus-section-card-copy strong {
    color: var(--ink);
    font-size: 12px;
    line-height: 1.35;
    font-weight: 400;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .focus-section-card-copy > small {
    max-width: none;
    max-height: none;
    overflow: visible;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.5;
    opacity: 1;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-copy > small {
    min-width: 0;
    width: auto;
    height: auto;
    padding: 0;
    border-radius: 0;
    background: transparent !important;
    color: var(--muted) !important;
    display: block;
    font-size: 10px;
  }
  .focus-section-card-count {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--muted);
    display: inline-grid;
    place-items: center;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-count {
    min-width: 20px;
    width: auto;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 6%, transparent) !important;
    color: var(--muted) !important;
    display: inline-grid;
    place-items: center;
    font-size: 9px;
  }
  .focus-section-card-caret {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    color: var(--muted);
    transition: transform .34s cubic-bezier(.16, 1, .3, 1), color .2s ease;
  }
  .focus-section-card-caret svg { width: 13px; height: 13px; }
  .focus-section-card.is-active .focus-section-card-caret { color: var(--ink); transform: rotate(90deg); }

  /* Relations read as records, not a pile of pills. */
  .focus-section-card-reveal .relation-layout {
    border-color: var(--line);
    border-radius: 10px;
    background: var(--paper);
    overflow: hidden;
  }
  .focus-section-card-reveal .relation-group { border-color: var(--line); }
  .focus-section-card-reveal .relation-group > header {
    min-height: 48px;
    padding: 12px 14px;
    border-color: var(--line);
    background: color-mix(in srgb, var(--rail) 64%, var(--paper));
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .focus-section-card-reveal .relation-group h3 {
    flex: 0 0 auto;
    margin: 0;
    color: var(--ink);
    font-size: 12px;
    line-height: 1.4;
  }
  .focus-section-card-reveal .relation-group h3 span {
    margin-left: 2px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .focus-section-card-reveal .relation-group > header p {
    min-width: 0;
    margin: 0;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-group > div { padding: 0 12px; }
  .focus-section-card-reveal .relation-group .empty-row {
    margin: 0;
    padding: 13px 2px 14px;
    color: var(--faint);
    font-size: 11px;
  }
  .focus-section-card-reveal .relation-record {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    border-color: var(--line);
  }
  .focus-section-card-reveal .relation-row {
    width: 100%;
    min-width: 0;
    padding: 14px 8px 14px 2px;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto 16px;
    align-items: start;
    justify-content: stretch;
    gap: 12px;
    border-radius: 0;
    color: var(--ink-soft);
    white-space: normal;
  }
  .focus-section-card-reveal .relation-row:hover {
    background: var(--nav-hover);
  }
  .focus-section-card-reveal .relation-kind {
    width: fit-content;
    max-width: 54px;
    margin-top: 1px;
    padding: 2px 7px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 74%, var(--paper));
    color: var(--muted);
    font-size: 9px;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .focus-section-card-reveal .relation-heading {
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .focus-section-card-reveal .relation-heading strong {
    min-width: 0;
    color: var(--ink);
    font-size: 12px;
    line-height: 1.45;
    font-weight: 400;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy :is(.relation-goal-id, .relation-path, .relation-reason) {
    width: auto;
    min-width: 0;
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent !important;
    color: var(--muted);
    display: block;
    font-size: 10px;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy .relation-goal-id {
    color: var(--faint);
    font-size: 9px;
    letter-spacing: .02em;
  }
  .focus-section-card-reveal .relation-copy .relation-path { color: var(--ink-soft); }
  .focus-section-card-reveal .relation-state {
    margin-top: 1px;
    padding: 2px 7px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: transparent;
    font-size: 9px;
    line-height: 1.35;
    white-space: nowrap;
  }
  .focus-section-card-reveal .relation-row > svg {
    width: 14px;
    height: 14px;
    margin-top: 2px;
  }
  .focus-section-card-reveal .relation-deactivate-open {
    align-self: stretch;
    min-width: 48px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-left: 1px solid var(--line);
    border-radius: 0;
    color: var(--muted);
    background: transparent;
    font-size: 10px;
    justify-content: center;
  }
  .focus-section-card-reveal .relation-deactivate-open:hover {
    border-color: var(--line);
    color: var(--red);
    background: var(--red-soft);
  }
  .focus-section-card-reveal .relation-deactivate-form {
    margin: 0 0 12px;
    border-radius: 8px;
  }
  .focus-section-stage {
    width: 100%;
    min-width: 0;
    margin-top: 12px;
    display: grid;
    align-items: start;
  }
  .focus-section-card-reveal {
    min-width: 0;
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    clip-path: inset(0 0 10% 0 round 12px);
    transform: translateY(10px);
    border-radius: 12px;
    background: transparent;
    box-shadow: inset 0 0 0 1px transparent;
    transition:
      grid-template-rows .52s cubic-bezier(.16, 1, .3, 1),
      opacity .28s ease,
      clip-path .52s cubic-bezier(.16, 1, .3, 1),
      transform .46s cubic-bezier(.16, 1, .3, 1),
      background-color .28s ease,
      box-shadow .28s ease,
      visibility 0s linear .52s;
  }
  .focus-section-card-reveal.is-active {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    clip-path: inset(0 0 0 0);
    transform: translateY(0);
    background: color-mix(in srgb, var(--rail) 46%, var(--paper));
    box-shadow: inset 0 0 0 1px var(--line);
    transition-delay: .03s, .1s, .03s, .03s, .03s, .03s, 0s;
  }
  .focus-section-card-content {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 0 20px;
    color: var(--ink-soft);
    transition: padding .42s cubic-bezier(.16, 1, .3, 1);
  }
  .focus-section-card-reveal.is-active .focus-section-card-content { padding: 22px 22px 24px; }
  .focus-section-card-content > :first-child { margin-top: 0; }
  .focus-section-card-content > :last-child { margin-bottom: 0; }
  .focus-section-card-reveal .goal-purpose,
  .focus-section-card-reveal .goal-edit-disclosure,
  .focus-section-card-reveal .child-progress,
  .focus-section-card-reveal .document-subsection,
  .focus-section-card-reveal .progress-overview,
  .focus-section-card-reveal .goal-technical-body { margin-left: 0; padding-left: 0; }
  .focus-section-card-reveal .document-subsection { margin-top: 15px; }
  .focus-section-card-reveal .document-subsection:first-child { margin-top: 0; }
  .focus-section-card-reveal .progress-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .focus-section-card.goal-record-section { border-bottom: 1px solid var(--line); }
  .focus-section-card-reveal.goal-record-section { border-bottom: 0; }
  .goal-factor-panel .focus-section-card-content > header,
  .focus-section-card-content > .goal-factor-panel > header,
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header { margin: 0 0 14px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header h3 { margin: 0; font-size: 14px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header p { margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .goal-record-section .focus-section-card-content > section { padding-top: 15px; }
  .goal-record-section .focus-section-card-content > section > h3 { margin: 0 0 10px; font-size: 13px; }

  /* Overview regions share the same quiet spacing as the detail decks. */
  .goal-focus-layout { gap: 12px; }
  .goal-focus-main { display: grid; gap: 12px; }
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  body[data-desktop-shell="true"] .goal-now,
  body[data-desktop-shell="true"] .goal-focus-criteria,
  body[data-desktop-shell="true"] .goal-focus-context {
    margin: 0;
    padding: 19px 20px 21px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 62%, var(--paper));
  }
  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context {
      padding: 14px 18px 16px;
    }
  }
  .goal-focus-aside {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    align-content: start;
    gap: 12px;
  }
  body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime,
  .goal-focus-aside .companion-runtime { margin: 0; background: color-mix(in srgb, var(--rail) 62%, var(--paper)); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-empty,
    .impact-empty,
    .risk-create,
    .impact-create,
    .impact-history,
    .risk-record,
    .impact-record,
    .risk-actions,
    .impact-actions,
    .risk-goal-picker,
    .policy-scope-note,
    .scope-gaps,
    .scope-gaps > .contract-list
  ) { background: var(--rail); color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-form,
    .risk-state-form,
    .impact-form,
    .impact-deactivate form
  ) { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-form input:not([type=checkbox]),
    .risk-form textarea,
    .risk-form select,
    .risk-state-form textarea,
    .risk-state-form select,
    .impact-form input,
    .impact-form textarea,
    .impact-form select,
    .impact-deactivate textarea
  ) { border-color: var(--line-strong); background: var(--page); color: var(--ink); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(.risk-effect, .risk-state-preview, .impact-effect) {
    background: var(--nav-hover);
    color: var(--ink-soft);
  }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(.risk-actions, .impact-actions, .risk-create, .impact-create, .impact-history) summary:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .focus-section-card-reveal .full-records > summary {
    background: color-mix(in srgb, var(--rail) 78%, var(--paper));
    color: var(--muted);
  }
  .focus-section-card-reveal .full-records > summary:hover {
    background: color-mix(in srgb, var(--ink) 5%, var(--rail));
  }
  @container (min-width: 720px) {
    .goal-focus-layout { gap: 14px; }
    .goal-focus-aside { margin: 0; padding: 0; border: 0; }
  }

  @container (max-width: 700px) {
    .focus-section-card-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .focus-section-card-trigger,
    .focus-section-deck.goal-factor-nav .focus-section-card-trigger {
      min-height: 72px;
      grid-template-columns: 18px minmax(0, 1fr) auto auto;
      align-items: start;
    }
    .focus-section-card-reveal .progress-facts,
    .technical-meta { grid-template-columns: 1fr; }
    .focus-section-card-reveal.is-active .focus-section-card-content { padding: 18px 18px 21px; }
    .focus-section-card-reveal .relation-row {
      grid-template-columns: 50px minmax(0, 1fr) auto 14px;
      gap: 9px;
    }
    .focus-section-card-reveal .relation-group > div { padding-inline: 10px; }
  }

  @container (max-width: 430px) {
    .focus-section-card-row { grid-template-columns: minmax(0, 1fr); }
    .focus-section-card-reveal .relation-record { grid-template-columns: minmax(0, 1fr); }
    .focus-section-card-reveal .relation-row {
      padding-right: 2px;
      grid-template-columns: 48px minmax(0, 1fr) auto;
    }
    .focus-section-card-reveal .relation-row > svg { display: none; }
    .focus-section-card-reveal .relation-deactivate-open {
      min-height: 34px;
      border-top: 1px solid var(--line);
      border-left: 0;
      justify-content: flex-end;
    }
  }

  @media (max-width: 760px) {
    body[data-board-view] .document-pane,
    .document-pane { --focus-canvas-inset: 8px; }
    body[data-desktop-shell="true"] .goal-document,
    .goal-document { padding: 0; border-radius: 0; gap: 12px; }
    .goal-hero { padding: 25px 18px 0; border-radius: 12px; }
    .goal-workspace-panels { padding: 20px 18px 56px; border-radius: 12px; }
  }

`;

