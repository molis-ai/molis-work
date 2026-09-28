import { MW_PLUGINS } from "../palette.js";

/** Craft finish: the last layer of every Molis Work page.
 *
 * One spatial idea runs through it. The chrome — titlebar, plugin rail, directory — is a quiet
 * desk. The work itself is one sheet of paper lying on it: rounded, edged with one hairline, the
 * same for every plugin, so opening Feed or a Goal never changes what kind of place you are in.
 *
 * Surfaces are flat and solid. Depth is a hairline, never a gradient; only things that truly
 * float — menus, dialogs, tooltips, toasts — cast a shadow. Colour says status or selection and
 * nothing else, so icons and labels stay neutral.
 *
 * Movement follows three rules. A press answers under the finger (a small give, then a spring
 * back). Arriving content rises a few pixels while it fades in. Only events that finish
 * something — a Goal closing, a new item landing — get a moment of their own.
 *
 * Structure, density and domain ownership stay with the layers before this one; this layer
 * owns tone, depth, corners and motion. `prefers-reduced-motion` removes every movement here.
 */

const WORKBENCH = "body.immersive-workbench";
const SHELL = "body.immersive-workbench:not([data-pane-embedded])";
const RAIL_LINK = ":is(.plugin-rail, .assistant-island, .workspace-chrome) :is(.immersive-plugin-link, .navigator-project-search, .navigator-project-settings, .navigator-directory-toggle, .immersive-show-directory, .personal-account)";
const PAGES = "body:is(.immersive-workbench, .settings-page, .project-index-page, .project-preferences-page)";

/** Dialogs that open in the middle of the viewport. Edge sheets travel in from their edge instead. */
const CENTRED_DIALOG = ":is(dialog.mw-dialog, dialog.global-search-dialog, dialog.runtime-plan-dialog, dialog.inbox-compose-dialog, dialog.pb-publish-dialog, dialog.pb-record-editor):not(.mw-sheet)";

/** Popovers and menus that drop from the control that opened them. */
const DROPDOWN = ":is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tree-filter, .feed-filter-panel, .source-filter-menu > .source-filter-row, .project-record-filter-menu > div, .tui-menu, .tab-menu, .assistant-composer)";

function viewChipTints(): string {
  return MW_PLUGINS.map((plugin) => `${PAGES} .tab-view-chip[data-plugin="${plugin.id}"] { --plugin-tint: var(--plugin-${plugin.id}); }`).join("\n  ");
}

