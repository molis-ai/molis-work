import { renderMenuMotion } from "./motion.js";
import { WORKBENCH, SHELL, ASSIST, PAGES, STAGE_LIST, STAGE_OPEN, CENTRED_DIALOG } from "./craft-finish-selectors.js";

/** The finish layer, third part: the phone bar, project menu, directories, controls, overlays, plugin pages and the reduced-motion rule. */
export const CRAFT_PAGES_STYLES = `  /* A phone: two rows at the foot, the Assistant line first, then the Dock and the project (a plugin's own list opens
     in a drawer from the button left of the project). */
  @media (max-width: 600px) {
    ${SHELL} { --plugin-rail-width: 0px; --workspace-chrome-height: 0px; --assistant-island-row: 0px; --dock-h: 116px; --composer-h: 50px; }
    ${SHELL} .immersive-workspace,
    ${SHELL} .immersive-workspace.is-directory-collapsed,
    ${SHELL} .immersive-workspace.is-plugin-directory-empty { grid-template-rows: auto 0 0 minmax(0, 1fr) auto; }
    ${SHELL} .workbench-bar {
      z-index: 45; grid-row: 5; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 58px 50px; gap: 0 4px;
      padding: 4px 8px max(8px, env(safe-area-inset-bottom));
    }
    ${SHELL} .bar-center { grid-column: 1 / -1; grid-row: 1; align-self: center; }
    ${SHELL} .bar-start { grid-column: 1; grid-row: 2; }
    html ${SHELL} .workbench-bar .bar-end { grid-column: 2; grid-row: 2; justify-self: end; }
    ${SHELL} .dock-pins { gap: 0; margin-left: 0; }
    ${SHELL} .dock-pins::before { left: -1px; }
    ${SHELL} .dock-pin.is-fixed { margin-right: 0; }
    ${SHELL} .dock-pin.is-fixed:not(:only-child)::before { right: -1px; }
    html ${SHELL} .workbench-bar :is(.bar-start, .bar-end, .bar-side) { gap: 0; }
    ${SHELL} .plugin-picker-trigger { max-width: 132px; }
    html ${SHELL} .immersive-workspace > .tree-pane,
    html ${SHELL} .immersive-sidebar-scrim:not([hidden]) { bottom: var(--dock-h); }
    html ${SHELL} .immersive-workspace:not(.is-plugin-directory-empty) .workbench-bar .bar-end .immersive-show-directory,
    html ${SHELL} .is-directory-drawer-open .workbench-bar .bar-end .navigator-directory-toggle {
      display: inline-grid !important; place-items: center; order: -1; width: var(--dock-btn); min-width: var(--dock-btn); height: var(--dock-btn); min-height: var(--dock-btn); padding: 0; border: 0; border-radius: 11px;
      background: transparent; box-shadow: none; color: var(--ink-soft);
    }
    /* While the drawer is open only its close toggle shows (the same weight as the rule above, so it wins by order). */
    html ${SHELL} .immersive-workspace.is-directory-drawer-open .workbench-bar .bar-end .immersive-show-directory { display: none !important; }
    html ${SHELL} .workbench-bar .bar-end :is(.immersive-show-directory, .navigator-directory-toggle) svg { width: 20px; height: 20px; stroke-width: 1.6; }
    html ${SHELL} .workbench-bar .bar-end :is(.immersive-show-directory, .navigator-directory-toggle):hover { background: var(--nav-hover); color: var(--ink); }
    html ${SHELL} .workbench-bar .plugin-picker-popover { position: fixed; left: 10px; right: 10px; bottom: calc(var(--dock-h) + 6px); width: auto; }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { grid-template-columns: minmax(0, 1fr); }
    html ${SHELL} .workbench-bar .plugin-picker-head .plugin-picker-search { flex-basis: 100%; height: 44px; }
    html ${SHELL} .workbench-bar .plugin-picker-extend { flex: 1 1 100%; }
    html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-picker-extend-btn { flex: 1 1 0; justify-content: center; }
    ${SHELL} .assistant-panel { position: fixed; left: 10px; right: 10px; bottom: calc(var(--dock-h) + 6px + var(--next-row, 0px) + var(--context-row, 0px)); width: auto; height: min(70dvh, 560px); }
    /* The next steps' band, from the panel's edge down to the input, is the bar's own ground: the page does not show between the steps. */
    ${ASSIST} .bar-center > .assistant-next-row { inset: auto -8px 100%; max-width: none; padding: 8px 8px 6px; background: var(--desk); }
    ${ASSIST} .bar-center > .assistant-context-strip { inset: auto -8px calc(100% + var(--next-row, 0px)); max-width: none; padding: 6px 8px 0; background: var(--desk); }
    ${SHELL} .account-global-popover { position: fixed; left: 10px; bottom: calc(var(--dock-h) + 6px); width: min(300px, calc(100vw - 20px)); }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover { position: fixed; right: 10px; left: auto; bottom: calc(var(--dock-h) + 6px); }
    /* The composer row carries the Assistant's own choosers; on a phone they stay compact, and typing gives the input the row. */
    ${SHELL} .bar-start .plugin-picker { max-width: none; padding-right: 0; }
    ${SHELL} .bar-start .plugin-picker-trigger { padding: 0 8px; }
    /* On a phone the Dock beside it already shows where you are: the switcher is the door to all plugins. */
    ${SHELL} .bar-start .plugin-picker-current, ${SHELL} .bar-start .plugin-picker-trigger > svg:last-child { display: none; }
    ${SHELL} .bar-start .plugin-picker-all { display: inline-grid; place-items: center; color: var(--ink-soft); }
    /* On a phone the panel spans the screen: the side pane covers the whole conversation when opened; tabs scroll. */
    ${ASSIST} .assistant-panel[data-layout="drawer"] .assistant-side { width: 100%; box-shadow: none; }
    /* Only the current tab shows by name; the others are one tap away in 全部工作, where their marks are too. */
    ${ASSIST} .assistant-tab:not([data-current]) { display: none; }
    ${ASSIST} .assistant-tabs { flex: 1 1 auto; }
    ${ASSIST} .assistant-tab[data-current] { flex: 1 1 auto; width: auto; }
    /* On a phone the chips sit compact beside a tappable input; while typing, the input takes the whole bar. */
    ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 64px; min-width: 64px; }
    ${ASSIST} .assistant-executor { flex: 0 1 auto; max-width: 64px; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
    ${ASSIST} .assistant-executor > svg { display: none; }
    /* One chooser beside the input: the Character shows while the panel is open or once chosen, and then replaces the executor. */
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
    /* Only while typing: focusing the switcher or a chip must keep it on screen. */
    ${SHELL} .bar-composer:has(.assistant-composer-input:focus):not([data-measuring]) :is(.assistant-target, .assistant-executor, .assistant-attention) { display: none; }
  }

  /* Prompt 与 Character settings: grouped by source, each prompt expandable to edit, the default beside the person's version. */
  .prompt-settings-notice { margin: 0 0 16px; padding: 12px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 13px; }
  .prompt-settings-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }
  .prompt-settings-search { flex: 1 1 220px; min-width: 0; }
  .prompt-group-title { margin: 0 0 8px; font-size: 15px; }
  .prompt-roles-label { margin: 0 0 4px; font-size: 12px; color: var(--muted); }
  .prompt-roles { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .prompt-role { display: inline-flex; flex-direction: column; align-items: flex-start; padding: 4px 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; box-shadow: 0 0 0 1px var(--line); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .prompt-role:hover { background: var(--nav-hover); }
  .prompt-role[aria-pressed="true"] { box-shadow: 0 0 0 1.5px var(--accent); }
  .prompt-role-focus { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 16px; padding: 12px 12px; border-radius: 8px; background: var(--nav-hover); font-size: 13px; }
  .prompt-role-focus p { margin: 4px 0 0; color: var(--muted); }
  .prompt-diagnostics { margin-top: 24px; }
  .prompt-diagnostics > summary { display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
  .prompt-diagnostics-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .prompt-diagnostics-owner { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .prompt-diagnostics-issues { margin: 4px 0 0; padding-left: 16px; font-size: 12px; }
  .prompt-diagnostics-issue--warning { color: var(--tone-attention, var(--amber)); }
  .prompt-diagnostics-issue--info { color: var(--muted); }
  .prompt-diagnostics-heading { margin: 16px 0 0; font-size: 13px; font-weight: 500; }
  .prompt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .prompt-row { padding: 8px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  .prompt-row-head { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; }
  .prompt-row-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .prompt-row-copy > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .prompt-row-meta { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .prompt-tag, .prompt-state { font-size: 11px; padding: 1px 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); color: var(--muted); white-space: nowrap; }
  .prompt-state--user { color: var(--ink); background: var(--nav-active); }
  .prompt-state--updated { color: var(--warning, #b7791f); }
  .prompt-editor { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .prompt-editor-text { width: 100%; font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; line-height: 1.55; }
  .prompt-editor-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .prompt-editor-count { margin-left: auto; font-size: 11px; }
  .prompt-default summary, .prompt-history summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .prompt-default-text { max-height: 260px; overflow: auto; margin: 8px 0 0; padding: 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); white-space: pre-wrap; font-size: 12px; }
  .prompt-history-list { margin: 8px 0 0; padding-left: 16px; font-size: 12px; color: var(--ink-soft); }
  @media (max-width: 600px) { .prompt-row-head { grid-template-columns: minmax(0, 1fr); } .prompt-row-meta { justify-content: flex-start; } }

  /* The project is its own mark: a letter on the copper of the brand (one hue for every project; the letter tells them apart). */
  .project-monogram {
    --mono: var(--accent);
    display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 6px;
    background: var(--mono); color: var(--on-accent); font-size: 12px; font-weight: 600; line-height: 1; letter-spacing: 0;
  }
  html[data-resolved-theme="dark"] .project-monogram { --mono: color-mix(in srgb, var(--accent) 62%, var(--desk)); }
  ${SHELL} .workspace-chrome .navigator-project-selector { place-items: center; justify-content: center; }
  ${SHELL} .workspace-chrome .navigator-project-selector > svg:first-child:not(:only-child) { display: none; }
  ${SHELL} .workspace-chrome .navigator-project-selector:hover { background: var(--nav-hover); }
  ${SHELL} .workspace-chrome .navigator-project-menu[open] .navigator-project-selector { background: var(--nav-active); }
  .navigator-project-option .project-monogram { width: 18px; height: 18px; border-radius: 5px; font-size: 11px; }

  /* Rail tooltip, drawn once in the page so scrolling columns cannot clip it. */
  .craft-tip {
    position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none;
    padding: 4px 8px; border-radius: 6px; background: var(--tip-bg); color: var(--tip-ink);
    font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; letter-spacing: 0;
    box-shadow: var(--lift-1);
    opacity: 0; transform: translate(var(--tip-x, 0), var(--tip-y, 0)) translateY(4px); transform-origin: bottom center;
    transition: opacity var(--dur-press) var(--ease-quint), transform var(--dur-press) var(--ease-quint);
  }
  .craft-tip[data-shown] { opacity: 1; transform: translate(var(--tip-x, 0), var(--tip-y, 0)); }
  .craft-tip[data-cut] { width: max-content; max-width: min(420px, calc(100vw - 12px)); white-space: normal; overflow-wrap: anywhere; }
  .craft-tip kbd { margin-left: 8px; padding: 0 4px; border-radius: 4px; background: color-mix(in srgb, var(--tip-ink) 16%, transparent); color: inherit; font: inherit; font-size: 11px; opacity: .8; }

  /* ─── Directory: rows on the desk; the selected one takes the neutral selection fill ── */
  ${SHELL} .tree-pane :is(.mw-dir-row, .directory-list-row, .tree-node, .source-list-item) {
    border-radius: var(--r-row);
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${SHELL} .tree-pane :is(.mw-dir-row, .directory-list-row, .tree-node, .source-list-item):active:not(:disabled) { background: var(--nav-press); }
  ${SHELL} .tree-pane :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .source-list-item.is-selected) {
    background: var(--nav-active); box-shadow: none; color: var(--ink);
  }
  ${SHELL} .tree-pane .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])) { background: var(--nav-active); box-shadow: none; border-radius: var(--r-row); }
  ${SHELL} .tree-pane .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])) :is(.mw-dir-row, .directory-list-row) { background: transparent; box-shadow: none; }
  ${SHELL} .tree-pane .directory-list-row.is-selected :is(.tree-node, .tree-row) { background: transparent; }
  /* A row's leading glyph names what it is, so it stays neutral; status keeps its own mark. */
  ${SHELL} .tree-pane .mw-dir-row__icon { color: var(--muted); }
  ${SHELL} .tree-pane :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"]) .mw-dir-row__icon { color: var(--ink); }
  ${SHELL} .tree-resizer::after { transition: opacity var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  ${SHELL} .tree-resizer:is(:hover, :focus-visible, .is-dragging, [data-dragging])::after { background: var(--focus); opacity: .7; }

  /* ─── Controls ─── */
  ${PAGES} .mw-btn {
    transition:
      background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint),
      border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint),
      transform var(--dur-move) var(--ease-spring), opacity var(--dur-hover) var(--ease-quint);
    will-change: auto;
  }
  ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .home-shortcut-main, .plugin-market-project-trigger):active:not(:disabled, [aria-disabled="true"], [aria-expanded="true"], [aria-haspopup]) {
    transform: scale(.97); filter: none; transition-duration: var(--dur-press);
  }
  /* Buttons: graphite primary with a small soft shadow; secondary is a wash with no outline; quiet is text. */
  ${PAGES} .mw-btn--primary { background-image: none; }
  ${PAGES} .mw-btn--secondary:not(:disabled) { box-shadow: none; border-color: transparent; }
  ${PAGES} .mw-btn--secondary:hover:not(:disabled) { box-shadow: none; border-color: transparent; background-color: var(--nav-hover); }
  ${WORKBENCH} .plugin-stage-chrome .tree-create,
  ${WORKBENCH} .goal-stage-chrome .tree-create {
    border-color: transparent; background: var(--control-fill); box-shadow: none;
  }
  ${WORKBENCH} :is(.plugin-stage-chrome, .goal-stage-chrome) .tree-create:hover { border-color: transparent; background: var(--nav-hover); box-shadow: none; }
  /* The Goals directory's create action is that page's one graphite button, like every other list page's first create. */
  ${WORKBENCH} .tree-chrome .tree-create { border-color: transparent; box-shadow: none; background: var(--action); color: var(--action-ink); }
  ${WORKBENCH} .tree-chrome .tree-create svg { color: currentColor; }
  ${WORKBENCH} .tree-chrome .tree-create:hover { background: var(--action-hover, color-mix(in srgb, var(--action) 90%, var(--action-ink))); }
  ${PAGES} .mw-btn:disabled, ${PAGES} .mw-btn[aria-disabled="true"] { box-shadow: none; background-image: none; }

  /* Segmented controls: the thumb settles on a spring; slots brighten on hover. */
  ${PAGES} .mw-toggle-group[data-seg-thumb]::before { border-radius: 6px; background: var(--paper); box-shadow: var(--lift-1); transition-timing-function: var(--ease-quint); }
  ${PAGES} .mw-toggle-group > .mw-toggle:not(.is-current, [aria-pressed="true"], [aria-current]):hover { color: var(--ink); }
  ${PAGES} .mw-toggle svg { transition: transform var(--dur-move) var(--ease-spring); }

  /* Fields: the edge darkens and a soft copper halo sits around the one you are writing in. */
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select, .mw-input-group) {
    transition: border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint);
  }
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select):not([data-plain-field], .mw-input-group *):focus-visible,
  ${PAGES} .mw-input-group:focus-within {
    /* The edge is full copper so the focused field reads at 3:1 or better against its surface; the halo only softens it; a grouped field gets it on its group. */
    outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
  }
  ${PAGES} [data-plain-field]:focus-visible { box-shadow: inset 0 -2px 0 var(--focus); }

  /* Check and switch: the tick draws itself; the knob lands on a spring. */
  ${PAGES} .mw-check, ${PAGES} .mw-radio { transition: background-color var(--dur-hover) var(--ease-quint), border-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  ${PAGES} .mw-check:active:not(:disabled), ${PAGES} .mw-radio:active:not(:disabled) { transform: scale(.86); }
  ${PAGES} .mw-check:checked::after { animation: craft-tick 250ms var(--ease-quint) both; transform-origin: 30% 70%; }
  ${PAGES} .mw-radio:checked::after { animation: craft-pop 250ms var(--ease-spring) both; }
  @keyframes craft-tick { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes craft-pop { from { transform: scale(.2); opacity: 0; } to { transform: none; opacity: 1; } }
  ${PAGES} .mw-switch__track::after { transition: transform 250ms var(--ease-spring), background-color var(--dur-hover) var(--ease-quint); }
  ${PAGES} .mw-switch input:active:not(:disabled) + .mw-switch__track::after { width: 17px; }
  ${PAGES} .mw-switch input:checked:active:not(:disabled) + .mw-switch__track::after { transform: translateX(11px); }

  /* Disclosure chevrons turn on the same curve everywhere. */
  ${PAGES} :is(.mw-disclosure, details > summary) > svg:is(:first-child, :last-child) { transition: transform var(--dur-move) var(--ease-quint); }

  /* ─── Overlays ─── */
  /* Creating a Goal is writing: two borderless lines; focus draws a pen line under the one you are on. */
  :root ${WORKBENCH} dialog[data-create-dialog] .create-compose :is(.create-compose-title, .create-compose-outcome) {
    border: 0; border-radius: 6px 6px 0 0; box-shadow: none; background: transparent;
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint);
  }
  :root ${WORKBENCH} dialog[data-create-dialog] .create-compose :is(.create-compose-title, .create-compose-outcome):is(:focus, :focus-visible) {
    background: color-mix(in srgb, var(--ink) 3%, transparent); box-shadow: inset 0 -2px 0 var(--focus); outline: none;
  }
  ${PAGES} dialog.mw-dialog:not(.mw-sheet) { border-radius: var(--r-dialog); box-shadow: var(--lift-3); }
  ${PAGES} dialog.mw-sheet[open] { animation: craft-sheet-in 420ms var(--ease-quint); }
  ${PAGES} dialog.mw-sheet[open]::backdrop { animation: craft-fade-in 250ms var(--ease-quint); }
  /* Leaving mirrors arriving: a closing sheet slides back instead of vanishing (centred dialogs: coss-controls). */
  ${PAGES} dialog.mw-sheet {
    transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint), overlay var(--dur-move) allow-discrete, display var(--dur-move) allow-discrete;
  }
  ${PAGES} dialog.mw-sheet:not([open]) { opacity: 0; transform: translateX(32px); }
  ${PAGES} dialog.mw-sheet::backdrop { transition: opacity var(--dur-move) var(--ease-quint), overlay var(--dur-move) allow-discrete, display var(--dur-move) allow-discrete; }
  ${PAGES} dialog.mw-sheet:not([open])::backdrop { opacity: 0; }
  /* A tab switch: the current tab's paper settles in; the pane's content comes up with a short fade. */
  ${WORKBENCH} .tab-item { transition: background-color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  ${WORKBENCH} iframe.tab-content-frame:not([hidden]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint) both; }
  /* A disclosure the person opens (never one rendered open) lets its content settle in. */
  ${PAGES} details[data-just-opened] > :not(summary) { animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  ${WORKBENCH} .immersive-home .home-erow__slot[data-just-opened] { animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  @keyframes craft-sheet-in { from { opacity: 0; transform: translateX(48px); } to { opacity: 1; transform: none; } }
  ${renderMenuMotion(PAGES)}
  ${PAGES} :is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover) { border: 0; border-radius: var(--r-card); box-shadow: var(--lift-3); }
  /* Dark reads as three layers: whatever floats (menus, popovers, dialogs, the Assistant panel) sits a step above the
     work surface on --popover, edged by the light ring in its lift rather than by a darker shadow. */
  html[data-resolved-theme="dark"] ${PAGES} :is(.mw-menu, .mw-popover, .navigator-project-menu-popover, .plugin-market-project-popover,
    .tree-filter, .feed-filter-panel, .source-filter-menu > .source-filter-row, .tui-menu,
    [data-plugin-picker-popover], .account-global-popover, .shelf-side-menu, .shelf-find, .feed-source-rail, ${CENTRED_DIALOG},
    dialog.mw-sheet, .assistant-panel) { background-color: var(--popover); }
  ${PAGES} .mw-menu :is([role="menuitem"], [role="option"], button) { transition: background-color 130ms var(--ease-quint), color 130ms var(--ease-quint); }

  /* The Workbench's toast element is the one toast (.mw-toast, primitives) kept on the page: shown by is-visible, it rises in
     on the move clock and leaves on the short one; a failure nudges once after it lands. */
  ${PAGES} .toast { animation: none; opacity: 0; transform: translateY(12px) scale(.97); pointer-events: none;
    transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-hover) var(--ease-quint); }
  ${SHELL} .toast { bottom: calc(var(--dock-h) + 14px); }
  ${PAGES} .toast:not(.is-visible) > .mw-state-ring { visibility: hidden; }
  ${PAGES} .toast.is-visible { opacity: 1; transform: none; transition-duration: var(--dur-move); }
  ${PAGES} .toast.is-visible.is-error { animation: mw-toast-nudge var(--dur-arrive) var(--ease-quint) var(--dur-hover); }

  /* ─── Plugin stage: an empty plugin is a calm centred invitation, not a note in the corner ── */
  ${WORKBENCH} .plugin-stage-list > .mw-empty,
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child {
    display: grid; justify-items: center; align-content: center; gap: 0; box-sizing: border-box;
    width: 100%; max-width: 440px; min-height: calc(100% - 24px); margin: 0 auto; padding: 48px 24px 64px; text-align: center;
  }
  /* Empty states draw one picture everywhere: the plugin's glyph on a sheet of paper lying across another,
     the Home card's papers in miniature. No plugin draws its own illustration. */
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark) {
    position: relative; isolation: isolate; display: grid; place-items: center; box-sizing: border-box; flex: none;
    width: 56px; height: 56px; margin: 0 0 16px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--ink-soft);
  }
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark)::before,
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark)::after {
    content: ""; position: absolute; left: 9px; top: 4px; width: 36px; height: 46px; border-radius: 6px;
  }
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark)::after {
    z-index: 0; background: var(--surface-soft); box-shadow: 0 0 0 1px var(--line); transform: translate(8px, 2px) rotate(9deg);
  }
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark)::before {
    z-index: 1; transform: rotate(-4deg); box-shadow: 0 0 0 1px var(--line), var(--lift-1);
    background: linear-gradient(var(--line) 0 0) 8px 30px / 18px 2px no-repeat, linear-gradient(var(--line) 0 0) 8px 36px / 12px 2px no-repeat, var(--popover);
  }
  ${PAGES} :is(.mw-empty__mark, .tui-empty-mark, .coding-start-mark) > svg {
    position: relative; z-index: 2; width: 20px; height: 20px; stroke-width: 1.6; transform: translate(-1px, -8px) rotate(-4deg); color: var(--ink-soft);
  }
  /* A list that could not be read uses the same picture, marked in the error colour, and always offers Retry. */
  ${PAGES} .mw-empty--error .mw-empty__mark > svg { color: var(--red); }
  ${PAGES} .mw-empty--error { padding: 32px 16px; gap: 0; justify-items: center; text-align: center; }
  ${PAGES} .mw-empty--error > strong { margin: 0 0 4px; font-size: 15px; font-weight: var(--weight-title, 600); color: var(--ink); }
  ${PAGES} .mw-empty--error > p { margin: 0 0 16px; max-width: 34em; color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
  ${WORKBENCH} .plugin-stage-list > .mw-empty > :is(strong, h1, h2),
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child > :is(strong, h1, h2) { margin: 0 0 8px; font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; color: var(--ink); }
  ${WORKBENCH} .plugin-stage-list > .mw-empty > p,
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child > p { margin: 0; max-width: min(34em, 100%); color: var(--muted); font-size: 13px; line-height: 1.75; }
  ${WORKBENCH} .plugin-stage-list > .mw-empty > :is(.mw-btn, .mw-empty__actions),
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child > :is(.mw-btn, .mw-empty__actions) { margin: 24px 0 0; justify-content: center; }
  ${WORKBENCH} .plugin-stage-list .mw-empty__actions { gap: 8px; }

  /* ─── Lists and rows ─── */
  ${WORKBENCH} :is(.tree-entry, .feed-stage-entry, .plugin-stage-list .mw-dir-row, .home-erow) {
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint);
  }
  ${WORKBENCH} .plugin-stage-list :is(.mw-dir-row, .tree-node):active:not(:disabled) { background: var(--nav-press); }
  /* A selected Goal row is one wash on its entry, not a second fill on the button inside it. */
  ${WORKBENCH} :is(.goal-canvas-shell, .plugin-stage-list) .tree-entry.is-selected :is(.tree-node, .tree-row) { background: transparent; }

  /* Progress bars fill instead of appearing full. */
  ${WORKBENCH} :is(.tree-progress, .mw-progress) > :is(i, span) { transition: transform 420ms var(--ease-quint); }

  /* ─── Goal canvas ─── */
  /* The canvas is plain paper: nodes and their links are the only marks on it. */
  ${WORKBENCH} :is(.goal-canvas-viewport, .goal-frame-canvas) { background-color: var(--paper); background-image: none; }
  ${WORKBENCH} .goal-canvas-viewport.is-panning { cursor: grabbing; }
  ${WORKBENCH} [data-graph-node] {
    border-radius: var(--r-card); box-shadow: none; border-color: var(--line);
    transition: border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), opacity var(--dur-move) var(--ease-quint);
  }
  ${WORKBENCH} [data-graph-node]:hover { border-color: var(--line-strong); }
  /* Selection: a graphite ring, the same neutral selected state as a chosen option. */
  ${WORKBENCH} [data-graph-node].is-selected:not(.is-expanded-node) { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink), var(--lift-1); }
  ${WORKBENCH} [data-graph-node].is-dragging { box-shadow: var(--lift-3); cursor: grabbing; z-index: 5; }
  ${WORKBENCH} [data-graph-edge] path { transition: stroke var(--dur-move) var(--ease-quint), stroke-width var(--dur-move) var(--ease-quint), opacity var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} [data-graph-edge].is-selected-path path { stroke-dasharray: 6 5; animation: none; }
  @keyframes craft-flow { to { stroke-dashoffset: -11; } }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) > div { border-radius: 11px; background: var(--paper); box-shadow: var(--lift-2); }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button:hover { background: var(--nav-hover); }

  /* A short window leaves the timeline a sliver; the record menu then opens as a sheet above the bar instead of
     being cut off inside it. */
  @media (max-height: 560px) and (min-width: 601px) {
    ${WORKBENCH} .timeline-compose[open] > .timeline-compose-options {
      position: fixed; top: auto; left: auto; right: 16px; bottom: calc(var(--dock-h, 0px) + 8px); z-index: 60;
      max-height: calc(100dvh - var(--desktop-titlebar-height, 32px) - var(--dock-h, 0px) - 24px); overflow: auto;
    }
  }

  /* Writing gets the whole height of a short window: while a Goal record form is open the bar steps aside, and it
     returns when the form closes. Phones held sideways or with the keyboard up are short windows too. */
  @media (max-height: 560px) {
    ${SHELL} .immersive-workspace:has(.is-editing-goal) { --dock-h: 0px; }
    ${SHELL} .immersive-workspace:has(.is-editing-goal) > .workbench-bar { display: none; }
  }

  /* ─── Board ─── */
  ${WORKBENCH} [data-kanban-card] {
    border-radius: 10px; box-shadow: none; border-color: var(--line);
    transition: border-color var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint);
  }
  ${WORKBENCH} [data-kanban-card]:hover { border-color: var(--line-strong); }
  ${WORKBENCH} [data-kanban-card]:is(.is-selected, [aria-current="true"], [aria-selected="true"]) { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }

  /* ─── Goal work area ─── */
  ${WORKBENCH} .goal-node-toolbar .goal-node-back { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .goal-details-aside { background: var(--paper); box-shadow: inset 1px 0 0 var(--line); }
  ${WORKBENCH} .goal-details-toggle svg { transition: transform var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .tui-empty { border-radius: var(--r-card); }

  /* ─── Arrival ─── */
  /* A surface rises a few pixels the first time it appears (is-arriving, once); shown again it only cross-fades. */
  ${WORKBENCH} .tab-pane-body > [data-work-surface]:not([hidden]), ${WORKBENCH} .tab-workspace-exclusive > :not([hidden]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint) both; }
  ${WORKBENCH} .tab-pane-body > [data-work-surface].is-arriving:not([hidden]), ${WORKBENCH} .tab-workspace-exclusive > .is-arriving:not([hidden]) { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  ${WORKBENCH}[data-pane-embedded] .tab-pane-body > [data-work-surface] { animation: none; }

  /* Opening a project: the sheet and the bar settle in. Once per page. */
  ${SHELL}.is-craft-opening .immersive-plugin-stage { animation: craft-sheet-open 640ms var(--ease-quint) both 130ms; }
  ${SHELL}.is-craft-opening .immersive-titlebar .tab-strip--chrome { animation: craft-fade-in 420ms var(--ease-quint) both 130ms; }
  ${SHELL}.is-craft-opening .workbench-bar > * { animation: craft-bar-in 420ms var(--ease-quint) both; }
  ${SHELL}.is-craft-opening .workbench-bar > .bar-center { animation-delay: 130ms; }
  ${SHELL}.is-craft-opening .workbench-bar > .bar-end { animation-delay: 130ms; }
  @keyframes craft-bar-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes craft-sheet-open { from { opacity: 0; transform: translateY(10px) scale(.994); } to { opacity: 1; transform: none; } }

  /* ─── Home ─── */
  /* The page owns its layout in project-home.ts; this layer adds only the arrival cascade and the press tone. */
  ${WORKBENCH} .immersive-home .home-erow:active { background: var(--nav-press); }
  /* Arrival plays once per surface (\`is-arriving\`, set on its first reveal); showing Home again does not replay it. */
  ${WORKBENCH} .immersive-home.is-arriving .home-focus { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  /* The cascade marks arrival — the list's first load or another day — never a background refresh or a click. */
  ${WORKBENCH} .immersive-home .home-tl__rows[data-arrive] > * { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  ${[...Array(12).keys()].map((index) => `${WORKBENCH} .immersive-home .home-tl__rows[data-arrive] > :nth-child(${index + 1}) { animation-delay: ${30 + index * 24}ms; }`).join("\n  ")}

  /* ─── Feed: a lone source tab is not a choice (the column itself lives in the Feed plugin stylesheet) ─── */
  ${WORKBENCH} .feed-source-tabs:not(:has(button:not([hidden]) ~ button:not([hidden]))) { display: none; }
  ${WORKBENCH} .feed-source-tabs button { transition: color var(--dur-hover) var(--ease-quint), border-color var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .feed-source-tabs button:hover:not([aria-current]) { color: var(--ink-soft); border-bottom-color: var(--line-strong); }

  /* ─── Plugin list pages (Soft Workbench): a page heading, one centred column, rows that breathe ───
     The heading is the surface's own label, set once as --stage-title on the shell, so a plugin that re-renders
     its list keeps it. It is drawn text only (the tab and the surface label already name the page for assistive tech). */
  @media (min-width: 761px) {
    ${STAGE_LIST} {
      padding: 32px max(32px, calc((100% - 960px) / 2)) 56px;
    }
    /* One header on every page: the title and one sentence on the left, the page's actions on the right, on the title's line. */
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome) {
      position: relative; inset: auto; z-index: 5; display: grid; grid-auto-flow: column; grid-template-columns: minmax(0, 1fr);
      grid-auto-columns: auto; grid-template-rows: auto auto; align-items: center; column-gap: 8px; row-gap: 4px;
      width: auto; max-width: none; height: auto; min-height: 40px; flex: none; margin: 0 0 24px; padding: 0;
    }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome) > * { grid-row: 1; }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome)::before {
      content: var(--stage-title, "") / ""; grid-row: 1; grid-column: 1; min-width: 0;
      font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 1.3; color: var(--ink);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome)::after {
      content: var(--stage-desc, "") / ""; grid-row: 2; grid-column: 1; min-width: 0;
      font-size: 13px; line-height: 1.5; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    ${STAGE_LIST} > .shelf-stage-chrome > .shelf-search { min-width: min(360px, 40vw); }
    ${STAGE_LIST} > .plugin-stage-chrome .tree-create { min-height: var(--control-h, 32px); padding: 0 12px; border-radius: 8px; font-size: 13px; }
    ${STAGE_LIST} > .plugin-stage-chrome .tree-create:first-of-type { background: var(--action); color: var(--action-ink); }
    ${STAGE_LIST} > .plugin-stage-chrome .tree-create:first-of-type svg { color: currentColor; }
    ${STAGE_LIST} > .plugin-stage-chrome .tree-create:first-of-type:hover { background: var(--action-hover, color-mix(in srgb, var(--action) 90%, var(--action-ink))); }
    /* That create is the page's one primary action; an empty state repeating it steps down to secondary. */
    ${STAGE_LIST}:has(> .plugin-stage-chrome .tree-create) .mw-empty .mw-btn--primary { border-color: transparent; background: var(--control-fill); color: var(--ink); }
    ${STAGE_LIST}:has(> .plugin-stage-chrome .tree-create) .mw-empty .mw-btn--primary:hover:not(:disabled) { background: var(--nav-hover); }
    /* Rows: one comfortable line with a wash on hover; groups read as quiet section labels. */
    ${STAGE_LIST} .feed-stage-entry {
      height: auto; min-height: 44px; grid-template-rows: auto; padding: 8px 12px; border-radius: 8px;
    }
    ${STAGE_LIST} .feed-stage-item { min-height: 0; }
    ${STAGE_LIST} .feed-stage-entry .feed-stage-leading strong { font-size: 13px; line-height: 20px; }
    ${STAGE_LIST} :is(.feed-entry-source, .plugin-stage-fact, .plugin-stage-meta, .feed-stage-entry > time) { font-size: 12px; }
    ${STAGE_LIST} .goal-collection-fold { margin: 0 0 16px; }
    ${STAGE_LIST} .goal-collection-fold > summary { height: 34px; min-height: 34px; padding: 0 8px; color: var(--muted); }
    ${STAGE_LIST} .goal-collection-fold > summary strong { font-size: 12px; color: var(--ink-soft); }
    ${STAGE_LIST} .goal-collection-fold .feed-stage-entry { padding-left: 32px; }
    ${STAGE_LIST} > .mw-empty,
    ${STAGE_LIST} > div:only-child > .mw-empty:only-child { min-height: calc(100% - 84px); }
    /* A plugin that wraps its empty state in its own list still gets the calm centred invitation. */
    ${STAGE_LIST} > div:not(:only-child) > .mw-empty:only-child {
      display: grid; justify-items: center; align-content: center; gap: 0; box-sizing: border-box;
      max-width: 440px; margin: 0 auto; padding: 12vh 24px 64px; text-align: center;
    }
    ${STAGE_LIST} > div:not(:only-child) > .mw-empty:only-child > strong { margin: 0 0 8px; font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; color: var(--ink); }
    ${STAGE_LIST} > div:not(:only-child) > .mw-empty:only-child > p { margin: 0; max-width: 34em; color: var(--muted); font-size: 13px; line-height: 1.75; }
    /* The open item: the list becomes a soft side column, as in the Feed and Goals columns. */
    ${STAGE_OPEN} > .plugin-stage-list { background: var(--surface-soft); }
  }
  /* Phones keep the stacked header: the title and its sentence above the actions. */
  @media (max-width: 760px) {
    ${STAGE_LIST} { padding-top: 16px; }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome) {
      position: relative; inset: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      width: auto; max-width: none; height: auto; min-height: 0; flex: none; margin: 0 0 16px; padding: 0;
    }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome)::before {
      content: var(--stage-title, "") / ""; order: -2; flex: 1 0 100%;
      font-size: 20px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 1.3; color: var(--ink);
    }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome)::after {
      content: var(--stage-desc, "") / ""; order: -1; flex: 1 0 100%; margin: -4px 0 4px; font-size: 13px; line-height: 1.5; color: var(--muted);
    }
    ${STAGE_LIST} .feed-stage-entry { height: auto; min-height: 48px; grid-template-rows: auto; }
  }

  /* ─── Plugin market ─── */
  ${WORKBENCH} .plugin-market-body .mw-card {
    border-color: var(--line); box-shadow: none; border-radius: var(--r-card);
    transition: border-color var(--dur-hover) var(--ease-quint);
  }
  ${WORKBENCH} .plugin-market-body .mw-card:hover { border-color: var(--line-strong); }
  /* A card with a third action keeps its description readable and moves the actions to a row of their own. */
  ${WORKBENCH} .plugin-market-body .mw-card:has(> .mw-btn ~ .mw-btn ~ .mw-btn) { flex-wrap: wrap; justify-content: flex-end; row-gap: 8px; }
  ${WORKBENCH} .plugin-market-body .mw-card:has(> .mw-btn ~ .mw-btn ~ .mw-btn) > .plugin-market-copy { flex: 1 1 calc(100% - 64px); }
  ${WORKBENCH} .plugin-market-icon { border-radius: 8px; background: var(--nav-hover); color: var(--ink-soft); }
  ${WORKBENCH} .plugin-market-installed-row > * { transition: border-color var(--dur-hover) var(--ease-quint); }
  ${WORKBENCH} .is-arriving .plugin-market-list > * { animation: craft-rise 420ms var(--ease-quint) both; }
  ${[...Array(10).keys()].map((index) => `${WORKBENCH} .is-arriving .plugin-market-list > :nth-child(${index + 1}) { animation-delay: ${index * 24}ms; }`).join("\n  ")}
  /* A plugin's list arrives once, the first rows in order (at most 12); a refresh or a return never replays it. */
  ${WORKBENCH} .plugin-stage-shell.is-arriving > .plugin-stage-list > :nth-child(-n+12) { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  ${[...Array(12).keys()].map((index) => `${WORKBENCH} .plugin-stage-shell.is-arriving > .plugin-stage-list > :nth-child(${index + 1}) { animation-delay: ${index * 24}ms; }`).join("\n  ")}

  /* ─── Drag and drop ─── */
  ${PAGES} [draggable="true"] { -webkit-user-drag: element; }
  ${PAGES} [data-craft-drag-source] { opacity: .45; transition: opacity 130ms var(--ease-quint); }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas], .tab-strip, [data-drop-target], .shelf-drop) {
    transition: box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-move) var(--ease-quint);
  }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas]) { background-color: color-mix(in srgb, var(--focus) 4%, var(--paper)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 18%, transparent); }
  body[data-craft-dragging] :is([data-drop-target], .tab-strip):hover { background-color: color-mix(in srgb, var(--focus) 6%, transparent); }

  /* ─── A Goal that just finished ─── */
  .craft-burst { position: fixed; z-index: 2147482000; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
  .craft-burst i {
    position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 2px; background: var(--c, var(--celebrate-a));
    animation: craft-spark var(--d, 640ms) var(--ease-quint) forwards;
  }
  .craft-burst i:nth-child(3n) { border-radius: 50%; }
  .craft-burst i:nth-child(4n) { width: 3px; height: 9px; }
  .craft-burst b {
    position: absolute; left: -18px; top: -18px; width: 36px; height: 36px; border-radius: 50%;
    border: 2px solid var(--celebrate-a); animation: craft-ring 640ms var(--ease-quint) forwards;
  }
  @keyframes craft-spark {
    0% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; }
    100% { transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(.4); opacity: 0; }
  }
  @keyframes craft-ring { from { transform: scale(.3); opacity: .9; } to { transform: scale(2.2); opacity: 0; } }
  ${PAGES} [data-craft-celebrate] .goal-status--completed { animation: craft-done 640ms var(--ease-spring); }
  ${PAGES} [data-craft-celebrate] .goal-status--completed svg { animation: craft-done-mark 640ms var(--ease-spring); }
  @keyframes craft-done { 0% { transform: scale(.8); } 45% { transform: scale(1.12); } 100% { transform: none; } }
  @keyframes craft-done-mark { 0% { transform: rotate(-30deg) scale(.4); } 60% { transform: rotate(8deg) scale(1.2); } 100% { transform: none; } }

  /* ─── Catalog specimens for this layer ─── */
  .mw-catalog .mw-craft-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mw-catalog .mw-craft-lift, .mw-catalog .mw-craft-radius {
    display: grid; gap: 4px; align-content: end; width: 132px; height: 84px; padding: 12px 12px; background: var(--paper); border-radius: var(--r-card);
  }
  .mw-catalog .mw-craft-radius { width: 96px; height: 64px; box-shadow: var(--lift-1); }
  .mw-catalog :is(.mw-craft-lift, .mw-craft-radius) code { font-size: 11px; color: var(--ink-soft); }
  .mw-catalog :is(.mw-craft-lift, .mw-craft-radius) small { font-size: 11px; color: var(--muted); }
  /* Component board: the real resident bar on a strip of desk, its overlays opening upward. */
  .mw-catalog-bar-frame { display: block; width: min(100%, 1100px); height: 440px; border: 0; border-radius: 14px; background: var(--desk); box-shadow: inset 0 0 0 1px var(--hairline); }
  body.mw-bar-specimen-page { background: var(--desk); }
  .mw-catalog-bar-stage { box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; height: 100dvh; padding: 0 16px; background: var(--desk); }
  .mw-catalog-bar-stage .workbench-bar { height: var(--dock-h); padding: 0; background: transparent; }
  .mw-catalog .mw-craft-space { display: grid; grid-template-columns: 70px 1fr; grid-template-rows: 1fr 30px; column-gap: 0; width: min(100%, 440px); height: 200px; padding: 12px 12px 0; border-radius: 14px; background: var(--desk); box-shadow: inset 0 0 0 1px var(--hairline); overflow: hidden; }
  .mw-catalog .mw-craft-space__dir { grid-row: 1; margin: 16px 0 0; border-radius: 10px 0 0 10px; background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--ink) 9%, transparent) 0 6px, transparent 6px 14px) 10px 12px / 44px 100% no-repeat, var(--surface-soft); }
  .mw-catalog .mw-craft-space__main { grid-row: 1; display: grid; grid-template-rows: 18px 1fr; }
  .mw-catalog .mw-craft-space__tabs { align-self: center; width: 64px; height: 10px; border-radius: 4px; background: var(--paper); box-shadow: var(--lift-1); }
  .mw-catalog .mw-craft-space__sheet { display: grid; align-content: start; gap: 8px; padding: 16px; border-radius: 0 10px 10px 0; background: var(--paper); box-shadow: var(--sheet-shadow); }
  .mw-catalog .mw-craft-space__sheet b { display: block; height: 6px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .mw-catalog .mw-craft-space__sheet b:first-child { width: 40%; height: 9px; background: color-mix(in srgb, var(--ink) 20%, transparent); }
  .mw-catalog .mw-craft-space__sheet b:last-child { width: 70%; }
  .mw-catalog .mw-craft-space__bar { grid-column: 1 / -1; grid-row: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; }
  .mw-catalog .mw-craft-space__bar i { width: 34px; height: 10px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 12%, transparent); }
  .mw-catalog .mw-craft-space__bar em { flex: 0 1 180px; height: 16px; border-radius: 6px; background: var(--paper); box-shadow: var(--lift-2); }
  .mw-catalog .mw-craft-motion td:first-child { white-space: nowrap; }
  .mw-catalog .mw-craft-stage { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: min(100%, 460px); margin-top: 12px; padding: 12px 12px; border-radius: var(--r-row); background: var(--paper); box-shadow: var(--lift-1); }
  .mw-catalog .mw-craft-stage.is-rising { animation: craft-rise var(--dur-arrive) var(--ease-quint); }
  .mw-catalog .mw-craft-stage__title { font-size: 13px; color: var(--ink); }
  .mw-catalog .mw-craft-mono { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-soft); }
  .mw-catalog .mw-craft-strip { padding: 4px 8px; border-radius: 10px; background: var(--desk); }
  .mw-catalog .mw-craft-tab { display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 12px; border-radius: 7px; color: var(--muted); font-size: 12px; }
  .mw-catalog .mw-craft-tab svg { width: 14px; height: 14px; }
  .mw-catalog .mw-craft-tip { position: static; opacity: 1; transform: none; margin-left: 12px; }
  /* Icon inventory and motion specimens. */
  .mw-catalog .mw-icon-inventory { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(168px, 100%), 1fr)); gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
  .mw-catalog .mw-icon-inventory { width: min(880px, 100%); }
  .mw-catalog #icon-inventory .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog #icon-inventory .mw-catalog__specimens > * { margin-inline: 0; }
  .mw-catalog .mw-icon-inventory > li { display: flex; align-items: center; gap: 8px; min-height: 36px; color: var(--ink-soft); font-size: 13px; }
  .mw-catalog .mw-icon-inventory > li > svg { flex: none; width: 16px; height: 16px; }
  .mw-catalog .mw-icon-inventory > li > span:last-child, .mw-catalog .mw-icon-inventory > li strong + code { display: grid; }
  .mw-catalog .mw-icon-inventory strong { font-size: 13px; font-weight: var(--weight-control, 500); color: var(--ink); }
  .mw-catalog .mw-icon-inventory code, .mw-catalog .mw-icon-inventory small { font-size: 11px; color: var(--muted); }
  .mw-catalog .mw-icon-inventory--states > li { justify-content: space-between; }
  .mw-catalog .mw-icon-size { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: var(--surface-soft); color: var(--ink-soft); }
  .mw-catalog .mw-icon-size svg { width: var(--s); height: var(--s); }
  .mw-catalog .mw-icon-inventory--sizes > li:last-child .mw-icon-size svg { stroke-width: 1.6; }
  .mw-catalog .mw-motion-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .mw-catalog .mw-motion-rows { display: grid; gap: 4px; }
  .mw-catalog .mw-motion-stack { display: grid; justify-items: start; gap: 12px; width: 100%; }
  .mw-catalog .mw-motion-row { min-height: 36px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-catalog .mw-motion-row:hover { background: var(--nav-hover); }
  .mw-catalog .mw-motion-menu { position: relative; }
  .mw-catalog .mw-motion-menu > summary { list-style: none; }
  .mw-catalog .mw-motion-menu > .mw-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 5; min-width: 160px; padding: 4px; background: var(--popover); }
  .mw-catalog .mw-motion-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--desk); }
  .mw-catalog .mw-motion-tabs .tab-item { min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; }
  .mw-catalog .mw-motion-tabs .tab-item[aria-selected="true"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
  .mw-catalog .mw-motion-list { display: grid; gap: 4px; margin: 12px 0 0; padding: 0; list-style: none; }
  .mw-catalog .mw-motion-list > li { padding: 8px 12px; border-radius: 8px; background: var(--surface-soft); font-size: 13px; }
  .mw-catalog .mw-motion-list.is-arriving > li { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  ${[...Array(5).keys()].map((index) => `.mw-catalog .mw-motion-list.is-arriving > :nth-child(${index + 1}) { animation-delay: ${index * 24}ms; }`).join("\n  ")}
  .mw-catalog .mw-motion-row-detail > summary { cursor: pointer; font-size: 13px; }
  .mw-catalog .mw-motion-row-detail > p { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
  .mw-catalog .mw-motion-pages > section { padding: 16px; border-radius: 12px; background: var(--surface-soft); font-size: 13px; }
  .mw-catalog .mw-motion-pages > section:not([hidden]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint) both; }

  /* ─── Reduced motion: nothing here moves ─── */
  @media (prefers-reduced-motion: reduce) {
    /* State still changes and focus still moves; only the movement goes. Transitions stop too, not just animations:
       a 0s duration (not 1ms) so a new size or position is there the moment the state changes. */
    ${PAGES} *, ${PAGES} *::before, ${PAGES} *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
    ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .tab-item, .tab-view-chip, .home-day, [data-kanban-card], .mw-check, .mw-radio, .dock-pin, .bar-chat, .account-global-trigger, .plugin-picker-trigger):is(:active, :hover) { transform: none !important; }
    ${PAGES} :is(.mw-btn, .tab-item, [data-kanban-card], .plugin-market-body .mw-card, .plugin-market-installed-row > *):hover { transform: none !important; }
    ${PAGES} :is(.assistant-side-action, .assistant-segment, .assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-control, .assistant-start, .assistant-copy, .assistant-tab-close, .assistant-tab-main, .assistant-jump):active { transform: none !important; }
    .craft-burst, .craft-tip { transition: none; }
    .craft-burst { display: none; }
  }
`;
