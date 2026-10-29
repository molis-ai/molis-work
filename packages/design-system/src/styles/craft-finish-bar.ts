import { WORKBENCH, SHELL, ASSIST, RAIL_LINK, PAGES } from "./craft-finish-selectors.js";

/** The finish layer, first part: tokens, the desk and sheet, titlebar tabs, the plugin rail and the bottom bar down to the switcher and the work tabs. */
export const CRAFT_BAR_STYLES = `
  /* ─── Tokens ─── */
  :root,
  ${PAGES} {
    --r-tag: 6px; --r-row: 10px; --r-control: 8px; --r-card: 12px; --r-sheet: 14px; --r-dialog: 16px; --r-composer: 15px;
    --sheet-inset: 14px;
    --desk: var(--page);
    --ease-quint: cubic-bezier(.22, 1, .36, 1);
    --ease-spring: cubic-bezier(.2, 1.35, .4, 1);
    --ease-swift: var(--ease-quint);
    --dur-press: 130ms; --dur-hover: 130ms; --dur-move: 250ms; --dur-arrive: 420ms; --dur-moment: 640ms; --code-tab: 4;
    /* Depth steps: a small raised piece (current tab, segment thumb, Dock item), a raised surface
       (the composer, an inner sheet), and the one floating layer (menus, dialogs, toasts). */
    --lift-1: var(--shadow-soft);
    --lift-2: var(--shadow-raised);
    --lift-3: var(--shadow);
    --sheet-shadow: var(--surface-shadow);
    --press-shade: color-mix(in srgb, var(--ink) 5%, transparent);
    --tip-bg: var(--action); --tip-ink: var(--action-ink);
    --celebrate-a: var(--hue-green-fill, #4cb782);
    --celebrate-b: var(--accent, #93604b);
    --celebrate-c: var(--hue-yellow-fill, #e2b203);
  }
  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] ${PAGES} {
    --press-shade: color-mix(in srgb, var(--ink) 7%, transparent);
  }

  /* ─── Browser defaults: no system blue, purple or yellow anywhere (zero specificity, so any real rule wins) ─── */
  :where(${PAGES}) { accent-color: var(--action); caret-color: var(--ink); }
  :where(${PAGES}) ::selection { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; }
  :where(${PAGES}) mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 2px; }
  :where(${PAGES}) ::placeholder { color: var(--faint); opacity: 1; }
  :where(${PAGES}) :is(input, textarea):-webkit-autofill { -webkit-text-fill-color: var(--ink); box-shadow: inset 0 0 0 40px var(--paper); }

  /* ─── Desk and sheet ─── */
  ${WORKBENCH} .immersive-workspace { background: var(--desk); }
  ${SHELL} .immersive-titlebar { background: var(--desk); box-shadow: none; }
  ${SHELL} .plugin-stack { background: var(--desk); border-right: 0; }
  ${SHELL} .tree-pane { background: var(--desk); border-right: 0; box-shadow: none; }
  @media (min-width: 601px) {
    ${SHELL} .tab-workspace { padding: 0 var(--sheet-inset) 0 0; background: var(--desk); box-sizing: border-box; }
    ${SHELL} .tab-workspace-panes { background: transparent; }
    ${SHELL} .tab-workspace-panes > .tab-pane,
    ${SHELL} .tab-workspace-exclusive {
      border-radius: var(--r-sheet); overflow: clip; background: var(--paper); box-shadow: var(--sheet-shadow);
    }
    ${SHELL} .tab-workspace-panes > .tab-content-frame { border-radius: var(--r-sheet); overflow: clip; }
    ${SHELL} .tab-workspace[data-exclusive] .tab-workspace-exclusive { inset: 0 var(--sheet-inset) 0 0; }
    ${SHELL} .tab-workspace-panes > .tab-pane.is-focused { box-shadow: var(--sheet-shadow); }
    /* Split panes: the focused one carries a copper hint so typing lands where you expect. */
    ${SHELL} .tab-workspace[data-split] .tab-workspace-panes > .tab-pane.is-focused {
      box-shadow: var(--sheet-shadow), 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
    }
    /* The directory sits on the desk; one hair of desk separates it from the sheet. */
    ${SHELL} .tree-pane:not([hidden]) + .tree-resizer { background: transparent; }
  }
  /* Settings documents keep their grouped cards; the sheet under them is a half-step off paper. */
  ${WORKBENCH} .tab-workspace-exclusive > .settings-stage { background: var(--surface-soft); }
  /* The sheet is the card; the home page lays itself out inside it (project-home.ts). */
  ${WORKBENCH} .tab-pane-body > .immersive-home,
  ${WORKBENCH} .immersive-workspace .immersive-plugin-stage > .immersive-home { padding: 0; }

  /* ─── Titlebar tabs: quiet pills; the current one is a small piece of the sheet ── */
  ${SHELL} .immersive-titlebar .tab-strip--chrome { gap: 4px; }
  ${WORKBENCH} .tab-strip .tab-item {
    border-radius: 8px; background: transparent; box-shadow: none; color: var(--muted);
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-quint);
  }
  ${WORKBENCH} .tab-strip .tab-item:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${WORKBENCH} .tab-strip .tab-item[aria-current],
  ${WORKBENCH} .tab-strip .tab-item:has([aria-selected="true"]) {
    background: var(--paper); color: var(--ink); box-shadow: var(--lift-1);
  }
  ${WORKBENCH} .tab-strip .tab-item svg { color: var(--muted); transition: color var(--dur-hover) var(--ease-quint); }
  ${WORKBENCH} .tab-strip .tab-item:is(:hover, [aria-current]) svg { color: var(--ink-soft); }
  ${WORKBENCH} .tab-strip .tab-item:active:not(:has(.tab-item-close:active)) { transform: scale(.975); }
  ${WORKBENCH} .tab-strip .tab-item.is-dragging,
  ${WORKBENCH} .tab-strip .tab-item[data-dragging] { box-shadow: var(--lift-3); background: var(--paper); }
  ${WORKBENCH} .tab-strip .tab-item-close { border-radius: 5px; }
  ${WORKBENCH} .tab-strip .tab-item-close:hover { background: var(--nav-active); color: var(--ink); }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button) { border-radius: 7px; }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button):active:not(:disabled) svg { transform: scale(.86); }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button) svg { transition: transform var(--dur-move) var(--ease-spring); }

  /* A cover (market, settings) names itself ahead of the tabs. */
  ${PAGES} .tab-view-chip {
    flex: none; display: inline-flex; align-items: center; gap: 8px; height: 26px; margin: 0 4px 0 0; padding: 0 12px 0 8px;
    border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-quint);
  }
  ${PAGES} .tab-view-chip svg { width: 14px; height: 14px; color: var(--ink-soft); }
  ${PAGES} .tab-view-chip:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${PAGES} .tab-view-chip[aria-current="page"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); cursor: default; }
  ${PAGES} .tab-view-chip.is-exclusive svg { color: var(--ink-soft); }
  /* Under a cover only the cover is current; the tabs beneath wait, one click away. */
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) .tab-item:is([aria-current], :has([aria-selected="true"])) { background: transparent; box-shadow: none; color: var(--muted); }
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) .tab-item:is([aria-current], :has([aria-selected="true"])):hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${PAGES} .tab-view-chip:active:not([aria-current="page"]) { transform: scale(.97); }
  ${PAGES} .tab-view-chip + .tab-view-divider { flex: none; width: 1px; height: 14px; margin: 0 4px 0 4px; background: var(--line-strong); align-self: center; }
  ${WORKBENCH} .tab-pane > .tab-strip .tab-view-chip { height: 24px; }
  @media (max-width: 760px), (pointer: coarse) { ${WORKBENCH} :is(.tab-strip, .tab-pane > .tab-strip) .tab-view-chip { height: 44px; } }

  /* ─── Plugin rail: this project — where the work lives and its plugins; the account at the foot ── */
  :root ${ASSIST} :is(.workspace-chrome .navigator-project-primary, .plugin-rail-items, .plugin-rail .personal-sidebar-footer) {
    background: transparent; box-shadow: none; border: 0;
  }
  /* The zone hairline above the account sits in the 8px gap and takes no height. */
  @media (min-width: 601px) {
    ${SHELL} .plugin-rail { position: relative; overflow: visible; }
    ${SHELL} .plugin-rail > .personal-sidebar-footer { position: relative; }
    ${SHELL} .plugin-rail > .personal-sidebar-footer::before {
      content: ""; position: absolute; z-index: 1; top: -4.5px; left: 50%; width: 20px; height: 1px; margin-left: -12px;
      background: var(--line); pointer-events: none;
    }
    ${SHELL} .plugin-rail-items { overflow-x: hidden; }
  }
  /* Headings are hairlines in the icon rail and quiet words once names are shown. */
  ${SHELL} :is(.plugin-rail-group, .plugin-rail-subgroup) {
    flex: none; width: 16px; height: 1px; margin: 8px auto; padding: 0; overflow: hidden;
    background: var(--line); color: transparent; font-size: 0; line-height: 0; user-select: none;
  }
  /* Plugins: the ones used lately and the current one stay; the rest open in place under 全部插件. */
  ${SHELL} .plugin-rail-items:not(.is-tools-open) [data-rail-zone="more"],
  ${SHELL} .plugin-rail-items:not(.is-tools-open) [data-rail-zone="tool"]:not(.is-recent, [aria-current]) { display: none; }
  ${SHELL} .plugin-rail-toggle { color: var(--muted); }
  /* While the full list is open, 收起 stays at the bottom of the list instead of scrolling away. */
  ${SHELL} .plugin-rail-items.is-tools-open { scroll-padding-bottom: 44px; }
  ${SHELL} .plugin-rail-items.is-tools-open > .plugin-rail-toggle { position: sticky; bottom: 0; z-index: 2; background: var(--desk); box-shadow: 0 -4px 0 var(--desk), 0 -5px 0 var(--line); }
  ${SHELL} .plugin-rail-toggle > span { color: var(--muted); }
  ${SHELL} ${RAIL_LINK} {
    border-radius: 8px;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  /* Icons stay neutral: position and a name say which tool it is, not a colour. */
  ${SHELL} ${RAIL_LINK} svg { color: var(--muted); transition: color var(--dur-hover) var(--ease-quint); }
  ${SHELL} ${RAIL_LINK}:hover { background: var(--nav-hover); }
  ${SHELL} ${RAIL_LINK}:is(:hover, [aria-current], [aria-expanded="true"]) svg { color: var(--ink); }
  ${SHELL} .plugin-rail-items[data-seg-thumb]::before { border-radius: 8px; background: var(--nav-active); }
  ${SHELL} .plugin-rail a.plugin-rail-item { text-decoration: none; color: inherit; }
  ${SHELL} .plugin-rail-hint { display: none; }
  ${SHELL} .plugin-rail-items .immersive-plugin-link { position: relative; }
  /* The rail's own toggle lives with Back and Forward in the titlebar, where macOS keeps a sidebar button. */
  ${SHELL} .workspace-history .navigation-labels-toggle { flex: none; align-self: center; margin: 0; padding: 0; min-height: 0; }
  ${SHELL} .navigator-project-search :is(.navigator-project-search-label, kbd) { display: none; }
  /* Project settings live in the project's menu; the menu reads as a short list. */
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage) {
    display: flex; align-items: center; gap: 8px; width: auto; height: 32px; min-height: 32px; margin: 0; padding: 0 12px; border-radius: 8px;
    background: transparent; box-shadow: none; color: var(--ink-soft); font-size: 13px; text-decoration: none;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-settings { margin-top: 4px; border-top: 0; }
  ${SHELL} .navigator-project-menu-popover > .navigator-project-manage + .navigator-project-settings { box-shadow: 0 -3px 0 -2px var(--line); }
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage):hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage) svg { width: 16px; height: 16px; color: var(--muted); }
  ${SHELL} .navigator-project-menu-popover > nav + .navigator-project-settings { box-shadow: 0 -5px 0 -4px var(--line); }

  /* Names shown: a 208px sidebar — project, search, backbone, tools, then the person. */
  @media (min-width: 761px) {
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-primary {
      display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; align-items: center; gap: 8px; padding: 12px 16px 0;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-primary > * { grid-column: 1; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-menu { grid-row: 1; width: auto; min-width: 0; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search { grid-row: 2; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome :is(.desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .immersive-workspace .navigator-project-selector {
      width: 100%; height: 34px; justify-content: flex-start; gap: 8px; padding: 0 8px 0 8px; border-radius: 8px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-selector strong { font-size: 13px; font-weight: 500; color: var(--ink); }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search {
      display: flex; align-items: center; width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 8px; padding: 0 8px 0 12px; border-radius: 8px;
      background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); color: var(--faint); font-size: 12px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search:hover { box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--muted); }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-search .navigator-project-search-label { display: inline; flex: 1; text-align: left; }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-search kbd {
      display: inline; padding: 0 4px; border-radius: 4px; background: transparent; box-shadow: inset 0 0 0 1px var(--line);
      color: var(--faint); font: inherit; font-size: 11px; line-height: 17px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-items { align-items: stretch; padding: 4px 16px 8px; gap: 1px; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .plugin-rail-item {
      width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 12px; padding: 0 12px; border-radius: 8px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .plugin-rail-item svg { width: 16px; height: 16px; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .plugin-rail-item > span { font-size: 13px; color: var(--ink-soft); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-item:is([aria-current], [aria-expanded="true"]) > span { color: var(--ink); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-toggle > span { color: var(--muted); }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail-group, .plugin-rail-subgroup) {
      width: auto; height: auto; margin: 16px 0 4px; padding: 0 12px; background: none; overflow: visible;
      color: var(--faint); font-size: 11px; line-height: 18px; letter-spacing: .02em;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-subgroup { margin-top: 8px; color: var(--faint); font-size: 11px; }
    /* The account is the first container of the bottom row: the same 36px paper chip and hairline as the Dock beside it. */
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail > .personal-sidebar-footer::before { content: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-sidebar-footer {
      flex-direction: row; align-items: center; gap: 0; width: auto; height: 36px; min-height: 36px; margin: 0 8px; padding: 0 4px 0 0;
      border-radius: 10px; background: var(--paper); box-shadow: 0 0 0 1px var(--line);
      transition: box-shadow var(--dur-hover) var(--ease-quint);
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-sidebar-footer:hover { box-shadow: 0 0 0 1px var(--line-strong); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account {
      flex: 1; width: auto; min-width: 0; height: 36px; min-height: 36px; gap: 8px; padding: 0 8px 0 12px;
      border-radius: 10px 0 0 10px; background: transparent;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account:hover { background: transparent; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-avatar { width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft); box-shadow: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-avatar svg { width: 12px; height: 12px; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; color: var(--ink-soft); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy small { font-size: 12px; line-height: 18px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .account-global-trigger { width: 28px; height: 28px; border-radius: 7px; }
  }
  /* A phone has no personal row at the top: the Dock carries those entries at the foot of the page. */
  @media (max-width: 600px) {
    ${SHELL} { --assistant-island-row: 0px; }
    /* The drawer lets the account menu open beyond its edge instead of clipping it. */
    ${SHELL} .plugin-rail { overflow: visible; }
  }

  /* ─── Bottom bar: the Dock, the resident Assistant, the project ─── */
  /* No global sidebar: the work spans the window and the resident bar under it holds the way around.
     Controls sit straight on the desk; only the composer and the current Dock item are raised. */
  ${SHELL} { --dock-h: 76px; --dock-btn: 38px; --composer-h: 50px; }
  @media (max-height: 560px) and (min-width: 601px) { ${SHELL} { --dock-h: 52px; --dock-btn: 34px; --composer-h: 40px; } }
  ${WORKBENCH}[data-pane-embedded] .workbench-bar { display: none; }
  @media (min-width: 601px) {
    ${SHELL}, ${SHELL}:not([data-navigation-labels="false"]) { --plugin-rail-width: var(--sheet-inset); }
    ${SHELL} .immersive-workspace,
    ${SHELL} .immersive-workspace.is-directory-collapsed,
    ${SHELL} .immersive-workspace.is-plugin-directory-empty { grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr) var(--dock-h); }
    ${SHELL} .immersive-workspace > .tree-pane { grid-row: 2; }
    ${SHELL} .immersive-plugin-stage { grid-row: 2; }
  }
  ${SHELL} .workbench-bar {
    grid-column: 1 / -1; grid-row: 3; position: relative; z-index: 30; min-width: 0;
    /* The end column is at least as wide as its fixed buttons (Shelf, 灵光, chat, project), so they are never squeezed;
       the Assistant keeps 200px down to the 601px desktop minimum. */
    display: grid; grid-template-columns: minmax(150px, 1fr) minmax(200px, 660px) minmax(max-content, 1fr); align-items: center; gap: 24px;
    padding: 0 var(--sheet-inset); background: var(--desk);
  }
  /* Each side stays inside its column: the Dock folds what does not fit instead of running under the Assistant. */
  ${SHELL} .bar-start { justify-self: start; position: relative; display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; }
  ${SHELL} .bar-center { position: relative; min-width: 0; container: assistant-bar / inline-size; }
  html ${SHELL} .workbench-bar .bar-end { justify-self: stretch; position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }

  /* One Dock button everywhere in the bar: 38px, soft corners, neutral glyph; hover washes and lifts a hair,
     the current one becomes a small raised piece of the work surface with a copper point under it. */
  ${SHELL} :is(.dock-pin, .bar-chat, .account-global-trigger) {
    position: relative; display: inline-grid; place-items: center; flex: none; width: var(--dock-btn); height: var(--dock-btn); padding: 0; border: 0; border-radius: 11px;
    background: transparent; box-shadow: none; color: var(--ink-soft); cursor: pointer; list-style: none;
    transition: transform var(--dur-move) var(--ease-spring), background-color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${SHELL} :is(.dock-pin, .bar-chat, .account-global-trigger) svg { width: 20px; height: 20px; stroke-width: 1.6; }
  ${SHELL} :is(.dock-pin, .bar-chat, .account-global-trigger):hover { background: var(--nav-hover); color: var(--ink); transform: translateY(-1px); }
  ${SHELL} :is(.dock-pin[aria-current], .bar-chat[aria-expanded="true"], .account-global-menu[open] > .account-global-trigger) {
    background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); transform: none;
  }
  ${SHELL} .dock-pin[aria-current]::after {
    content: ""; position: absolute; left: 50%; bottom: 3px; width: 3px; height: 3px; margin-left: 0px; border-radius: 50%; background: var(--accent); pointer-events: none;
  }
  ${SHELL} :is(.dock-pin, .bar-chat, .account-global-trigger):focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${SHELL} .workbench-bar :is(.dock-pin, .bar-chat, .plugin-picker-trigger, .account-global-trigger, .navigator-project-selector):active { transform: scale(.94); transition-duration: var(--dur-press); }
  /* A plugin kept in the Dock lands (the spring that settles a press); one taken out lets go. Neither moves its neighbours. */
  @keyframes dock-pin-arrive { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
  ${SHELL} .dock-pin.is-arriving { animation: dock-pin-arrive var(--dur-move) var(--ease-spring) both; }
  ${SHELL} .dock-pin.is-leaving { opacity: 0; transform: scale(.6); pointer-events: none; transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-quint); }

  /* The side panel's button, beside the project at the right. */
  ${SHELL} .bar-side { display: flex; align-items: center; gap: 4px; min-width: 0; }

  /* The Dock menu: which plugins stay, what is yours everywhere, settings and the account. */
  ${SHELL} .bar-start .personal-sidebar-footer { display: contents; }
  ${SHELL} .account-global-menu { position: relative; flex: none; }
  ${SHELL} .account-global-trigger::-webkit-details-marker { display: none; }
  ${SHELL} .account-global-menu:not([open])[data-market-updates] > .account-global-trigger::after {
    content: ""; position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
  }
  ${SHELL} .account-global-popover {
    position: absolute; z-index: 60; left: 0; bottom: calc(100% + 10px); display: grid; gap: 1px; width: 264px; max-height: min(70dvh, 620px); overflow: auto; padding: 8px;
    border-radius: 14px; background: var(--paper); box-shadow: var(--lift-3);
  }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; height: 34px; min-height: 34px;
    margin: 0; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; box-shadow: none;
    color: var(--ink); font: inherit; font-size: 13px; font-weight: 400; text-align: left; text-decoration: none; cursor: pointer;
  }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item svg { flex: none; width: 16px; height: 16px; color: var(--ink-soft); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  ${SHELL} .account-global-popover .plugin-rail-update-count { position: static; margin-left: auto; }
  ${SHELL} .account-global-popover > .account-global-item:last-of-type { margin-bottom: 4px; }
  /* The person, under the project button: capabilities, settings, then who you are and where — nearest the button. */
  ${SHELL} .navigator-project-menu-popover .navigator-personal { display: grid; gap: 1px; margin-top: 4px; padding-top: 4px; box-shadow: inset 0 1px 0 var(--line); }
  ${SHELL} .navigator-personal .account-global-item { gap: 8px; }
  ${SHELL} .navigator-personal .account-global-item > svg { width: 16px; height: 16px; }
  ${SHELL} .navigator-personal .personal-account { height: 44px; margin-top: 4px; box-shadow: 0 -3px 0 -2px var(--line); }
  ${SHELL} .navigator-personal .personal-account-avatar { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft); }
  ${SHELL} .navigator-personal .personal-account-avatar svg { width: 14px; height: 14px; }
  ${SHELL} .navigator-personal .personal-account-copy { display: grid; gap: 0; min-width: 0; text-align: left; line-height: 16px; }
  ${SHELL} .navigator-personal .personal-account-copy strong { font-weight: 500; font-size: 13px; color: var(--ink); }
  ${SHELL} .navigator-personal .personal-account-copy small { font-size: 11px; color: var(--muted); }

  /* The Dock: 项目首页 first and always, then the plugins chosen to stay. A short rule parts it from the menu. */
  ${SHELL} .dock-pins { position: relative; display: flex; flex: 0 1 auto; align-items: center; gap: 4px; min-width: 0; height: 44px; margin-left: 12px; padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
  ${SHELL} .dock-pins::before { content: ""; position: absolute; left: -9px; top: 12px; width: 1px; height: 20px; background: var(--line-strong); pointer-events: none; }
  ${SHELL} .dock-pin[hidden] { display: none; }
  ${SHELL} .dock-pin.dock-pin-more { width: auto; min-width: var(--dock-btn); padding: 0 8px; font: inherit; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--ink-soft); }
  ${SHELL} .dock-pin.dock-pin-more:is([aria-expanded="true"], .has-current) { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
  ${SHELL} .dock-overflow {
    position: absolute; z-index: 60; bottom: calc(100% + 10px); display: grid; gap: 1px; width: 212px; max-height: min(60dvh, 480px); overflow: auto; padding: 8px;
    border-radius: 14px; background: var(--paper); box-shadow: var(--lift-3); transform-origin: bottom left; animation: craft-rise-from-bar 250ms var(--ease-quint) both;
  }
  ${SHELL} .dock-overflow[hidden] { display: none; }
  ${SHELL} .dock-overflow-item {
    display: flex; align-items: center; gap: 12px; width: 100%; height: 34px; padding: 0 12px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  ${SHELL} .dock-overflow-item svg { flex: none; width: 16px; height: 16px; color: var(--ink-soft); }
  ${SHELL} .dock-overflow-item:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-overflow-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .dock-overflow-item:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  ${SHELL} .dock-pins:empty { display: none; }
  /* 项目首页 stays put; a hairline sets it apart from the plugins you chose. */
  ${SHELL} .dock-pin.is-fixed { margin-right: 8px; }
  ${SHELL} .dock-pin.is-fixed:not(:only-child)::before { content: ""; position: absolute; right: -7px; top: 12px; width: 1px; height: 14px; background: var(--line); pointer-events: none; }

  /* The resident Assistant: one raised white line with the plugin switcher in front of it. */
  ${SHELL} .bar-composer {
    position: static; inset: auto; display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 8px;
    width: 100%; height: var(--composer-h); min-height: var(--composer-h); max-height: none; margin: 0; padding: 0 8px 0 8px; border: 0; border-radius: var(--r-composer); overflow: visible;
    background: var(--paper); box-shadow: var(--composer-shadow, var(--lift-2));
    transition: box-shadow var(--dur-move) var(--ease-quint);
  }
  html[data-resolved-theme="dark"] ${SHELL} .bar-composer { --composer-shadow: 0 0 0 1px var(--edge-highlight), var(--lift-1); }
  ${SHELL} .bar-composer:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  html[data-resolved-theme="dark"] ${SHELL} .bar-composer:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  ${SHELL} .bar-composer .assistant-composer-input { flex: 1; min-width: 0; font-size: 13px; }
  ${SHELL} .bar-composer .assistant-composer-input::placeholder { color: var(--muted); }
  /* Search opens from the same line: a quiet glyph with its shortcut, the one mouse entry to ⌘K. */
  /* Send: graphite when there is something to send, a quiet wash while the line is empty. */
  ${SHELL} .bar-composer [data-assistant-send] { flex: none; width: 34px; height: 34px; min-height: 34px; padding: 0; border-radius: 10px; }
  ${SHELL} .bar-composer [data-assistant-send]:disabled { background: var(--rail); color: var(--muted); border-color: transparent; opacity: 1; }
  ${SHELL} .bar-composer [data-assistant-send] svg { width: 16px; height: 16px; }
  ${SHELL} .plugin-picker { position: relative; flex: none; min-width: 0; max-width: 46%; padding-right: 8px; }
  ${SHELL} .plugin-picker::after { content: ""; position: absolute; right: 0; top: 50%; width: 1px; height: 18px; margin-top: -8px; background: var(--line); pointer-events: none; }
  ${SHELL} .plugin-picker-trigger {
    display: flex; align-items: center; gap: 8px; max-width: 100%; height: 34px; padding: 0 8px; border: 0; border-radius: 9px;
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring);
  }
  ${SHELL} .plugin-picker-trigger:hover, ${SHELL} .plugin-picker-trigger[aria-expanded="true"] { background: var(--rail); color: var(--ink); }
  ${SHELL} .plugin-picker-trigger > svg { flex: none; width: 12px; height: 12px; color: var(--muted); transition: transform var(--dur-move) var(--ease-quint); }
  ${SHELL} .plugin-picker-trigger[aria-expanded="true"] > svg:last-child { transform: rotate(180deg); }
  ${SHELL} .plugin-picker-current { display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
  ${SHELL} .plugin-picker-chip { display: inline-flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; color: inherit; }
  ${SHELL} .plugin-picker-chip svg { flex: none; width: 16px; height: 16px; }
  /* Split work area: one chip per pane; the focused pane reads darker. */
  ${SHELL} .is-split .plugin-picker-chip { padding: 0 8px; border-radius: 6px; color: var(--muted); }
  ${SHELL} .is-split .plugin-picker-chip.is-focused { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
  ${SHELL} .plugin-picker-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  html ${SHELL} .workbench-bar .plugin-picker-popover {
    position: absolute; z-index: 60; left: -8px; bottom: calc(100% + 16px); width: 560px; max-height: min(80dvh, 760px); overflow: auto; padding: 8px;
    border-radius: 14px; background: var(--paper); box-shadow: var(--lift-3);
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover[hidden] { display: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail { position: static; display: block; width: auto; height: auto; overflow: visible; background: transparent; border: 0; padding: 0; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail::before { content: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 0; overflow: visible; background: transparent; box-shadow: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items [data-rail-zone] { display: flex !important; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items p[data-rail-zone] { display: block !important; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-toggle { display: none !important; }
  /* A launcher: two columns of entries, each a name with one line saying what the person gets there. */
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 8px; }
  @media (min-width: 1100px) {
    html ${SHELL} .workbench-bar .plugin-picker-popover { width: 880px; }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  /* Each entry ends in a button, so a wide window gives the names and their one line more room. */
  @media (min-width: 1360px) {
    html ${SHELL} .workbench-bar .plugin-picker-popover { width: 980px; }
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items p[data-rail-zone] { grid-column: 1 / -1; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[data-rail-zone] {
    display: grid !important; grid-template-columns: 16px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 0; align-items: center; align-content: center;
    width: 100%; height: auto; min-height: 44px; padding: 4px 12px; border-radius: 8px; text-align: left;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; line-height: 18px; color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item .plugin-rail-hint { display: block; grid-column: 2; grid-row: 2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; line-height: 16px; color: var(--muted); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item:not(:has(.plugin-rail-hint)) { grid-template-rows: auto; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item svg { grid-row: 1; width: 16px; height: 16px; color: var(--ink-soft); }
  html ${SHELL} .workbench-bar .plugin-picker-popover :is(.plugin-rail-group, .plugin-rail-subgroup) {
    width: auto; height: auto; margin: 8px 0 4px; padding: 0 12px; background: none; overflow: visible; color: var(--muted); font-size: 11px; font-weight: 500; line-height: 18px;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items[data-seg-thumb]::before { display: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] > span { color: var(--ink); font-weight: 500; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] svg { color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item:not([aria-current]):hover { background: var(--nav-hover); }
  /* One tile per plugin: the entry, and at its end two small buttons (keep it in the Dock; add it to / remove it from the
     project) that are there only while the tile is looked at (the pointer on it, or keyboard focus within; a press leaves no trace). The row yields to them the way DropAgent's directory rows do:
     its text gives up the room at once, the buttons ease in, and nothing slides under the pointer. */
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile { position: relative; min-width: 0; border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile > .plugin-rail-item[data-rail-zone] { width: 100%; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile:has(> .plugin-rail-item[aria-current]) { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile:not(:has(> .plugin-rail-item[aria-current])):hover { background: var(--nav-hover); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile > .plugin-rail-item:is([aria-current], :hover) { background: transparent; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile:is(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-item[data-rail-zone] { padding-right: var(--tile-yield, 72px); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-ops { position: absolute; top: 0; right: 6px; bottom: 0; display: flex; align-items: center; gap: 4px; pointer-events: none; }
  /* The two buttons are the floor's size (--control-h: 32px, 28px compact; 44px on touch, in touch-targets.ts), and the row gives up their room. */
  .plugin-picker-popover { --ops-btn: var(--control-h, 32px); --tile-yield: calc(var(--ops-btn) * 2 + 16px); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-ops > .mw-btn {
    width: var(--ops-btn); min-width: var(--ops-btn); min-height: var(--ops-btn);
    opacity: 0; transform: translateX(8px) scale(.92);
    transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-ops > .mw-btn:disabled { --ops-opacity: .4; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:is(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-ops { pointer-events: auto; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:is(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-ops > .mw-btn { opacity: var(--ops-opacity, 1); transform: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:is(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-ops > .mw-btn + .mw-btn { transition-delay: 32ms, 32ms, 0s, 0s; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:is(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-ops > .mw-btn:active:not(:disabled) { transform: scale(.94); transition-duration: var(--dur-press); transition-delay: 0s; }
  /* A kept plugin carries a small pin at rest (its text leaves it room); looked at, the buttons take its place. */
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile.is-kept:not(:hover, :has(:focus-visible), .is-confirming) > .plugin-rail-item[data-rail-zone] { padding-right: 36px; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-mark { position: absolute; top: 50%; right: 14px; display: grid; place-items: center; width: 14px; height: 14px; margin-top: -7px; color: var(--faint); opacity: 0; font-style: normal; pointer-events: none; transition: opacity var(--dur-hover) var(--ease-quint); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-mark svg { grid-row: auto; width: 13px; height: 13px; color: inherit; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-kept:not(:hover, :has(:focus-visible), .is-confirming) .plugin-rail-mark { opacity: 1; }
  /* The glyphs: the pin stands up when kept. The toggle holds both a plus and a trash can and shows the one that fits — the plus
     while the plugin is not in the project, a red trash can once it is — swapping in place (opacity and transform only). */
  html ${SHELL} .workbench-bar .plugin-picker-popover .dock-keep svg, html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-toggle svg { width: 14px; height: 14px; transition: transform var(--dur-move) var(--ease-spring); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .dock-keep[aria-pressed="false"] svg { transform: rotate(32deg); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-toggle { display: inline-grid; place-items: center; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-toggle > svg { grid-area: 1 / 1; transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available .plugin-toggle > .plugin-toggle-remove { opacity: 0; transform: scale(.5) rotate(-18deg); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:not(.is-available) .plugin-toggle > .plugin-toggle-add { opacity: 0; transform: scale(.5) rotate(45deg); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:not(.is-available) .plugin-toggle:not(:disabled) { color: var(--red); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile:not(.is-available, .is-confirming) .plugin-toggle:not(:disabled):hover { background: color-mix(in srgb, var(--red) 13%, var(--control-fill)); }
  /* Not in this project: the whole entry is grey and inert; it wakes (tone only) when the plugin comes in. */
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile .plugin-rail-item > span,
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile .plugin-rail-item > svg,
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile .plugin-rail-hint { transition: color var(--dur-move) var(--ease-quint); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available > .plugin-rail-item { cursor: default; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available .plugin-rail-item > span,
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available .plugin-rail-item > svg,
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available .plugin-rail-hint { color: var(--faint); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-available:hover { background: transparent; }
  /* Removing asks once, in the tile's own second line: the hint gives way to what will go, the trash can fills red. */
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-confirm { grid-row: 2; grid-column: 2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; line-height: 16px; color: var(--tone-blocked); opacity: 0; transition: opacity var(--dur-hover) var(--ease-quint); pointer-events: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile .plugin-rail-hint { transition: opacity var(--dur-hover) var(--ease-quint), color var(--dur-move) var(--ease-quint); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-confirming .plugin-rail-hint { opacity: 0; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-confirming .plugin-rail-confirm { opacity: 1; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-confirming .plugin-toggle:not(:disabled) { border-color: var(--danger-action); background: var(--danger-action); color: var(--danger-action-ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-busy > .plugin-rail-ops { pointer-events: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-tile.is-busy > .plugin-rail-ops > .mw-btn { --ops-opacity: .55; }
  /* Without a pointer to look with, the buttons stay and the row keeps their room. */
  @media (hover: none) {
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-tile > .plugin-rail-item[data-rail-zone] { padding-right: var(--tile-yield, 72px); }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-ops { pointer-events: auto; }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-ops > .mw-btn { opacity: var(--ops-opacity, 1); transform: none; }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-mark { display: none; }
  }
  /* The switcher at the bar's left: where you are, and every plugin; at its head, search and the market and the studio. */
  ${SHELL} .bar-start .plugin-picker { flex: none; max-width: 60%; }
  ${SHELL} .plugin-picker-all { display: none; }
  ${SHELL} .plugin-picker-all svg { width: 20px; height: 20px; stroke-width: 1.6; }
  ${SHELL} .bar-start .plugin-picker-trigger { height: var(--dock-btn, 38px); position: relative; }
  ${SHELL} .plugin-picker[data-market-updates] > .plugin-picker-trigger::after {
    content: ""; position: absolute; top: 7px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
  }
  /* The head: search, and beside it the two ways to get more plugins — the market and the studio — as buttons, not rows among
     the places. Where the room runs out the buttons wrap under search; on a window it stays in view while a long list scrolls
     under it (and what is scrolled to keeps clear of it). */
  html ${SHELL} .workbench-bar .plugin-picker-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -8px -8px 0; padding: 8px 8px 6px; border-radius: 14px 14px 0 0; background: var(--paper); }
  @media (min-width: 761px) {
    html ${SHELL} .workbench-bar .plugin-picker-popover { scroll-padding-top: 52px; }
    html ${SHELL} .workbench-bar .plugin-picker-head { position: sticky; top: -8px; z-index: 3; }
  }
  html ${SHELL} .workbench-bar .plugin-picker-head .plugin-picker-search { flex: 1 1 200px; width: auto; min-width: 0; margin: 0; }
  html ${SHELL} .workbench-bar .plugin-picker-extend { flex: 0 1 auto; display: flex; gap: 8px; min-width: 0; }
  html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-picker-extend-btn { flex: 1 1 auto; justify-content: flex-start; gap: 8px; height: var(--menu-row, 34px); min-height: var(--menu-row, 34px); padding: 0 12px; border-radius: 8px; font-size: 13px; white-space: nowrap; }
  html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-picker-extend-btn svg { width: 15px; height: 15px; color: var(--ink-soft); }
  html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-picker-extend-btn[aria-current] { background: var(--nav-active); box-shadow: inset 0 0 0 1px var(--line-strong); }
  html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-picker-extend-btn[aria-current] svg { color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-extend .plugin-rail-update-count { position: static; margin-left: 2px; }
  /* Search heads the list: finding a place is part of going there (⌘K opens it from anywhere). */
  html ${SHELL} .workbench-bar .plugin-picker-search { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; margin: 0 0 6px; padding: 0 10px; border: 0; border-radius: 8px;
    background: var(--wash); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  html ${SHELL} .workbench-bar .plugin-picker-search:hover { background: var(--nav-hover); color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-search:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  html ${SHELL} .workbench-bar .plugin-picker-search svg { flex: none; width: 15px; height: 15px; }
  html ${SHELL} .workbench-bar .plugin-picker-search > span { flex: 1; text-align: left; }
  html ${SHELL} .workbench-bar .plugin-picker-search kbd { padding: 0 4px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--line-strong); font: inherit; font-size: 11px; line-height: 16px; }
  @media (hover: none) { html ${SHELL} .workbench-bar .plugin-picker-search kbd { display: none; } }
  /* Its answers open above the bar and stay until closed: one tab per open work, the work's side pane on the left
     (what it is, how it got here, what it used, what it made) and the conversation on the right, right above the input. */
  ${ASSIST} .assistant-panel {
    --assistant-side-w: 272px;
    /* --assistant-room: space left before the platform side panel, set only while it is open. */
    position: absolute; z-index: 50; left: -40px; right: calc(-1 * min(40px, var(--assistant-room, 40px))); bottom: calc(100% + 8px + var(--next-row, 0px) + var(--context-row, 0px)); display: flex; flex-direction: column; overflow: hidden;
    height: min(620px, calc(100dvh - var(--desktop-titlebar-height, 0px) - var(--dock-h, 76px) - 32px));
    border-radius: 16px; background: var(--paper); box-shadow: var(--lift-3); transform-origin: bottom center; animation: craft-dock-rise var(--dur-move) var(--ease-quint) both;
  }
  ${ASSIST} .assistant-panel[hidden] { display: none; }
  /* A wide window keeps the conversation over the input and opens the side pane to its left. */
  @media (min-width: 1240px) {
    ${ASSIST} .assistant-panel[data-layout="split"][data-side="open"] { left: calc(-1 * var(--assistant-side-w) - 24px); right: calc(-1 * min(24px, var(--assistant-room, 24px))); }
  }
  /* The tab strip: the open works, a new one, then all works, the side pane and minimise. */
  ${ASSIST} .assistant-tabbar { flex: none; display: flex; align-items: flex-end; gap: 4px; height: 42px; padding: 6px 6px 0 8px; background: var(--desk); box-shadow: inset 0 -1px 0 var(--line); }
  ${ASSIST} .assistant-tabs { position: relative; flex: 0 1 auto; min-width: 0; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; overflow-y: hidden; }
  ${ASSIST} .assistant-tab { position: relative; flex: 0 1 184px; width: 184px; min-width: 96px; display: flex; align-items: center; height: 34px; border-radius: 9px 9px 0 0; color: var(--muted); }
  ${ASSIST} .assistant-tab:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${ASSIST} .assistant-tab[data-current] { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line); clip-path: inset(-1px -1px 0 -1px); }
  ${ASSIST} .assistant-tab-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 4px 0 10px; border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-tab-main:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-tab[data-current] .assistant-tab-main { font-weight: 500; }
  ${ASSIST} .assistant-tab-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The marks, shared by tabs and the list of works: waiting on you, running, news not yet seen, did not finish. */
  ${ASSIST} .assistant-tab-mark { flex: none; display: none; width: 20px; height: 20px; }
  ${ASSIST} [data-mark] .assistant-tab-mark { display: inline-block; }
  ${ASSIST} .assistant-tab-close { flex: none; display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 6px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; line-height: 1; cursor: pointer; opacity: 0; }
  ${ASSIST} .assistant-tab:is(:hover, [data-current], :focus-within) .assistant-tab-close { opacity: 1; }
  ${ASSIST} .assistant-tab-close:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action) { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  ${ASSIST} .assistant-tab-new { margin-bottom: 3px; }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action):hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action) svg { width: 14px; height: 14px; }
  ${ASSIST} .assistant-tabbar-actions { flex: none; display: flex; align-items: center; gap: 2px; margin-left: auto; align-self: center; }
  ${ASSIST} .assistant-tabbar .dock-window-action:is([aria-expanded="true"]) { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-side-toggle { position: relative; }
  ${ASSIST} .assistant-side-dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--tone-attention, var(--amber, #c27c0e)); }
  ${ASSIST} .assistant-side-dot[hidden], ${ASSIST} .assistant-panel[data-side="open"] .assistant-side-dot { display: none; }
  /* All works: a dropdown under the tabs, grouped by what waits on you, what runs, and the rest. */
  ${ASSIST} .assistant-works { position: absolute; z-index: 6; top: 44px; right: 8px; display: flex; flex-direction: column; gap: 1px; width: min(340px, calc(100% - 16px)); max-height: min(440px, 70%); overflow: auto; padding: 6px; border-radius: 10px; background: var(--paper); box-shadow: var(--lift-3); }
  ${ASSIST} .assistant-works[hidden] { display: none; }
  ${ASSIST} .assistant-works-group { margin: 8px 12px 2px; font-size: 11px; color: var(--faint); }
  ${ASSIST} .assistant-works-item {
    display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; padding: 8px 12px; border: 0; border-radius: 7px;
    background: transparent; color: var(--ink-soft); font: inherit; text-align: left; cursor: pointer;
  }
  ${ASSIST} .assistant-works-item:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-works-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-works-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-works-head { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
  ${ASSIST} .assistant-works-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  ${ASSIST} .assistant-works-meta { font-size: 11px; color: var(--muted); }
  ${ASSIST} .assistant-works-new { flex-direction: row; font-size: 13px; color: var(--muted); }
  /* The body: side pane and conversation. A narrow panel lays the side pane over the conversation as a drawer. */
  ${ASSIST} .assistant-body { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: var(--assistant-side-w) minmax(0, 1fr); }
  ${ASSIST} .assistant-panel:is([data-side="closed"], [data-layout="drawer"]) .assistant-body { grid-template-columns: minmax(0, 1fr); }
  ${ASSIST} .assistant-side { min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 14px; padding: 14px 12px 16px 14px; background: var(--paper); box-shadow: inset -1px 0 0 var(--line); font-size: 12px; line-height: 1.5; }
  ${ASSIST} .assistant-panel[data-side="closed"] .assistant-side { display: none; }
  ${ASSIST} .assistant-panel[data-layout="drawer"] .assistant-side { position: absolute; z-index: 4; top: 0; bottom: 0; left: 0; width: min(var(--assistant-side-w), 100%); box-shadow: var(--lift-3); }
  ${ASSIST} .assistant-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  /* The conversation's top line, shown only while the side pane is out of sight and something needs a hand. */
  ${ASSIST} .assistant-strip { flex: none; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 10px 6px 12px; background: var(--paper); box-shadow: inset 0 -1px 0 var(--line); }
  ${ASSIST} .assistant-strip[hidden] { display: none; }
  ${ASSIST} .assistant-strip[data-tone="waiting"] { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 11%, var(--paper)); }
  ${ASSIST} .assistant-strip[data-tone="running"] { background: color-mix(in srgb, var(--tone-done, #3a8f5c) 8%, var(--paper)); }
  ${ASSIST} .assistant-strip .assistant-state { flex: none; }
  ${ASSIST} .assistant-strip-now { flex: 1; min-width: 0; overflow: hidden; color: var(--ink-soft); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-strip-actions { flex: none; display: flex; align-items: center; gap: 4px; }
`;