const CRAFT_BASE_STYLES = `
  /* ─── Tokens ───────────────────────────────────────────────────────────── */
  :root,
  ${PAGES} {
    --r-tag: 5px; --r-row: 8px; --r-control: 9px; --r-card: 12px; --r-sheet: 12px; --r-dialog: 16px;
    --sheet-inset: 8px;
    --desk: var(--page);
    --ease-quint: cubic-bezier(.22, 1, .36, 1);
    --ease-spring: cubic-bezier(.34, 1.45, .64, 1);
    --ease-swift: cubic-bezier(.4, 0, .2, 1);
    --dur-press: 110ms; --dur-hover: 140ms; --dur-move: 220ms; --dur-arrive: 320ms; --dur-moment: 640ms;
    /* In-page depth is a hairline ring; --lift-3 is the one shadow, kept for overlays that float. */
    --lift-1: 0 0 0 1px var(--line);
    --lift-2: 0 0 0 1px var(--line-strong);
    --lift-3: 0 0 0 1px var(--line), 0 16px 40px -16px rgba(19, 21, 32, .22);
    --sheet-shadow: 0 0 0 1px var(--line);
    --press-shade: color-mix(in srgb, var(--ink) 5%, transparent);
    --tip-bg: #1c1d21; --tip-ink: #f4f5f6;
    --celebrate-a: var(--hue-green-fill, #4cb782);
    --celebrate-b: var(--hue-indigo-fill, #5e6ad2);
    --celebrate-c: var(--hue-yellow-fill, #e2b203);
  }
  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] ${PAGES} {
    --lift-1: 0 0 0 1px var(--line);
    --lift-2: 0 0 0 1px var(--line-strong);
    --lift-3: 0 0 0 1px var(--line-strong), 0 20px 48px -16px rgba(0, 0, 0, .7);
    --sheet-shadow: 0 0 0 1px var(--line);
    --press-shade: color-mix(in srgb, var(--ink) 7%, transparent);
    --tip-bg: #f4f5f6; --tip-ink: #16171a;
  }

  /* ─── Desk and sheet ───────────────────────────────────────────────────── */
  ${WORKBENCH} .immersive-workspace { background: var(--desk); }
  ${SHELL} .immersive-titlebar { background: var(--desk); box-shadow: none; }
  ${SHELL} .plugin-stack { background: var(--desk); border-right: 0; }
  ${SHELL} .tree-pane { background: var(--desk); border-right: 0; box-shadow: none; }
  @media (min-width: 601px) {
    ${SHELL} .tab-workspace { padding: 0 var(--sheet-inset) var(--sheet-inset) 0; background: var(--desk); box-sizing: border-box; }
    ${SHELL} .tab-workspace-panes { background: transparent; }
    ${SHELL} .tab-workspace-panes > .tab-pane,
    ${SHELL} .tab-workspace-exclusive {
      border-radius: var(--r-sheet); overflow: clip; background: var(--paper); box-shadow: var(--sheet-shadow);
    }
    ${SHELL} .tab-workspace-panes > .tab-content-frame { border-radius: var(--r-sheet); overflow: clip; }
    ${SHELL} .tab-workspace[data-exclusive] .tab-workspace-exclusive { inset: 0 var(--sheet-inset) var(--sheet-inset) 0; }
    ${SHELL} .tab-workspace-panes > .tab-pane.is-focused { box-shadow: var(--sheet-shadow); }
    ${SHELL} .tab-workspace-panes:has(> .tab-pane + .tab-pane) > .tab-pane.is-focused {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent);
    }
    /* The directory sits on the desk; one hair of desk separates it from the sheet. */
    ${SHELL} .tree-pane:not([hidden]) + .tree-resizer { background: transparent; }
  }
  /* Settings documents keep their grouped cards; the sheet under them is a half-step off paper. */
  ${WORKBENCH} .tab-workspace-exclusive > .settings-stage { background: color-mix(in srgb, var(--desk) 50%, var(--paper)); }
  /* The sheet is the card now; the home page no longer draws a second one inside it. */
  ${WORKBENCH} .immersive-home .home-dayview { box-shadow: none; border-radius: 0; background: transparent; }
  ${WORKBENCH} .tab-pane-body > .immersive-home,
  ${WORKBENCH} .immersive-workspace .immersive-plugin-stage > .immersive-home { padding: 0; }
  @media (min-width: 761px) {
    ${WORKBENCH} .immersive-home .home-flow { column-gap: 0; grid-template-columns: 112px minmax(0, 1fr) 0px; }
    ${WORKBENCH} .immersive-home[data-event="on"] .home-flow { grid-template-columns: 112px minmax(0, 1fr) clamp(300px, 26vw, 372px); }
    ${WORKBENCH} .immersive-home .home-dates { padding: 10px 8px 0; background: var(--paper); box-shadow: inset -1px 0 0 var(--line); }
    ${WORKBENCH} .immersive-home[data-event="on"] .home-flow { padding-right: 0; }
    ${WORKBENCH} .immersive-home .home-eventcol { box-shadow: inset 1px 0 0 var(--line); background: var(--paper); }
  }

  /* ─── Titlebar tabs: quiet pills; the current one is a small piece of the sheet ── */
  ${SHELL} .immersive-titlebar .tab-strip--chrome { gap: 2px; }
  ${WORKBENCH} .tab-strip .tab-item {
    border-radius: 7px; background: transparent; box-shadow: none; color: var(--muted);
    transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-swift);
  }
  ${WORKBENCH} .tab-strip .tab-item:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${WORKBENCH} .tab-strip .tab-item[aria-current],
  ${WORKBENCH} .tab-strip .tab-item:has([aria-selected="true"]) {
    background: var(--paper); color: var(--ink); box-shadow: var(--lift-1);
  }
  ${WORKBENCH} .tab-strip .tab-item svg { color: var(--muted); transition: color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .tab-strip .tab-item:is(:hover, [aria-current]) svg { color: var(--ink-soft); }
  ${WORKBENCH} .tab-strip .tab-item:active:not(:has(.tab-item-close:active)) { transform: scale(.975); }
  ${WORKBENCH} .tab-strip .tab-item.is-dragging,
  ${WORKBENCH} .tab-strip .tab-item[data-dragging] { box-shadow: var(--lift-3); background: var(--paper); }
  ${WORKBENCH} .tab-strip .tab-item-close { border-radius: 5px; }
  ${WORKBENCH} .tab-strip .tab-item-close:hover { background: var(--nav-active); color: var(--ink); }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button) { border-radius: 7px; }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button):active:not(:disabled) svg { transform: scale(.86); }
  ${WORKBENCH} :is(.tab-add-button, .tab-split-button, .workspace-history-button) svg { transition: transform var(--dur-move) var(--ease-spring); }

  /* Where am I: the plugin whose page this pane shows, ahead of the item tabs. */
  ${PAGES} .tab-view-chip {
    flex: none; display: inline-flex; align-items: center; gap: 6px; height: 26px; margin: 0 2px 0 0; padding: 0 10px 0 8px;
    border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-swift);
  }
  ${PAGES} .tab-view-chip svg { width: 14px; height: 14px; color: var(--ink-soft); }
  ${PAGES} .tab-view-chip:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${PAGES} .tab-view-chip[aria-current="page"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); cursor: default; }
  ${PAGES} .tab-view-chip.is-exclusive svg { color: var(--ink-soft); }
  /* Under a cover only the cover is current; the tabs beneath wait, one click away. */
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) .tab-item:is([aria-current], :has([aria-selected="true"])) { background: transparent; box-shadow: none; color: var(--muted); }
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) .tab-item:is([aria-current], :has([aria-selected="true"])):hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${PAGES} .tab-view-chip:active:not([aria-current="page"]) { transform: scale(.97); }
  ${PAGES} .tab-view-chip + .tab-view-divider { flex: none; width: 1px; height: 14px; margin: 0 4px 0 2px; background: var(--line-strong); align-self: center; }
  ${WORKBENCH} .tab-pane > .tab-strip .tab-view-chip { height: 24px; }
  ${viewChipTints()}

  /* ─── Plugin rail: this project — where the work lives and its plugins; the account at the foot ── */
  :root ${SHELL} :is(.assistant-island-card, .workspace-chrome .navigator-project-primary, .plugin-rail-items, .plugin-rail .personal-sidebar-footer) {
    background: transparent; box-shadow: none; border: 0;
  }
  /* The zone hairline above the account sits in the 8px gap and takes no height. */
  @media (min-width: 601px) {
    ${SHELL} .plugin-rail { position: relative; overflow: visible; }
    ${SHELL} .plugin-rail > .personal-sidebar-footer { position: relative; }
    ${SHELL} .plugin-rail > .personal-sidebar-footer::before {
      content: ""; position: absolute; z-index: 1; top: -4.5px; left: 50%; width: 20px; height: 1px; margin-left: -10px;
      background: var(--line); pointer-events: none;
    }
    ${SHELL} .plugin-rail-items { overflow-x: hidden; }
  }
  /* Headings are hairlines in the icon rail and quiet words once names are shown. */
  ${SHELL} :is(.plugin-rail-group, .plugin-rail-subgroup) {
    flex: none; width: 16px; height: 1px; margin: 6px auto; padding: 0; overflow: hidden;
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
    transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift);
  }
  /* Icons stay neutral: position and a name say which tool it is, not a colour. */
  ${SHELL} ${RAIL_LINK} svg { color: var(--muted); transition: color var(--dur-hover) var(--ease-swift); }
  ${SHELL} ${RAIL_LINK}:hover { background: var(--nav-hover); }
  ${SHELL} ${RAIL_LINK}:is(:hover, [aria-current], [aria-expanded="true"]) svg { color: var(--ink); }
  ${SHELL} :is(.plugin-rail-items, .assistant-island-card)[data-seg-thumb]::before { border-radius: 8px; background: var(--nav-active); }
  ${SHELL} .plugin-rail a.plugin-rail-item { text-decoration: none; color: inherit; }
  ${SHELL} .plugin-rail-items .immersive-plugin-link { position: relative; }
  /* The rail's own toggle lives with Back and Forward in the titlebar, where macOS keeps a sidebar button. */
  ${SHELL} .workspace-history .navigation-labels-toggle { flex: none; align-self: center; margin: 0; padding: 0; min-height: 0; }
  ${SHELL} .navigator-project-search :is(.navigator-project-search-label, kbd) { display: none; }
  /* Project settings live in the project's menu; the menu reads as a short list. */
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage) {
    display: flex; align-items: center; gap: 8px; width: auto; height: 32px; min-height: 32px; margin: 0; padding: 0 10px; border-radius: 8px;
    background: transparent; box-shadow: none; color: var(--ink-soft); font-size: 13px; text-decoration: none;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-settings { margin-top: 5px; border-top: 0; }
  ${SHELL} .navigator-project-menu-popover > .navigator-project-manage + .navigator-project-settings { box-shadow: 0 -3px 0 -2px var(--line); }
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage):hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .navigator-project-menu-popover :is(.navigator-project-settings, .navigator-project-manage) svg { width: 15px; height: 15px; color: var(--muted); }
  ${SHELL} .navigator-project-menu-popover > nav + .navigator-project-settings { box-shadow: 0 -5px 0 -4px var(--line); }

  /* Names shown: a 208px sidebar — project, search, backbone, tools, then the person. */
  @media (min-width: 761px) {
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-primary {
      display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; align-items: center; gap: 6px; padding: 10px 16px 0;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-primary > * { grid-column: 1; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-menu { grid-row: 1; width: auto; min-width: 0; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search { grid-row: 2; }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome :is(.desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .immersive-workspace .navigator-project-selector {
      width: 100%; height: 34px; justify-content: flex-start; gap: 9px; padding: 0 8px 0 6px; border-radius: 8px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-selector strong { font-size: 13px; font-weight: 500; color: var(--ink); }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search {
      display: flex; align-items: center; width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 8px; padding: 0 8px 0 10px; border-radius: 8px;
      background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); color: var(--faint); font-size: 12px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .workspace-chrome .navigator-project-search:hover { box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--muted); }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-search .navigator-project-search-label { display: inline; flex: 1; text-align: left; }
    ${SHELL}:not([data-navigation-labels="false"]) .navigator-project-search kbd {
      display: inline; padding: 0 5px; border-radius: 4px; background: transparent; box-shadow: inset 0 0 0 1px var(--line);
      color: var(--faint); font: inherit; font-size: 10.5px; line-height: 17px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-items { align-items: stretch; padding: 4px 16px 8px; gap: 1px; }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item {
      width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 10px; padding: 0 10px; border-radius: 8px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item svg { width: 16px; height: 16px; }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item > span { font-size: 13px; color: var(--ink-soft); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-item:is([aria-current], [aria-expanded="true"]) > span { color: var(--ink); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-toggle > span { color: var(--muted); }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail-group, .plugin-rail-subgroup) {
      width: auto; height: auto; margin: 14px 0 3px; padding: 0 10px; background: none; overflow: visible;
      color: var(--faint); font-size: 11px; line-height: 18px; letter-spacing: .02em;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail-subgroup { margin-top: 8px; color: var(--faint); font-size: 11px; }
    /* The account is the first container of the bottom row: the same 36px paper chip and hairline as the Dock beside it. */
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail > .personal-sidebar-footer::before { content: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-sidebar-footer {
      flex-direction: row; align-items: center; gap: 0; width: auto; height: 36px; min-height: 36px; margin: 0 8px; padding: 0 5px 0 0;
      border-radius: 10px; background: var(--paper); box-shadow: 0 0 0 1px var(--line);
      transition: box-shadow var(--dur-hover) var(--ease-swift);
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-sidebar-footer:hover { box-shadow: 0 0 0 1px var(--line-strong); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account {
      flex: 1; width: auto; min-width: 0; height: 36px; min-height: 36px; gap: 8px; padding: 0 8px 0 10px;
      border-radius: 10px 0 0 10px; background: transparent;
    }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account:hover { background: transparent; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-avatar { width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft); box-shadow: none; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-avatar svg { width: 12px; height: 12px; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy { display: flex; align-items: baseline; gap: 6px; min-width: 0; overflow: hidden; white-space: nowrap; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy strong { font-size: 13px; font-weight: 400; line-height: 18px; color: var(--ink-soft); }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .personal-account-copy small { font-size: 12px; line-height: 18px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; }
    ${SHELL}:not([data-navigation-labels="false"]) .plugin-rail .account-global-trigger { width: 28px; height: 28px; border-radius: 7px; }
  }
  /* A phone has no personal row at the top: the Dock carries those entries at the foot of the page. */
  @media (max-width: 600px) {
    ${SHELL} { --assistant-island-row: 0px; }
    /* The drawer lets the account menu open beyond its edge instead of clipping it. */
    ${SHELL} .plugin-rail { overflow: visible; }
  }

  /* ─── Bottom bar: the Dock, the resident Assistant, the project ────────────── */
  /* No rail: the work spans the window. The bar under it is the only chrome besides the titlebar. */
  ${SHELL} { --dock-h: 48px; }
  ${WORKBENCH}[data-pane-embedded] .workbench-bar { display: none; }
  @media (min-width: 601px) {
    ${SHELL}, ${SHELL}:not([data-navigation-labels="false"]) { --plugin-rail-width: 8px; }
    ${SHELL} .immersive-workspace,
    ${SHELL} .immersive-workspace.is-directory-collapsed,
    ${SHELL} .immersive-workspace.is-plugin-directory-empty { grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr) var(--dock-h); }
    ${SHELL} .immersive-workspace > .tree-pane { grid-row: 2; }
    ${SHELL} .immersive-plugin-stage { grid-row: 2; }
  }
  ${SHELL} .workbench-bar {
    grid-column: 1 / -1; grid-row: 3; position: relative; z-index: 30; min-width: 0;
    /* The end column is at least as wide as its fixed buttons (Shelf, 灵光, chat, project); otherwise they were squeezed
       to 18px or overlapped at ~760px. The Assistant keeps 200px down to the 601px desktop minimum. */
    display: grid; grid-template-columns: minmax(160px, 1fr) minmax(200px, 600px) minmax(max-content, 1fr); align-items: center; gap: 12px;
    padding: 0 8px 8px; background: var(--desk);
  }
  /* Each side stays inside its column: the Dock folds what does not fit instead of running under the Assistant. */
  ${SHELL} .bar-start { justify-self: start; position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
  ${SHELL} .bar-center { position: relative; min-width: 0; }
  html ${SHELL} .workbench-bar .bar-end { justify-self: stretch; position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
  ${SHELL} :is(.bar-start .account-global-trigger, .dock-pins, .bar-composer, .bar-resident, .bar-chat) { background: var(--paper); box-shadow: 0 0 0 1px var(--line); }

  /* Shelf and 灵光: the person's own, two icon buttons against the right beside the project. */
  ${SHELL} .bar-residents { display: flex; align-items: center; gap: 6px; min-width: 0; }
  ${SHELL} .bar-resident {
    display: inline-grid; place-items: center; flex: none; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 12px;
    color: var(--muted); cursor: pointer;
  }
  ${SHELL} .bar-resident svg { width: 18px; height: 18px; }
  ${SHELL} .bar-resident:hover { box-shadow: 0 0 0 1px var(--line-strong); color: var(--ink); }
  ${SHELL} .bar-resident[aria-current] { background: var(--nav-active); color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong); }
  ${SHELL} .bar-resident:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  /* The project's discussion: one button, one click, group and direct chat open beside the work. */
  ${SHELL} .bar-chat {
    display: inline-grid; place-items: center; flex: none; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 12px;
    color: var(--muted); cursor: pointer;
  }
  ${SHELL} .bar-chat svg { width: 18px; height: 18px; }
  ${SHELL} .bar-chat:hover { box-shadow: 0 0 0 1px var(--line-strong); color: var(--ink); }
  ${SHELL} .bar-chat[aria-expanded="true"] { background: var(--nav-active); color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong); }
  ${SHELL} .bar-chat:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }

  /* The Dock menu: which plugins stay, what is yours everywhere, settings and the account. */
  ${SHELL} .bar-start .personal-sidebar-footer { display: contents; }
  ${SHELL} .account-global-menu { position: relative; flex: none; }
  ${SHELL} .account-global-trigger {
    position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px;
    color: var(--muted); list-style: none; cursor: pointer; transition: box-shadow var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} .account-global-trigger::-webkit-details-marker { display: none; }
  ${SHELL} .account-global-trigger svg { width: 18px; height: 18px; }
  ${SHELL} :is(.account-global-trigger:hover, .account-global-menu[open] > .account-global-trigger) { box-shadow: 0 0 0 1px var(--line-strong); color: var(--ink); }
  ${SHELL} .account-global-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .account-global-menu:not([open]):has([data-market-update-count]:not([hidden])) > .account-global-trigger::after {
    content: ""; position: absolute; top: 7px; right: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent, var(--blue));
  }
  ${SHELL} .account-global-popover {
    position: absolute; z-index: 60; left: 0; bottom: calc(100% + 8px); display: grid; gap: 1px; width: 264px; max-height: min(70dvh, 620px); overflow: auto; padding: 6px;
    border-radius: var(--r-card); background: var(--paper); box-shadow: var(--lift-3);
  }
  ${SHELL} .account-global-heading { margin: 6px 8px 2px; color: var(--faint); font-size: 11px; line-height: 18px; }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice) {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 10px; width: 100%; height: 32px; min-height: 32px;
    margin: 0; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; box-shadow: none;
    color: var(--ink-soft); font: inherit; font-size: 13px; text-align: left; text-decoration: none; cursor: pointer;
  }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice) svg { flex: none; width: 16px; height: 16px; color: var(--muted); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice):hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .account-global-popover .dock-choice > span { flex: 1; min-width: 0; text-align: left; }
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"] { color: var(--ink); }
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"] svg { color: var(--ink-soft); }
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"]::after {
    content: ""; flex: none; width: 9px; height: 5px; margin: -3px 2px 0 0; border-left: 1.5px solid var(--ink); border-bottom: 1.5px solid var(--ink); transform: rotate(-45deg);
  }
  ${SHELL} .account-global-popover .dock-choice:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .account-global-popover .dock-choices { display: grid; gap: 1px; }
  ${SHELL} .account-global-popover .plugin-rail-update-count { position: static; margin-left: auto; }
  ${SHELL} .account-global-popover > .account-global-item:last-of-type { margin-bottom: 4px; }
  /* The person, under the project button: capabilities, settings, then who you are and where — nearest the button. */
  ${SHELL} .navigator-project-menu-popover .navigator-personal { display: grid; gap: 1px; margin-top: 5px; padding-top: 5px; box-shadow: inset 0 1px 0 var(--line); }
  /* Same row as the project's own entries above, so the icons and names line up down the menu. */
  ${SHELL} .navigator-personal .account-global-item { gap: 8px; }
  ${SHELL} .navigator-personal .account-global-item > svg { width: 15px; height: 15px; }
  ${SHELL} .navigator-personal .personal-account { height: 44px; margin-top: 4px; box-shadow: 0 -3px 0 -2px var(--line); }
  ${SHELL} .navigator-personal .personal-account-avatar { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft); }
  ${SHELL} .navigator-personal .personal-account-avatar svg { width: 13px; height: 13px; }
  ${SHELL} .navigator-personal .personal-account-copy { display: grid; gap: 0; min-width: 0; text-align: left; line-height: 16px; }
  ${SHELL} .navigator-personal .personal-account-copy strong { font-weight: 500; font-size: 13px; color: var(--ink); }
  ${SHELL} .navigator-personal .personal-account-copy small { font-size: 11px; color: var(--faint); }

  /* The Dock: 项目首页 first and always, then the plugins chosen to stay. */
  ${SHELL} .dock-pins { display: flex; flex: 0 1 auto; align-items: center; gap: 2px; min-width: 0; height: 40px; padding: 0 4px; border-radius: 12px; }
  ${SHELL} .dock-pin[hidden] { display: none; }
  ${SHELL} .dock-pin.dock-pin-more { flex: none; width: auto; min-width: 32px; padding: 0 7px; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--muted); }
  ${SHELL} .dock-pin.dock-pin-more:is([aria-expanded="true"], .has-current) { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .dock-overflow {
    position: absolute; z-index: 60; bottom: calc(100% + 8px); display: grid; gap: 1px; width: 208px; max-height: min(60dvh, 480px); overflow: auto; padding: 6px;
    border-radius: var(--r-card); background: var(--paper); box-shadow: var(--lift-3); transform-origin: bottom left; animation: craft-rise-from-bar 180ms var(--ease-quint) both;
  }
  ${SHELL} .dock-overflow[hidden] { display: none; }
  ${SHELL} .dock-overflow-item {
    display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 7px;
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  ${SHELL} .dock-overflow-item svg { flex: none; width: 16px; height: 16px; color: var(--muted); }
  ${SHELL} .dock-overflow-item:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-overflow-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .dock-overflow-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .dock-pins:empty { display: none; }
  ${SHELL} .dock-pin {
    display: grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px;
    background: transparent; color: var(--muted); cursor: pointer; transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} .dock-pin svg { width: 18px; height: 18px; }
  ${SHELL} .dock-pin:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-pin[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .dock-pin:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  /* 项目首页 stays put; a hairline sets it apart from the plugins you chose. */
  ${SHELL} .dock-pin.is-fixed { position: relative; margin-right: 5px; }
  ${SHELL} .dock-pin.is-fixed:not(:only-child)::after { content: ""; position: absolute; right: -4px; top: 7px; width: 1px; height: 18px; background: var(--line); pointer-events: none; }

  /* The resident Assistant, with the plugin switcher in front of it. */
  ${SHELL} .bar-composer {
    position: static; inset: auto; display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 6px;
    width: 100%; height: 40px; min-height: 40px; max-height: none; margin: 0; padding: 0 5px; border: 0; border-radius: 12px; overflow: visible;
    transition: box-shadow var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} .bar-composer:focus-within { box-shadow: 0 0 0 1px var(--line-strong); }
  ${SHELL} .bar-composer .assistant-composer-input { flex: 1; min-width: 0; }
  /* Search opens from the same input: a quiet glyph with its shortcut, the one mouse entry to ⌘K. */
  ${SHELL} .bar-composer-search {
    display: inline-flex; flex: none; align-items: center; gap: 5px; height: 28px; padding: 0 7px; border: 0; border-radius: 7px;
    background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} .bar-composer-search svg { width: 15px; height: 15px; }
  ${SHELL} .bar-composer-search kbd { font: inherit; color: var(--faint); }
  ${SHELL} .bar-composer-search:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .bar-composer-search:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  @media (max-width: 900px) { ${SHELL} .bar-composer-search kbd { display: none; } }
  ${SHELL} .plugin-picker { position: relative; flex: none; min-width: 0; max-width: 46%; }
  ${SHELL} .plugin-picker-trigger {
    display: flex; align-items: center; gap: 6px; max-width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 8px;
    background: var(--nav-hover); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${SHELL} .plugin-picker-trigger:hover, ${SHELL} .plugin-picker-trigger[aria-expanded="true"] { background: var(--nav-active); }
  ${SHELL} .plugin-picker-trigger > svg { flex: none; width: 12px; height: 12px; color: var(--muted); }
  ${SHELL} .plugin-picker-current { display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
  ${SHELL} .plugin-picker-chip { display: inline-flex; align-items: center; gap: 5px; min-width: 0; white-space: nowrap; color: var(--ink); }
  ${SHELL} .plugin-picker-chip svg { flex: none; width: 14px; height: 14px; }
  /* Split work area: one chip per pane; the focused pane reads darker. */
  ${SHELL} .is-split .plugin-picker-chip { padding: 0 6px; border-radius: 6px; color: var(--muted); }
  ${SHELL} .is-split .plugin-picker-chip.is-focused { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  ${SHELL} .plugin-picker-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  html ${SHELL} .workbench-bar .plugin-picker-popover {
    position: absolute; z-index: 60; left: -5px; bottom: calc(100% + 13px); width: 272px; max-height: min(70dvh, 620px); overflow: auto; padding: 6px;
    border-radius: var(--r-card); background: var(--paper); box-shadow: var(--lift-3);
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover[hidden] { display: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail { position: static; display: block; width: auto; height: auto; overflow: visible; background: transparent; border: 0; padding: 0; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail::before { content: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 0; overflow: visible; background: transparent; box-shadow: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items [data-rail-zone] { display: flex !important; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items p[data-rail-zone] { display: block !important; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-toggle { display: none !important; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item {
    width: 100%; height: 32px; min-height: 32px; justify-content: flex-start; gap: 10px; padding: 0 10px; border-radius: 7px;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; font-size: 13px; color: var(--ink-soft); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item svg { width: 16px; height: 16px; }
  html ${SHELL} .workbench-bar .plugin-picker-popover :is(.plugin-rail-group, .plugin-rail-subgroup) {
    width: auto; height: auto; margin: 8px 0 2px; padding: 0 10px; background: none; overflow: visible; color: var(--faint); font-size: 11px; line-height: 18px;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items[data-seg-thumb]::before { display: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] > span { color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item:not([aria-current]):hover { background: var(--nav-hover); }
  /* Its answers open above the bar and stay until closed. */
  ${SHELL} .assistant-panel {
    position: absolute; z-index: 50; left: -40px; right: -40px; bottom: calc(100% + 8px); display: flex; flex-direction: column; overflow: hidden;
    height: min(600px, calc(100dvh - var(--desktop-titlebar-height) - var(--dock-h) - 32px));
    border-radius: 12px; background: var(--paper); box-shadow: var(--lift-3); transform-origin: bottom center; animation: craft-dock-rise 220ms var(--ease-quint) both;
  }
  ${SHELL} .assistant-panel[hidden] { display: none; }
  /* Head: which work, its real state, where it belongs, and what can be done to it now. */
  ${SHELL} .assistant-head { flex: none; display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 6px 0 6px; box-shadow: inset 0 -1px 0 var(--line); }
  ${SHELL} .assistant-work-switch {
    display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 55%; height: 28px; padding: 0 8px; border: 0; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
  }
  ${SHELL} .assistant-work-switch:is(:hover, [aria-expanded="true"]) { background: var(--nav-hover); }
  ${SHELL} .assistant-work-switch:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .assistant-work-switch > svg { flex: none; width: 12px; height: 12px; color: var(--muted); }
  ${SHELL} .assistant-work-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${SHELL} .assistant-state { flex: none; font-size: 11px; font-weight: 400; color: var(--muted); }
  ${SHELL} .assistant-state:empty { display: none; }
  ${SHELL} .assistant-state[data-state="running"]::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: var(--hue-green-fill); vertical-align: 1px; }
  ${SHELL} .assistant-state:is([data-state="waiting-input"], [data-state="waiting-review"], [data-state="needs-check"]) { color: var(--ink); }
  ${SHELL} .assistant-state[data-state="failed"] { color: var(--danger); }
  ${SHELL} .assistant-work-scope { flex: none; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); color: var(--muted); font-size: 11px; }
  ${SHELL} .assistant-head-actions { margin-left: auto; display: flex; align-items: center; gap: 2px; }
  ${SHELL} .assistant-head-actions .dock-window-action[hidden] { display: none; }
  /* The person's works, newest first. */
  ${SHELL} .assistant-works { flex: none; display: flex; flex-direction: column; gap: 1px; max-height: 45%; overflow: auto; padding: 6px; box-shadow: inset 0 -1px 0 var(--line); }
  ${SHELL} .assistant-works[hidden] { display: none; }
  ${SHELL} .assistant-works-item {
    display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; padding: 6px 10px; border: 0; border-radius: 7px;
    background: transparent; color: var(--ink-soft); font: inherit; text-align: left; cursor: pointer;
  }
  ${SHELL} .assistant-works-item:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .assistant-works-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .assistant-works-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .assistant-works-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  ${SHELL} .assistant-works-meta { font-size: 11px; color: var(--muted); }
  ${SHELL} .assistant-works-new { flex-direction: row; font-size: 13px; color: var(--muted); }
  /* The conversation: the person's words on the right, the assistant's answer as text, what it did as quiet lines. */
  ${SHELL} .assistant-thread { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 16px; font-size: 13px; line-height: 1.6; overscroll-behavior: contain; }
  ${SHELL} .assistant-empty { color: var(--muted); }
  ${SHELL} .assistant-empty strong { display: block; margin-bottom: 4px; color: var(--ink); font-weight: 500; }
  ${SHELL} .assistant-empty p { margin: 0; }
  ${SHELL} .assistant-empty[hidden] { display: none; }
  ${SHELL} .assistant-round { display: flex; flex-direction: column; gap: 8px; }
  ${SHELL} .assistant-msg { max-width: 100%; overflow-wrap: anywhere; }
  ${SHELL} .assistant-msg--user { align-self: flex-end; max-width: 85%; padding: 7px 12px; border-radius: 12px; background: var(--nav-active); color: var(--ink); white-space: pre-wrap; }
  ${SHELL} .assistant-msg--assistant { color: var(--ink); }
  ${SHELL} .assistant-msg--note { font-size: 12px; color: var(--muted); }
  ${SHELL} .assistant-rich > :last-child { margin-bottom: 0; }
  ${SHELL} .assistant-rich p { margin: 0 0 8px; }
  ${SHELL} .assistant-rich :is(ul, ol) { margin: 0 0 8px; padding-left: 20px; }
  ${SHELL} .assistant-rich .assistant-rich-heading { font-weight: 600; }
  ${SHELL} .assistant-rich pre { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: var(--wash); overflow: auto; font-size: 12px; }
  ${SHELL} .assistant-rich code { padding: 0 3px; border-radius: 4px; background: var(--wash); font-size: 12px; }
  ${SHELL} .assistant-rich pre code { padding: 0; background: none; }
  ${SHELL} :is(.assistant-activity, .assistant-round-status, .assistant-materials, .assistant-muted) { margin: 0; font-size: 12px; color: var(--muted); }
  ${SHELL} .assistant-activity[data-state="failed"] { color: var(--danger); }
  ${SHELL} .assistant-round-status[hidden] { display: none; }
  ${SHELL} .assistant-round-status[data-phase="failed"] { color: var(--danger); }
  /* What needs the person: a question to answer, or an exact effect to allow. */
  ${SHELL} .assistant-card { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px; box-shadow: 0 0 0 1px var(--line-strong); }
  ${SHELL} .assistant-card-title { margin: 0; font-weight: 500; color: var(--ink); }
  ${SHELL} .assistant-card p { margin: 0; }
  ${SHELL} .assistant-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  ${SHELL} .assistant-answer { display: flex; gap: 6px; }
  ${SHELL} .assistant-answer .mw-input { flex: 1; min-width: 0; }
  ${SHELL} .assistant-questionnaire { display: flex; flex-direction: column; gap: 8px; }
  ${SHELL} .assistant-questionnaire fieldset { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; border: 0; }
  ${SHELL} .assistant-questionnaire legend { padding: 0; margin-bottom: 2px; font-weight: 500; }
  ${SHELL} .assistant-fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 12px; }
  ${SHELL} .assistant-fields dt { color: var(--muted); }
  ${SHELL} .assistant-fields dd { margin: 0; max-height: 200px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  ${SHELL} .assistant-problem { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--wash); }
  ${SHELL} .assistant-problem p { margin: 0; }
  /* In front of the input: where the next Send goes — a new work (and whose), or the work it continues. */
  ${SHELL} .assistant-target {
    display: inline-flex; flex: 0 1 auto; align-items: center; gap: 4px; min-width: 0; max-width: 32%; height: 28px; padding: 0 8px; border: 0; border-radius: 7px;
    background: transparent; box-shadow: 0 0 0 1px var(--line); color: var(--muted); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer;
  }
  ${SHELL} .assistant-target > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  ${SHELL} .assistant-target:hover { color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong); }
  ${SHELL} .assistant-target[data-mode="work"] { background: var(--nav-hover); box-shadow: none; color: var(--ink); }
  ${SHELL} .assistant-target:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${SHELL} .assistant-target-clear { display: inline-grid; place-items: center; flex: none; width: 16px; height: 16px; border-radius: 4px; color: var(--muted); }
  ${SHELL} .assistant-target-clear[hidden] { display: none; }
  ${SHELL} .assistant-target-clear:hover { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .assistant-target-clear svg { width: 11px; height: 11px; }
  /* ⌘K search opens from the same place: one entry for finding and for asking. */
  @media (min-width: 601px) {
    ${SHELL} dialog.global-search-dialog[open] { position: fixed; inset: auto 0 calc(var(--dock-h) + 8px) 0; margin: 0 auto; width: min(640px, calc(100vw - 32px)); max-height: min(70dvh, 560px); }
  }
  @keyframes craft-dock-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  /* Everything that opens from the bar rises from it, anchored at the edge nearest its control. */
  @keyframes craft-rise-from-bar { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
  html ${SHELL} .workbench-bar :is(.account-global-popover, .plugin-picker-popover:not([hidden])) { transform-origin: bottom left; animation: craft-rise-from-bar 180ms var(--ease-quint) both; }
  html ${SHELL} .workbench-bar details[open] > .navigator-project-menu-popover { transform-origin: bottom right; animation: craft-rise-from-bar 180ms var(--ease-quint) both; }
  /* Controls in the bar give under a press like every other button. */
  ${SHELL} .workbench-bar :is(.dock-pin, .bar-resident, .bar-chat, .plugin-picker-trigger, .account-global-trigger, .navigator-project-selector) { transition: transform var(--dur-move) var(--ease-spring), background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift); }
  ${SHELL} .workbench-bar :is(.dock-pin, .bar-resident, .bar-chat, .plugin-picker-trigger, .account-global-trigger, .navigator-project-selector):active { transform: scale(.94); transition-duration: var(--dur-press); }

  /* The project: a round button; its menu switches project, opens settings and group chat. */
  html ${SHELL} .workbench-bar .bar-end .workspace-chrome { position: static; display: flex; width: auto; height: auto; min-height: 0; margin: 0; padding: 0; border: 0; background: transparent; box-shadow: none; grid-area: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-primary { display: flex; flex-direction: row; align-items: center; width: auto; height: auto; min-height: 0; margin: 0; padding: 0; gap: 0; background: transparent; box-shadow: none; }
  html ${SHELL} .workbench-bar .bar-end :is(.navigator-project-search, .desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none !important; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu { position: relative; width: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector {
    display: grid; grid-template-columns: 40px; place-items: center; justify-content: center; gap: 0; width: 40px; height: 40px; min-height: 40px;
    padding: 0; border-radius: 50%; background: transparent; overflow: visible; list-style: none; cursor: pointer;
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector::-webkit-details-marker { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector > :is(strong, svg:last-child) { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector .project-monogram { width: 40px; height: 40px; border-radius: 50%; font-size: 16px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent); transition: box-shadow var(--dur-hover) var(--ease-swift); }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector:hover .project-monogram,
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu[open] > .navigator-project-selector .project-monogram { box-shadow: 0 0 0 2px var(--desk), 0 0 0 3px var(--line-strong); }
  /* Between phone and desktop the three columns shrink together: residents drop their names, the Dock folds sooner. */
  @media (max-width: 760px) {
    ${SHELL} .workbench-bar { grid-template-columns: minmax(136px, 1fr) minmax(200px, 520px) minmax(max-content, 1fr); }
  }
  /* A phone keeps a plugin's own list in a drawer. Its button stands just left of the project, and only when that
     plugin has a list — navigation itself is the switcher's. The bar stays above the drawer and its scrim. */
  @media (max-width: 600px) {
    ${SHELL} { --plugin-rail-width: 0px; --workspace-chrome-height: 0px; --assistant-island-row: 0px; }
    ${SHELL} .workbench-bar { z-index: 45; }
    html ${SHELL} .immersive-workspace > .tree-pane,
    html ${SHELL} .immersive-sidebar-scrim:not([hidden]) { bottom: 54px; }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-primary { gap: 8px; }
    html ${SHELL} .immersive-workspace:not(.is-plugin-directory-empty) .workbench-bar .bar-end .immersive-show-directory,
    html ${SHELL} .is-directory-drawer-open .workbench-bar .bar-end .navigator-directory-toggle {
      display: inline-grid !important; place-items: center; order: -1; width: 40px; min-width: 40px; height: 40px; min-height: 40px; padding: 0; border: 0; border-radius: 12px;
      background: var(--paper); box-shadow: 0 0 0 1px var(--line); color: var(--muted);
    }
    html ${SHELL} .is-directory-drawer-open .workbench-bar .bar-end .immersive-show-directory { display: none !important; }
    html ${SHELL} .workbench-bar .bar-end :is(.immersive-show-directory, .navigator-directory-toggle) svg { width: 16px; height: 16px; }
    html ${SHELL} .workbench-bar .bar-end :is(.immersive-show-directory, .navigator-directory-toggle):hover { box-shadow: 0 0 0 1px var(--line-strong); color: var(--ink); }
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover {
    position: absolute; top: auto; left: auto; right: 0; bottom: calc(100% + 8px); width: 272px; min-width: 0; max-height: min(78dvh, 640px); overflow: auto;
  }
  /* The switch list keeps one layout at every width; the older sidebar rules only styled it on a desktop. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { display: block; padding: 6px 10px 2px; color: var(--faint); font-size: 11px; line-height: 18px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover nav { display: grid; gap: 1px; }
  html ${SHELL} .workbench-bar .navigator-project-option {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; padding: 0 10px; border-radius: 8px;
    color: var(--ink); font-size: 13px; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-option > span { display: flex; align-items: center; gap: 8px; min-width: 0; }
  html ${SHELL} .workbench-bar .navigator-project-option strong { overflow: hidden; font-size: 13px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  html ${SHELL} .workbench-bar .navigator-project-option > svg { flex: none; width: 14px; height: 14px; color: var(--ink-soft); }
  html ${SHELL} .workbench-bar .navigator-project-option:hover { background: var(--nav-hover); }
  html ${SHELL} .workbench-bar .navigator-project-option.is-current { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .navigator-project-option:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  /* One row system for the project menu: every row 32px, a 20px leading slot, one text column, and one kind of
     divider with even space on both sides. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover { padding: 6px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { padding: 4px 10px 4px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item, .navigator-personal > .personal-account) {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 10px; width: 100%; height: 32px; min-height: 32px;
    margin: 0; padding: 0 10px; border: 0; border-radius: 8px; box-shadow: none; background: transparent;
    color: var(--ink-soft); font: inherit; font-size: 13px; font-weight: 400; line-height: 1; text-align: left; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item) > svg:first-child {
    flex: none; width: 16px; height: 16px; margin: 0 2px; color: var(--muted);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item) > span:not(.personal-account-avatar):not(.personal-account-copy) {
    position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; white-space: nowrap;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item):hover { background: var(--nav-hover); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item):hover > svg:first-child { color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option.is-current, .navigator-project-settings[aria-current], .navigator-personal > .account-global-item[aria-current]) { background: var(--nav-active); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > span { gap: 10px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option .project-monogram { flex: none; width: 20px; height: 20px; border-radius: 6px; font-size: 11px; box-shadow: none; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > svg { margin-left: auto; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar {
    display: grid; place-items: center; flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar svg { width: 12px; height: 12px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy { display: flex; align-items: baseline; gap: 6px; min-width: 0; line-height: 1; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy strong { font-size: 13px; font-weight: 400; color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy small { font-size: 12px; color: var(--faint); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal { display: grid; gap: 0; margin: 0; padding: 0; box-shadow: none; }
  /* Groups: switch projects · this project · you. The divider is drawn in the gap, so it never touches a row. */
  /* Who you are is shown, not clicked: no hover, no pointer. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account { cursor: default; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account:hover { background: transparent; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal { position: relative; margin-top: 11px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal::before {
    content: ""; position: absolute; left: 4px; right: 4px; top: -6px; height: 1px; background: var(--line); pointer-events: none;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im {
    display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im svg { width: 15px; height: 15px; color: var(--muted); }
  /* Group chat grows from the project button. */
  ${SHELL} .dock-window {
    position: absolute; z-index: 50; right: 0; bottom: calc(100% + 8px); width: min(400px, calc(100vw - 16px)); display: flex; flex-direction: column; overflow: hidden;
    height: min(560px, calc(100dvh - var(--desktop-titlebar-height) - var(--dock-h) - 32px));
    border-radius: 12px; background: var(--paper); box-shadow: var(--lift-3); animation: craft-dock-rise 220ms var(--ease-quint) both;
  }
  ${SHELL} .dock-window[hidden] { display: none; }
  ${SHELL} .dock-window-head { flex: none; display: flex; align-items: center; gap: 4px; height: 38px; padding: 0 6px 0 14px; box-shadow: inset 0 -1px 0 var(--line); }
  ${SHELL} .dock-window-head strong { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--ink); }
  ${SHELL} .dock-window-action {
    display: inline-flex; align-items: center; gap: 6px; width: auto; height: 26px; padding: 0 8px; border: 0; border-radius: 7px;
    background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${SHELL} .dock-window-action:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-window-action svg { width: 14px; height: 14px; }
  ${SHELL} .dock-window-body { flex: 1; min-height: 0; overflow: hidden; }
  ${SHELL} .dock-window-body iframe { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }

  /* A phone keeps the bar at the foot of the page: menu, the Assistant with its switcher, the project. */
  @media (max-width: 600px) {
    ${SHELL} .immersive-workspace,
    ${SHELL} .immersive-workspace.is-directory-collapsed,
    ${SHELL} .immersive-workspace.is-plugin-directory-empty { grid-template-rows: auto 0 0 minmax(0, 1fr) auto; }
    ${SHELL} .workbench-bar { grid-row: 5; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; padding: 6px 8px 8px; box-shadow: inset 0 1px 0 var(--line); }
    ${SHELL} .dock-pins, ${SHELL} .bar-residents { display: none; }
    ${SHELL} .plugin-picker-trigger { max-width: 120px; }
    html ${SHELL} .workbench-bar .plugin-picker-popover { position: fixed; left: 8px; right: 8px; bottom: 64px; width: auto; }
    ${SHELL} .assistant-panel, ${SHELL} .dock-window { position: fixed; left: 8px; right: 8px; bottom: 64px; width: auto; height: min(70dvh, 560px); }
    ${SHELL} .assistant-target { max-width: 28%; }
    ${SHELL} .account-global-popover { position: fixed; left: 8px; bottom: 64px; width: min(300px, calc(100vw - 16px)); }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover { position: fixed; right: 8px; left: auto; bottom: 64px; }
  }

  /* The project is its own mark: a letter on a stable hue, not a generic database glyph. */
  .project-monogram {
    --mono: var(--hue-indigo-fill, #5e6ad2);
    display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 6px;
    background: var(--mono); color: #fff; font-size: 12px; font-weight: 500; line-height: 1; letter-spacing: 0;
  }
  ${["indigo", "blue", "cyan", "mint", "green", "orange", "pink", "purple", "brown", "slate"].map((hue) => `.project-monogram[data-hue="${hue}"] { --mono: var(--hue-${hue}-fill); }`).join("\n  ")}
  ${SHELL} .workspace-chrome .navigator-project-selector { place-items: center; justify-content: center; }
  ${SHELL} .workspace-chrome .navigator-project-selector > svg:first-child:not(:only-child) { display: none; }
  ${SHELL} .workspace-chrome .navigator-project-selector:hover { background: var(--nav-hover); }
  ${SHELL} .workspace-chrome .navigator-project-menu[open] .navigator-project-selector { background: var(--nav-active); }
  .navigator-project-option .project-monogram { width: 18px; height: 18px; border-radius: 5px; font-size: 10px; }

  /* Rail tooltip, drawn once in the page so scrolling columns cannot clip it. */
  .craft-tip {
    position: fixed; z-index: 2147483000; left: 0; top: 0; pointer-events: none;
    padding: 5px 9px; border-radius: 7px; background: var(--tip-bg); color: var(--tip-ink);
    font-size: 12px; line-height: 16px; white-space: nowrap; letter-spacing: .01em;
    box-shadow: 0 6px 18px -6px rgba(0, 0, 0, .35);
    opacity: 0; transform: translate(var(--tip-x, 0), var(--tip-y, 0)) translateX(-4px) scale(.96); transform-origin: left center;
    transition: opacity 120ms var(--ease-swift), transform 180ms var(--ease-quint);
  }
  .craft-tip[data-shown] { opacity: 1; transform: translate(var(--tip-x, 0), var(--tip-y, 0)); }
  .craft-tip kbd { margin-left: 8px; padding: 0 4px; border-radius: 4px; background: color-mix(in srgb, var(--tip-ink) 16%, transparent); color: inherit; font: inherit; font-size: 11px; opacity: .8; }

  /* ─── Directory: rows on the desk; the selected one takes the neutral selection fill ── */
  ${SHELL} .tree-pane :is(.mw-dir-row, .directory-list-row, .tree-node, .source-list-item) {
    border-radius: var(--r-row);
    transition: background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-swift);
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
  ${SHELL} .tree-resizer::after { transition: opacity var(--dur-hover) var(--ease-swift), background-color var(--dur-hover) var(--ease-swift); }
  ${SHELL} .tree-resizer:is(:hover, :focus-visible, .is-dragging, [data-dragging])::after { background: var(--focus); opacity: .7; }

  /* ─── Controls ─────────────────────────────────────────────────────────── */
  ${PAGES} .mw-btn {
    transition:
      background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift),
      border-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint),
      transform var(--dur-move) var(--ease-spring), opacity var(--dur-hover) var(--ease-swift);
    will-change: auto;
  }
  ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .home-shortcut-main, .project-card, .plugin-market-project-trigger):active:not(:disabled, [aria-disabled="true"], [aria-expanded="true"], [aria-haspopup]) {
    transform: scale(.97); filter: none; transition-duration: var(--dur-press);
  }
  /* Buttons are solid: one fill, one hairline, no sheen. */
  ${PAGES} .mw-btn--primary { background-image: none; box-shadow: none; }
  ${PAGES} .mw-btn--primary:hover:not(:disabled) { background-color: color-mix(in srgb, var(--action) 86%, var(--paper)); box-shadow: none; }
  html[data-resolved-theme="dark"] ${PAGES} .mw-btn--primary:hover:not(:disabled) { background-color: color-mix(in srgb, var(--action) 88%, var(--desk)); }
  ${PAGES} .mw-btn--secondary:not(:disabled) { box-shadow: none; border-color: var(--line); }
  ${PAGES} .mw-btn--secondary:hover:not(:disabled) { box-shadow: none; border-color: var(--line-strong); background-color: var(--nav-hover); }
  ${WORKBENCH} .plugin-stage-chrome .tree-create,
  ${WORKBENCH} .goal-stage-chrome .tree-create {
    border-color: var(--line); background: var(--paper); box-shadow: none;
  }
  ${WORKBENCH} :is(.plugin-stage-chrome, .goal-stage-chrome) .tree-create:hover { border-color: var(--line-strong); background: var(--nav-hover); box-shadow: none; }
  ${PAGES} .mw-btn:disabled, ${PAGES} .mw-btn[aria-disabled="true"] { box-shadow: none; background-image: none; }

  /* Segmented controls: the thumb settles on a spring; slots brighten on hover. */
  ${PAGES} .mw-toggle-group { border-radius: 10px; }
  ${PAGES} .mw-toggle-group[data-seg-thumb]::before { border-radius: 7px; box-shadow: 0 0 0 1px var(--line); }
  ${PAGES} .mw-toggle-group > .mw-toggle:not(.is-current, [aria-pressed="true"], [aria-current]):hover { color: var(--ink); }
  ${PAGES} .mw-toggle svg { transition: transform var(--dur-move) var(--ease-spring); }

  /* Fields: a hairline that darkens, and a soft accent halo while you write. */
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select, .mw-input-group, .project-index-search) {
    transition: border-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-swift);
  }
  ${PAGES} :is(.mw-input, .mw-textarea):not([data-plain-field]):focus-visible,
  ${PAGES} :is(.mw-input-group, .project-index-search):focus-within {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink) 7%, transparent);
  }
  ${PAGES} [data-plain-field]:focus-visible { box-shadow: inset 0 -2px 0 var(--focus); }

  /* Check and switch: the tick draws itself; the knob lands on a spring. */
  ${PAGES} .mw-check, ${PAGES} .mw-radio { transition: background-color var(--dur-hover) var(--ease-swift), border-color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring); }
  ${PAGES} .mw-check:active:not(:disabled), ${PAGES} .mw-radio:active:not(:disabled) { transform: scale(.86); }
  ${PAGES} .mw-check:checked::after { animation: craft-tick 240ms var(--ease-quint) both; transform-origin: 30% 70%; }
  ${PAGES} .mw-radio:checked::after { animation: craft-pop 260ms var(--ease-spring) both; }
  @keyframes craft-tick { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes craft-pop { from { transform: scale(.2); opacity: 0; } to { transform: none; opacity: 1; } }
  ${PAGES} .mw-switch__track::after { transition: transform 280ms var(--ease-spring), width 160ms var(--ease-swift), background-color var(--dur-hover) var(--ease-swift); }
  ${PAGES} .mw-switch input:active:not(:disabled) + .mw-switch__track::after { width: 17px; }
  ${PAGES} .mw-switch input:checked:active:not(:disabled) + .mw-switch__track::after { transform: translateX(11px); }

  /* Disclosure chevrons turn on the same curve everywhere. */
  ${PAGES} :is(.mw-disclosure, details > summary) > svg:is(:first-child, :last-child) { transition: transform var(--dur-move) var(--ease-quint); }

  /* ─── Overlays ─────────────────────────────────────────────────────────── */
  ${PAGES} ${CENTRED_DIALOG}[open] { animation: craft-dialog-in 280ms var(--ease-quint); }
  ${PAGES} ${CENTRED_DIALOG}[open]::backdrop { animation: craft-fade-in 240ms var(--ease-swift); }
  /* Creating a Goal is writing: two borderless lines; focus draws a pen line under the one you are on. */
  :root ${WORKBENCH} dialog[data-create-dialog] .create-compose :is(.create-compose-title, .create-compose-outcome) {
    border: 0; border-radius: 6px 6px 0 0; box-shadow: none; background: transparent;
    transition: background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint);
  }
  :root ${WORKBENCH} dialog[data-create-dialog] .create-compose :is(.create-compose-title, .create-compose-outcome):is(:focus, :focus-visible) {
    background: color-mix(in srgb, var(--ink) 3%, transparent); box-shadow: inset 0 -2px 0 var(--focus); outline: none;
  }
  ${PAGES} dialog.mw-dialog:not(.mw-sheet) { border-radius: var(--r-dialog); box-shadow: var(--lift-3); }
  ${PAGES} dialog.mw-sheet[open] { animation: craft-sheet-in 300ms var(--ease-quint); }
  ${PAGES} dialog.mw-sheet[open]::backdrop { animation: craft-fade-in 240ms var(--ease-swift); }
  @keyframes craft-dialog-in { from { opacity: 0; transform: translateY(10px) scale(.975); } to { opacity: 1; transform: none; } }
  @keyframes craft-sheet-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
  @keyframes craft-fade-in { from { opacity: 0; } to { opacity: 1; } }
  ${PAGES} ${DROPDOWN} { transform-origin: top left; }
  ${PAGES} ${DROPDOWN}:is(:popover-open, [open], .is-open, :not([hidden])) { animation: craft-drop 170ms var(--ease-quint); }
  ${PAGES} details[open] > .navigator-project-menu-popover { animation: craft-drop 170ms var(--ease-quint); transform-origin: top left; }
  ${PAGES} :is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tab-menu) { border-radius: var(--r-card); box-shadow: var(--lift-3); }
  @keyframes craft-drop { from { opacity: 0; transform: translateY(-4px) scale(.97); } to { opacity: 1; transform: none; } }
  ${PAGES} :is(.mw-menu, .tab-menu) :is([role="menuitem"], [role="option"], button) { transition: background-color 90ms var(--ease-swift), color 90ms var(--ease-swift); }

  /* Toasts: a small capsule that rises on a spring and says, with a mark, how it went. */
  ${PAGES} .toast {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px 8px 11px; border-radius: 999px; font-size: 13px; line-height: 18px;
    background: var(--tip-bg); color: var(--tip-ink);
    box-shadow: 0 10px 30px -8px rgba(0, 0, 0, .35), 0 0 0 1px rgba(255, 255, 255, .06) inset;
    transform: translate(-50%, 16px) scale(.96);
    transition: opacity 180ms var(--ease-swift), transform 380ms var(--ease-spring);
  }
  ${PAGES} .toast::before {
    content: ""; flex: none; width: 16px; height: 16px; border-radius: 50%;
    background: var(--hue-green-fill, #4cb782) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.3l2.2 2.2 4.8-5' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 16px no-repeat;
  }
  ${PAGES} .toast.is-error { background: var(--tip-bg); color: var(--tip-ink); }
  ${PAGES} .toast.is-error::before {
    background: var(--hue-red-fill, #eb5757) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 4.4v4.4M8 11.3v.2' fill='none' stroke='white' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E") center / 16px no-repeat;
  }
  ${PAGES} .toast:empty::before { display: none; }
  ${PAGES} .toast.is-visible { transform: translate(-50%, 0) scale(1); }
  ${PAGES} .toast.is-visible.is-error { animation: craft-nudge 360ms var(--ease-swift) 120ms; }
  @keyframes craft-nudge { 0%, 100% { translate: 0; } 25% { translate: -4px; } 50% { translate: 3px; } 75% { translate: -2px; } }
  body.settings-page .toast { transform: translateY(16px) scale(.96); }
  body.settings-page .toast.is-visible { transform: none; }

  /* ─── Lists and rows ───────────────────────────────────────────────────── */
  ${WORKBENCH} :is(.tree-entry, .feed-stage-entry, .plugin-stage-list .mw-dir-row, .home-erow, .inbox-stage-row, .session-stage-row) {
    transition: background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint);
  }
  ${WORKBENCH} .plugin-stage-list :is(.mw-dir-row, .tree-node):active:not(:disabled) { background: var(--nav-press); }
  /* A selected Goal row is one wash on its entry, not a second fill on the button inside it. */
  ${WORKBENCH} :is(.goal-canvas-shell, .plugin-stage-list) .tree-entry.is-selected :is(.tree-node, .tree-row) { background: transparent; }
  /* Something that just landed says so once: a wash that fades from its left edge. */
  ${PAGES} [data-craft-new] { position: relative; }
  ${PAGES} [data-craft-new]::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: color-mix(in srgb, var(--focus) 12%, transparent);
    animation: craft-landed 1600ms var(--ease-swift) forwards;
  }
  @keyframes craft-landed { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }

  /* Progress bars fill instead of appearing full. */
  ${WORKBENCH} :is(.goal-progress-bar, .tree-progress, .mw-progress) > :is(i, span, .mw-progress__bar) { transition: width 520ms var(--ease-quint), transform 520ms var(--ease-quint); }

  /* ─── Goal canvas ──────────────────────────────────────────────────────── */
  /* The canvas is plain paper: nodes and their links are the only marks on it. */
  ${WORKBENCH} :is(.goal-canvas-viewport, .goal-frame-canvas) { background-color: var(--paper); background-image: none; }
  ${WORKBENCH} .momentum-map.graph-stage { background: var(--paper); }
  ${WORKBENCH} .goal-canvas-viewport.is-panning { cursor: grabbing; }
  ${WORKBENCH} [data-graph-node] {
    border-radius: var(--r-card); box-shadow: none; border-color: var(--line);
    transition: border-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), opacity var(--dur-move) var(--ease-swift);
  }
  ${WORKBENCH} [data-graph-node]:hover { border-color: var(--line-strong); }
  /* Selection is neutral like everywhere else: a darker ink ring, not an accent stroke. */
  ${WORKBENCH} [data-graph-node].is-selected:not(.is-expanded-node) { border-color: var(--ink-soft); box-shadow: 0 0 0 1px var(--ink-soft); }
  ${WORKBENCH} [data-graph-node].is-dragging { box-shadow: var(--lift-3); cursor: grabbing; z-index: 5; }
  ${WORKBENCH} [data-graph-edge] path { transition: stroke var(--dur-move) var(--ease-swift), stroke-width var(--dur-move) var(--ease-swift), opacity var(--dur-move) var(--ease-swift); }
  ${WORKBENCH} [data-graph-edge].is-selected-path path { stroke-dasharray: 6 5; animation: craft-flow 900ms linear infinite; }
  @keyframes craft-flow { to { stroke-dashoffset: -11; } }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) > div { border-radius: 10px; background: var(--paper); box-shadow: 0 0 0 1px var(--line); }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring); }
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
     returns when the form closes. */
  @media (max-height: 560px) and (min-width: 601px) {
    ${SHELL} .immersive-workspace:has(.is-editing-goal) { --dock-h: 0px; }
    ${SHELL} .immersive-workspace:has(.is-editing-goal) > .workbench-bar { display: none; }
  }

  /* 能力 in the workbench: its page fills the cover, edge to edge on the sheet. */
  ${WORKBENCH} [data-work-surface="capabilities"]:not([hidden]) { display: block; height: 100%; min-height: 0; padding: 0; }
  ${WORKBENCH} .capabilities-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }

  /* ─── Board ────────────────────────────────────────────────────────────── */
  ${WORKBENCH} [data-kanban-card] {
    border-radius: 10px; box-shadow: none; border-color: var(--line);
    transition: border-color var(--dur-hover) var(--ease-swift), background-color var(--dur-hover) var(--ease-swift);
  }
  ${WORKBENCH} [data-kanban-card]:hover { border-color: var(--line-strong); }
  ${WORKBENCH} [data-kanban-card]:is(.is-selected, [aria-current="true"], [aria-selected="true"]) { border-color: var(--ink-soft); box-shadow: 0 0 0 1px var(--ink-soft); }

  /* ─── Goal work area ───────────────────────────────────────────────────── */
  ${WORKBENCH} .goal-node-toolbar .goal-node-back { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .goal-details-aside { background: var(--paper); box-shadow: inset 1px 0 0 var(--line); }
  ${WORKBENCH} .goal-details-toggle svg { transition: transform var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .tui-empty, ${WORKBENCH} .goal-tui-empty { border-radius: var(--r-card); }

  /* ─── Arrival ──────────────────────────────────────────────────────────── */
  /* A surface rises a few pixels as it appears. Surfaces restart this whenever they are shown. */
  ${WORKBENCH} .tab-pane-body > [data-work-surface]:not([hidden]),
  ${WORKBENCH} .tab-workspace-exclusive > :not([hidden]) {
    animation: craft-rise var(--dur-arrive) var(--ease-quint) both;
  }
  ${WORKBENCH}.is-craft-resting .tab-pane-body > [data-work-surface],
  ${WORKBENCH}[data-pane-embedded] .tab-pane-body > [data-work-surface] { animation: none; }
  @keyframes craft-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  /* Opening a project: the rail settles in from the edge, then the sheet. Once per page. */
  ${SHELL}.is-craft-opening .plugin-stack :is(.immersive-plugin-link, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .personal-account) {
    animation: craft-rail-in 420ms var(--ease-quint) both; animation-delay: calc(var(--craft-i, 0) * 18ms + 60ms);
  }
  ${SHELL}.is-craft-opening .immersive-plugin-stage { animation: craft-sheet-open 560ms var(--ease-quint) both 80ms; }
  ${SHELL}.is-craft-opening .immersive-titlebar .tab-strip--chrome { animation: craft-fade-in 400ms var(--ease-swift) both 180ms; }
  @keyframes craft-rail-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
  @keyframes craft-sheet-open { from { opacity: 0; transform: translateY(12px) scale(.992); } to { opacity: 1; transform: none; } }

  /* ─── Home ─────────────────────────────────────────────────────────────── */
  /* One paper surface. The timeline is neutral; colour is kept for what needs you. */
  ${WORKBENCH} .immersive-home .home-hero { position: relative; max-width: 46rem; padding: 28px 28px 20px; }
  ${WORKBENCH} .immersive-home .craft-greeting { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--muted); font-size: 12px; }
  ${WORKBENCH} .immersive-home .home-hero__date time { font-size: 34px; letter-spacing: -.04em; }
  ${WORKBENCH} .immersive-home .home-hero__today { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
  ${WORKBENCH} .immersive-home .home-hero__stats b { color: var(--ink); }
  ${WORKBENCH} .immersive-home :is(.home-hero__stats i, .home-day__dots i) { background: var(--line-strong) !important; }
  ${WORKBENCH} .immersive-home .home-tl { border-top-color: var(--line); padding: 0 16px 16px; }
  ${WORKBENCH} .immersive-home :is(.home-tl__head, .home-tl__rows) { max-width: calc(46rem - 32px); }
  ${WORKBENCH} .immersive-home .home-tl__now u { background: color-mix(in srgb, var(--accent, var(--blue)) 35%, var(--paper)); }
  ${WORKBENCH} .immersive-home :is(.home-erow, .home-detail) { --node: var(--muted) !important; }
  ${WORKBENCH} .immersive-home .home-erow:active { background: var(--nav-press); }
  ${WORKBENCH} .immersive-home .home-erow.is-on { background: var(--nav-active); }
  ${WORKBENCH} .immersive-home .home-erow.is-on .home-erow__when { color: var(--ink-soft); }
  ${WORKBENCH} .immersive-home .home-erow.is-on .home-erow__dot { box-shadow: inset 0 0 0 5px var(--ink); }
  ${WORKBENCH} .immersive-home :is(.home-erow__src, .home-detail__src) { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
  ${WORKBENCH} .immersive-home :is(.home-erow__src, .home-detail__src) svg { color: var(--muted); }
  /* The cascade marks arrival — the list's first load or another day — never a background refresh or a click. */
  ${WORKBENCH} .immersive-home .home-tl__rows[data-arrive] > * { animation: craft-rise 320ms var(--ease-quint) both; }
  ${[...Array(12).keys()].map((index) => `${WORKBENCH} .immersive-home .home-tl__rows[data-arrive] > :nth-child(${index + 1}) { animation-delay: ${30 + index * 20}ms; }`).join("\n  ")}
  /* The detail column is an inspector along the sheet's right edge, not a card floating in it. */
  ${WORKBENCH} .immersive-home[data-event="on"] .home-eventcol { animation: craft-sheet-in 240ms var(--ease-quint); }
  ${WORKBENCH} .immersive-home .home-detail { border-radius: 0; box-shadow: none; background: transparent; }
  ${WORKBENCH} .immersive-home .home-detail__head { padding: 12px 10px 8px 18px; }
  ${WORKBENCH} .immersive-home .home-detail__act { padding: 10px 12px; background: var(--paper); box-shadow: inset 0 1px 0 var(--line); }
  ${WORKBENCH} .immersive-home .home-day { transition: background-color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .immersive-home .home-day.is-on { background: var(--nav-active); box-shadow: none; }
  ${WORKBENCH} .immersive-home .home-day__n s { background: var(--ink-soft); }
  ${WORKBENCH} .immersive-home .home-shortcut-icon { box-shadow: none; }
  ${WORKBENCH} .immersive-home .home-shortcut-add .home-shortcut-icon { transition: border-color var(--dur-hover) var(--ease-swift), background-color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .immersive-home .home-shortcut:hover .home-shortcut-icon { background: var(--nav-hover); }

  /* ─── Feed reader: one compact heading row; a lone tab is not a choice ───── */
  ${WORKBENCH} .feed-source-header { padding: 14px 24px 0; }
  ${WORKBENCH} .feed-source-heading { min-height: 32px; }
  ${WORKBENCH} .feed-source-heading > div { display: flex; align-items: baseline; gap: 10px; }
  ${WORKBENCH} .feed-source-heading h2 { font-size: 17px; letter-spacing: -.015em; flex: none; max-width: 60%; }
  ${WORKBENCH} .feed-source-heading p { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${WORKBENCH} .feed-source-tabs { margin-top: 8px; }
  ${WORKBENCH} .feed-source-header:not(:has(.feed-source-tabs button:not([hidden]) ~ button:not([hidden]))) { padding-bottom: 12px; }
  ${WORKBENCH} .feed-source-tabs:not(:has(button:not([hidden]) ~ button:not([hidden]))) { display: none; }
  ${WORKBENCH} .feed-source-tabs button { transition: color var(--dur-hover) var(--ease-swift), border-color var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .feed-source-tabs button:hover:not([aria-current]) { color: var(--ink-soft); border-bottom-color: var(--line-strong); }

  /* ─── Plugin market ────────────────────────────────────────────────────── */
  ${WORKBENCH} .plugin-market-body .mw-card {
    border-color: var(--line); box-shadow: none; border-radius: var(--r-card);
    transition: border-color var(--dur-hover) var(--ease-swift);
  }
  ${WORKBENCH} .plugin-market-body .mw-card:hover { border-color: var(--line-strong); }
  /* A card with a third action keeps its description readable and moves the actions to a row of their own. */
  ${WORKBENCH} .plugin-market-body .mw-card:has(> .mw-btn ~ .mw-btn ~ .mw-btn) { flex-wrap: wrap; justify-content: flex-end; row-gap: 8px; }
  ${WORKBENCH} .plugin-market-body .mw-card:has(> .mw-btn ~ .mw-btn ~ .mw-btn) > .plugin-market-copy { flex: 1 1 calc(100% - 64px); }
  ${WORKBENCH} .plugin-market-icon { border-radius: 8px; background: var(--nav-hover); color: var(--ink-soft); }
  ${WORKBENCH} .plugin-market-installed-row > * { transition: border-color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .plugin-market-list > * { animation: craft-rise 360ms var(--ease-quint) both; }
  ${[...Array(10).keys()].map((index) => `${WORKBENCH} .plugin-market-list > :nth-child(${index + 1}) { animation-delay: ${index * 22}ms; }`).join("\n  ")}

  /* ─── Settings documents ───────────────────────────────────────────────── */
  ${PAGES} :is(.settings-card, .settings-group, .project-settings-card) { border-radius: var(--r-card); }

  /* ─── Project index: the arrival page ──────────────────────────────────── */
  body.project-index-page { background: var(--desk); }
  body.project-index-page .craft-greeting { margin: 0 0 10px; color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  body.project-index-page .project-index-heading h1 { letter-spacing: -.03em; }
  body.project-index-page .project-card {
    position: relative; border-color: var(--line); box-shadow: none; border-radius: 12px; background: var(--paper);
    transition: border-color var(--dur-hover) var(--ease-swift);
    animation: craft-rise 360ms var(--ease-quint) both;
  }
  ${[...Array(9).keys()].map((index) => `body.project-index-page .project-card-grid > :nth-child(${index + 1}) { animation-delay: ${40 + index * 30}ms; }`).join("\n  ")}
  body.project-index-page .project-card:hover { border-color: var(--line-strong); background: var(--paper); box-shadow: none; transform: none; }
  body.project-index-page .project-card .project-monogram { width: 32px; height: 32px; border-radius: 8px; font-size: 15px; }
  body.project-index-page .project-card:has(.project-monogram) .project-card-icon { display: none; }
  body.project-index-page .project-card:hover footer { color: var(--ink); }
  body.project-index-page > :is(.topbar, .project-directory-topbar),
  body.project-index-page[data-desktop-shell] > :is(.topbar, .project-directory-topbar) { background: transparent; box-shadow: none; border-bottom-color: transparent; position: relative; z-index: 2; }

  /* ─── Drag and drop ────────────────────────────────────────────────────── */
  ${PAGES} [draggable="true"] { -webkit-user-drag: element; }
  ${PAGES} [data-craft-drag-source] { opacity: .45; transition: opacity 120ms var(--ease-swift); }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas], .tab-strip, [data-drop-target], .shelf-drop, .workflow-gap) {
    transition: box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-move) var(--ease-swift);
  }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas]) { background-color: color-mix(in srgb, var(--focus) 4%, var(--paper)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 18%, transparent); }
  body[data-craft-dragging] :is([data-drop-target], .tab-strip):hover { background-color: color-mix(in srgb, var(--focus) 6%, transparent); }

  /* ─── A Goal that just finished ────────────────────────────────────────── */
  .craft-burst { position: fixed; z-index: 2147482000; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
  .craft-burst i {
    position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 2px; background: var(--c, var(--celebrate-a));
    animation: craft-spark var(--d, 820ms) var(--ease-quint) forwards;
  }
  .craft-burst i:nth-child(3n) { border-radius: 50%; }
  .craft-burst i:nth-child(4n) { width: 3px; height: 9px; }
  .craft-burst b {
    position: absolute; left: -18px; top: -18px; width: 36px; height: 36px; border-radius: 50%;
    border: 2px solid var(--celebrate-a); animation: craft-ring 700ms var(--ease-quint) forwards;
  }
  @keyframes craft-spark {
    0% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; }
    100% { transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(.4); opacity: 0; }
  }
  @keyframes craft-ring { from { transform: scale(.3); opacity: .9; } to { transform: scale(2.2); opacity: 0; } }
  ${PAGES} [data-craft-celebrate] .goal-status--completed { animation: craft-done 720ms var(--ease-spring); }
  ${PAGES} [data-craft-celebrate] .goal-status--completed svg { animation: craft-done-mark 720ms var(--ease-spring); }
  @keyframes craft-done { 0% { transform: scale(.8); } 45% { transform: scale(1.12); } 100% { transform: none; } }
  @keyframes craft-done-mark { 0% { transform: rotate(-30deg) scale(.4); } 60% { transform: rotate(8deg) scale(1.2); } 100% { transform: none; } }

  /* ─── Catalog specimens for this layer ─────────────────────────────────── */
  .mw-catalog .mw-craft-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .mw-catalog .mw-craft-lift, .mw-catalog .mw-craft-radius {
    display: grid; gap: 4px; align-content: end; width: 132px; height: 84px; padding: 10px 12px; background: var(--paper); border-radius: var(--r-card);
  }
  .mw-catalog .mw-craft-radius { width: 96px; height: 64px; box-shadow: var(--lift-1); }
  .mw-catalog :is(.mw-craft-lift, .mw-craft-radius) code { font-size: 11px; color: var(--ink-soft); }
  .mw-catalog :is(.mw-craft-lift, .mw-craft-radius) small { font-size: 11px; color: var(--muted); }
  .mw-catalog .mw-craft-space { display: grid; grid-template-columns: 22px 64px 1fr; width: min(100%, 420px); height: 180px; padding: 0; border-radius: 12px; background: var(--desk); box-shadow: inset 0 0 0 1px var(--hairline); overflow: hidden; }
  .mw-catalog .mw-craft-space__rail { background: repeating-linear-gradient(180deg, transparent 0 10px, color-mix(in srgb, var(--ink) 18%, transparent) 10px 14px, transparent 14px 22px) center 16px / 8px 100% no-repeat; }
  .mw-catalog .mw-craft-space__dir { margin: 26px 4px 0; background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--ink) 9%, transparent) 0 6px, transparent 6px 14px) top / 100% 100% no-repeat; }
  .mw-catalog .mw-craft-space__main { display: grid; grid-template-rows: 20px 1fr; padding: 0 6px 6px 0; }
  .mw-catalog .mw-craft-space__tabs { align-self: center; width: 64px; height: 10px; border-radius: 4px; background: var(--paper); box-shadow: var(--lift-1); }
  .mw-catalog .mw-craft-space__sheet { display: grid; align-content: start; gap: 8px; padding: 14px; border-radius: 8px; background: var(--paper); box-shadow: var(--sheet-shadow); }
  .mw-catalog .mw-craft-space__sheet b { display: block; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .mw-catalog .mw-craft-space__sheet b:first-child { width: 40%; height: 9px; background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .mw-catalog .mw-craft-space__sheet b:last-child { width: 70%; }
  .mw-catalog .mw-craft-motion td:first-child { white-space: nowrap; }
  .mw-catalog .mw-craft-stage { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: min(100%, 460px); margin-top: 12px; padding: 10px 12px; border-radius: var(--r-row); background: var(--paper); box-shadow: var(--lift-1); }
  .mw-catalog .mw-craft-stage.is-rising { animation: craft-rise var(--dur-arrive) var(--ease-quint); }
  .mw-catalog .mw-craft-stage__title { font-size: 13px; color: var(--ink); }
  .mw-catalog .mw-craft-mono { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-soft); }
  .mw-catalog .mw-craft-strip { padding: 4px 8px; border-radius: 10px; background: var(--desk); }
  .mw-catalog .mw-craft-tab { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 7px; color: var(--muted); font-size: 12px; }
  .mw-catalog .mw-craft-tab svg { width: 14px; height: 14px; }
  .mw-catalog .mw-craft-tip { position: static; opacity: 1; transform: none; margin-left: 12px; }

  /* ─── Reduced motion: nothing here moves ───────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    ${PAGES} *, ${PAGES} *::before, ${PAGES} *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; }
    ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .tab-item, .tab-view-chip, .project-card, .home-day, [data-kanban-card], .mw-check, .mw-radio):active { transform: none !important; }
    ${PAGES} :is(.mw-btn, .tab-item, [data-kanban-card], .project-card, .plugin-market-body .mw-card, .plugin-market-installed-row > *):hover { transform: none !important; }
    .craft-burst, .craft-tip { transition: none; }
    .craft-burst { display: none; }
  }
`;

/** Under automation (headless review, e2e) the layer holds still so geometry reads settle at once. */
const STILL_RESET = `
  html[data-craft-still] :is(.dock-window, .account-global-popover, .assistant-panel, .plugin-picker-popover, .immersive-home[data-event="on"] .home-eventcol, .tab-pane-body > [data-work-surface], .tab-workspace-exclusive > *, .home-tl__rows > *, .plugin-market-list > *, .project-card,
    dialog[open], ${DROPDOWN}, details[open] > .navigator-project-menu-popover, .toast, .mw-check, .mw-radio, [data-graph-edge] path,
    [data-craft-celebrate] .goal-status--completed, [data-craft-celebrate] .goal-status--completed svg) { animation: none !important; }
  html[data-craft-still] :is(dialog[open], .mw-check:checked, .mw-radio:checked, .plugin-rail-items .immersive-plugin-link[aria-current], [data-craft-new])::after,
  html[data-craft-still] dialog[open]::backdrop,
  html[data-craft-still] :is(.goal-canvas-node, [data-graph-node], [data-kanban-card]) *::after { animation: none !important; }
`;

export const CRAFT_FINISH_STYLES = CRAFT_BASE_STYLES + STILL_RESET;

/** Behaviour for the craft layer. Everything here is presentation: it never writes Goal state,
 * never moves focus and never cancels another handler. Without it the pages look the same, only
 * without tooltips, landing washes and the completion moment. */
export const CRAFT_FINISH_CLIENT_SCRIPT = `
(function craftFinish() {
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", craftFinish, { once: true }); return; }
  if (globalThis.__molisCraftFinish) return;
  globalThis.__molisCraftFinish = true;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  const still = navigator.webdriver === true;
  if (still) root.setAttribute("data-craft-still", "");
  const reduced = () => still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = (text) => (typeof globalThis.L === "function" ? globalThis.L(text) : text);
  const embedded = body.hasAttribute("data-pane-embedded");
  const workbench = body.classList.contains("immersive-workbench");

  /* A greeting that follows the local clock. */
  const daylight = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return ["早上好", "yellow"];
    if (hour >= 11 && hour < 13) return ["中午好", "orange"];
    if (hour >= 13 && hour < 18) return ["下午好", "orange"];
    if (hour >= 18 && hour < 23) return ["晚上好", "indigo"];
    return ["夜深了", "purple"];
  };
  document.querySelectorAll("[data-craft-greeting]").forEach((node) => {
    const [text, hue] = daylight();
    node.textContent = T(text);
    node.style.setProperty("--craft-daylight", "var(--hue-" + hue + "-fill)");
    node.hidden = false;
  });

  /* Opening a project: the rail settles in, then the sheet. Once per page. */
  if (workbench && !embedded && !reduced()) {
    let index = 0;
    body.querySelectorAll(".plugin-stack :is(.immersive-plugin-link, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .personal-account)")
      .forEach((node) => node.style.setProperty("--craft-i", String(Math.min(index++, 28))));
    body.classList.add("is-craft-opening");
    setTimeout(() => body.classList.remove("is-craft-opening"), 1400);
  }

  /* ⌥1…⌥9 open the first nine tools of the rail, Home first. Typing, terminals and menus keep their keys. */
  const railShortcuts = () => [...document.querySelectorAll(".dock-pins [data-dock-pin], .plugin-rail-items [data-plugin-id]")]
    .filter((node) => node.dataset.pluginId !== "plugin-builder" && node.getClientRects().length).slice(0, 9);
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (!digit) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), .xterm, [data-tui-pane], dialog[open], [popover]:popover-open")) return;
    const node = railShortcuts()[Number(digit[1]) - 1];
    if (!node) return;
    event.preventDefault();
    node.click();
  });

  /* Tools zone: the three used last stay on the rail; 全部工具 opens the rest in place and closes
   * again once one is chosen. Presentation only — opening a tool is still the rail's own click. */
  const RECENT_KEY = "molis-work:rail-recent-tools";
  const railList = document.querySelector(".plugin-rail-items");
  if (railList) {
    const readRecent = () => {
      try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
      catch { return []; }
    };
    const paintRecent = () => {
      const recent = new Set(readRecent().slice(0, 3));
      railList.querySelectorAll('[data-rail-zone="tool"][data-plugin-id]').forEach((node) => node.classList.toggle("is-recent", recent.has(node.dataset.pluginId)));
    };
    const remember = (id) => {
      const list = readRecent();
      if (list[0] === id) return;
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list.filter((item) => item !== id)].slice(0, 8))); } catch {}
      paintRecent();
    };
    const toggle = railList.querySelector("[data-rail-tools-toggle]");
    const toggleLabel = toggle && toggle.querySelector("span");
    const openText = toggleLabel ? toggleLabel.textContent : "";
    const closeText = (toggleLabel && toggleLabel.dataset.railToggleLabel) || openText;
    const setOpen = (open) => {
      railList.classList.toggle("is-tools-open", open);
      if (!toggle) return;
      const text = open ? closeText : openText;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", text);
      toggle.title = text;
      if (toggleLabel) toggleLabel.textContent = text;
    };
    if (toggle) toggle.addEventListener("click", () => setOpen(!railList.classList.contains("is-tools-open")));
    railList.addEventListener("click", (event) => {
      const chosen = event.target instanceof Element && event.target.closest('[data-rail-zone="tool"][data-plugin-id], [data-rail-zone="extend"]');
      if (!chosen) return;
      if (chosen.matches("[data-plugin-id]") && chosen.dataset.railZone === "tool") remember(chosen.dataset.pluginId);
      if (railList.classList.contains("is-tools-open")) requestAnimationFrame(() => setOpen(false));
    });
    // A tool opened any other way — search, a link, a restored tab — counts as used too.
    new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target;
        if (node instanceof Element && node.matches('[data-rail-zone="tool"][data-plugin-id][aria-current]')) remember(node.dataset.pluginId);
      }
    }).observe(railList, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    paintRecent();
  }

  /* Rail tooltips: one element in the page, placed beside the control, so no scroll column clips it. */
  const TIP_TARGETS = ".plugin-stack :is(.immersive-plugin-link, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .personal-account, .navigator-directory-toggle, .immersive-show-directory), .workbench-bar :is(.dock-pin, .bar-resident, .bar-chat, .account-global-trigger, .navigator-project-selector, .plugin-picker-trigger), [data-craft-tip]";
  const tip = document.createElement("div");
  tip.className = "craft-tip";
  tip.setAttribute("aria-hidden", "true");
  let tipOwner = null, tipTimer = 0, lastHidden = 0;
  const hoverable = matchMedia("(hover: hover) and (pointer: fine)");
  const labelFor = (node) => {
    if (node.matches(".navigator-project-selector")) return node.querySelector("strong")?.textContent?.trim() || node.getAttribute("aria-label") || "";
    return node.dataset.craftTip || node.dataset.craftTitle || node.getAttribute("title") || node.getAttribute("aria-label") || "";
  };
  const place = (node) => {
    const box = node.getBoundingClientRect();
    const beside = node.closest(".plugin-stack");
    const above = node.closest(".workbench-bar");
    const x = beside ? box.right + 10 : box.left + box.width / 2 - tip.offsetWidth / 2;
    const y = beside ? box.top + box.height / 2 - tip.offsetHeight / 2 : above ? box.top - tip.offsetHeight - 8 : box.bottom + 8;
    tip.style.setProperty("--tip-x", Math.round(Math.max(6, Math.min(innerWidth - tip.offsetWidth - 6, x))) + "px");
    tip.style.setProperty("--tip-y", Math.round(Math.max(6, y)) + "px");
    tip.style.transformOrigin = beside ? "left center" : above ? "bottom center" : "top center";
  };
  const showTip = (node) => {
    const name = node.querySelector(":scope > span:not(.personal-account-avatar):not(.project-monogram), .personal-account-copy");
    if (name && name.getBoundingClientRect().width > 2) return;
    const text = labelFor(node);
    if (!text) return;
    if (node.hasAttribute("title")) { node.dataset.craftTitle = node.getAttribute("title"); node.removeAttribute("title"); }
    tip.textContent = text;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const shortcut = node.matches(".navigator-project-search") ? (mac ? "⌘K" : "Ctrl K")
      : railShortcuts().indexOf(node) >= 0 ? (mac ? "⌥" : "Alt ") + (railShortcuts().indexOf(node) + 1) : "";
    if (shortcut) {
      const key = document.createElement("kbd");
      key.textContent = shortcut;
      tip.append(key);
    }
    if (!tip.isConnected) body.append(tip);
    tipOwner = node;
    place(node);
    requestAnimationFrame(() => { if (tipOwner === node) tip.setAttribute("data-shown", ""); });
  };
  const hideTip = () => {
    clearTimeout(tipTimer);
    if (!tipOwner) return;
    if (tipOwner.dataset.craftTitle != null) { tipOwner.setAttribute("title", tipOwner.dataset.craftTitle); delete tipOwner.dataset.craftTitle; }
    tipOwner = null;
    tip.removeAttribute("data-shown");
    lastHidden = Date.now();
  };
  const queueTip = (node) => {
    if (tipOwner === node) return;
    hideTip();
    const warm = Date.now() - lastHidden < 500;
    tipTimer = setTimeout(() => showTip(node), warm ? 0 : 420);
  };
  document.addEventListener("pointerover", (event) => {
    if (!hoverable.matches || event.pointerType === "touch") return;
    const node = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
    if (node) queueTip(node);
  });
  document.addEventListener("pointerout", (event) => {
    const node = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
    if (!node || (event.relatedTarget instanceof Node && node.contains(event.relatedTarget))) return;
    hideTip();
  });
  document.addEventListener("focusin", (event) => {
    const node = event.target instanceof Element ? event.target.closest(TIP_TARGETS) : null;
    if (node && node.matches(":focus-visible")) queueTip(node);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("scroll", hideTip, true);
  addEventListener("blur", hideTip);

  /* Presentation of drag: the source leaves a faded hole; drop areas become visible. */
  const endDrag = () => {
    document.querySelectorAll("[data-craft-drag-source]").forEach((node) => node.removeAttribute("data-craft-drag-source"));
    body.removeAttribute("data-craft-dragging");
  };
  document.addEventListener("dragstart", (event) => {
    const source = event.target instanceof Element ? event.target.closest("[draggable='true']") : null;
    if (!source) return;
    hideTip();
    requestAnimationFrame(() => {
      if (!source.matches(".tab-item, .tab-item *")) source.setAttribute("data-craft-drag-source", "");
      body.setAttribute("data-craft-dragging", "");
    });
  }, true);
  document.addEventListener("dragend", endDrag, true);
  document.addEventListener("drop", () => setTimeout(endDrag, 0), true);

  /* The completion moment: a ring and a handful of sparks from the mark that just turned done. */
  const celebrate = (mark) => {
    const host = mark;
    host.setAttribute("data-craft-celebrate", "");
    setTimeout(() => host.removeAttribute("data-craft-celebrate"), 900);
    if (reduced()) return;
    const box = (mark.querySelector(".goal-status--completed svg") || mark).getBoundingClientRect();
    if (!box.width) return;
    const burst = document.createElement("div");
    burst.className = "craft-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.style.left = Math.round(box.left + box.width / 2) + "px";
    burst.style.top = Math.round(box.top + box.height / 2) + "px";
    const colours = ["var(--celebrate-a)", "var(--celebrate-b)", "var(--celebrate-c)", "var(--celebrate-a)"];
    let html = "<b></b>";
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2 + Math.random() * .35;
      const distance = 26 + Math.random() * 34;
      html += '<i style="--x:' + Math.round(Math.cos(angle) * distance) + "px;--y:" + Math.round(Math.sin(angle) * distance - 8) + "px;--r:" + Math.round(Math.random() * 320 - 160) + "deg;--c:" + colours[index % colours.length] + ";--d:" + Math.round(640 + Math.random() * 360) + 'ms"></i>';
    }
    burst.innerHTML = html;
    body.append(burst);
    setTimeout(() => burst.remove(), 1200);
  };
  /* Something that just arrived: one wash from its leading edge. */
  const land = (node) => {
    if (!node || reduced()) return;
    node.setAttribute("data-craft-new", "");
    setTimeout(() => node.removeAttribute("data-craft-new"), 1700);
  };
  /* Plugins may mark their own finish and arrival moments; both are presentation only. */
  globalThis.molisCraft = Object.freeze({ celebrate, land });

  if (!workbench) return;

  /* Something new lands once: a created Goal, a pulled message, a new Inbox entry. */
  const LANDING = [
    { rows: ".tree-node[data-select-goal]", id: (node) => node.dataset.selectGoal,
      marks: (id) => '.tree-node[data-select-goal="' + CSS.escape(id) + '"], [data-kanban-card][data-goal-id="' + CSS.escape(id) + '"], [data-graph-node][data-goal-id="' + CSS.escape(id) + '"]' },
    { rows: "[data-feed-entry-id]", id: (node) => node.dataset.feedEntryId, marks: (id) => '[data-feed-entry-id="' + CSS.escape(id) + '"]' },
    { rows: "[data-inbox-entry-id]", id: (node) => node.dataset.inboxEntryId, marks: (id) => '[data-inbox-entry-id="' + CSS.escape(id) + '"]' },
  ];
  const known = LANDING.map((kind) => new Set([...document.querySelectorAll(kind.rows)].map(kind.id).filter(Boolean)));
  const settledAt = Date.now() + 2500;
  const landed = (kind, id) => document.querySelectorAll(kind.marks(id)).forEach(land);

  /* A Goal that finishes gets its moment where you are looking at it: the open Goal's own mark. */
  const FOCAL = "[data-workspace-goal-status], [data-frame-goal-status]";
  const finished = new Map();
  const focalKey = (mark) => mark.matches("[data-workspace-goal-status]")
    ? "goal:" + (document.querySelector("[data-goal-node-workspace]")?.dataset.expandedGoal || document.querySelector("[data-workspace-goal-title]")?.textContent?.trim() || "")
    : "frame:" + (document.querySelector("[data-frame-goal-title]")?.textContent?.trim() || "");
  const readFocal = () => {
    document.querySelectorAll(FOCAL).forEach((mark) => {
      const key = focalKey(mark);
      if (key.endsWith(":")) return;
      const done = !!mark.querySelector(".goal-status--completed");
      const before = finished.get(key);
      finished.set(key, done);
      if (done && before === false) celebrate(mark);
    });
  };

  let queued = 0;
  const settle = () => {
    queued = 0;
    readFocal();
    LANDING.forEach((kind, index) => {
      const fresh = [];
      document.querySelectorAll(kind.rows).forEach((node) => {
        const id = kind.id(node);
        if (id && !known[index].has(id)) { known[index].add(id); fresh.push(id); }
      });
      if (Date.now() > settledAt && fresh.length && fresh.length <= 3) fresh.forEach((id) => landed(kind, id));
    });
  };
  const QUIET = ".xterm, .terminal, [data-tui-pane], .goal-tui-pane, .craft-burst, .craft-tip";
  new MutationObserver((records) => {
    if (queued) return;
    const relevant = records.some((record) => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return node && !node.closest(QUIET);
    });
    if (relevant) queued = setTimeout(settle, 160);
  }).observe(body, { childList: true, subtree: true });
  readFocal();
})();
`;
