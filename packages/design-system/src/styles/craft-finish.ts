import { MW_PLUGINS } from "../palette.js";

/** Craft finish: the last layer of every Molis Work page.
 *
 * One spatial idea runs through it. The chrome — titlebar, plugin rail, directory — is a quiet
 * desk. The work itself is one sheet of paper lying on it: rounded, lifted a hair, the same for
 * every plugin, so opening Feed or a Goal never changes what kind of place you are in.
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
    --lift-1: 0 0 0 1px var(--hairline), 0 1px 2px rgba(19, 21, 32, .04), 0 2px 6px -2px rgba(19, 21, 32, .05);
    --lift-2: 0 0 0 1px var(--hairline), 0 2px 4px -1px rgba(19, 21, 32, .06), 0 8px 20px -6px rgba(19, 21, 32, .12);
    --lift-3: 0 0 0 1px var(--hairline), 0 6px 14px -4px rgba(19, 21, 32, .10), 0 24px 56px -12px rgba(19, 21, 32, .22);
    --sheet-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent), 0 1px 1px rgba(19, 21, 32, .03), 0 2px 8px -2px rgba(19, 21, 32, .05);
    --press-shade: color-mix(in srgb, var(--ink) 5%, transparent);
    --tip-bg: #1c1d21; --tip-ink: #f4f5f6;
    --celebrate-a: var(--hue-green-fill, #4cb782);
    --celebrate-b: var(--hue-indigo-fill, #5e6ad2);
    --celebrate-c: var(--hue-yellow-fill, #e2b203);
  }
  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] ${PAGES} {
    --lift-1: 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight), 0 1px 2px rgba(0, 0, 0, .4);
    --lift-2: 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight), 0 8px 22px -6px rgba(0, 0, 0, .6);
    --lift-3: 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight), 0 28px 64px -12px rgba(0, 0, 0, .7);
    --sheet-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent), inset 0 1px 0 rgba(255, 255, 255, .04), 0 2px 10px -2px rgba(0, 0, 0, .5);
    --press-shade: color-mix(in srgb, var(--ink) 7%, transparent);
    --tip-bg: #f4f5f6; --tip-ink: #16171a;
  }

  /* ─── Desk and sheet ───────────────────────────────────────────────────── */
  ${WORKBENCH} .immersive-workspace { background: var(--desk); }
  ${SHELL} .immersive-titlebar { background: var(--desk); box-shadow: none; }
  ${SHELL} .plugin-stack { background: var(--desk); }
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
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent), 0 2px 12px -4px rgba(19, 21, 32, .10);
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
    ${WORKBENCH} .immersive-home .home-dates { padding: 10px 8px 0; background: color-mix(in srgb, var(--desk) 60%, var(--paper)); box-shadow: inset -1px 0 0 var(--line); }
    ${WORKBENCH} .immersive-home[data-event="on"] .home-flow { padding-right: 0; }
    ${WORKBENCH} .immersive-home .home-eventcol { box-shadow: inset 1px 0 0 var(--line); background: color-mix(in srgb, var(--desk) 30%, var(--paper)); }
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
  ${WORKBENCH} .tab-strip .tab-item svg { color: color-mix(in srgb, var(--plugin-tint, var(--muted)) 55%, var(--muted)); transition: color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .tab-strip .tab-item:is(:hover, [aria-current]) svg { color: var(--plugin-tint, var(--ink-soft)); }
  ${WORKBENCH} .tab-strip .tab-item:active:not(:has(.tab-item-close:active)) { transform: scale(.975); }
  ${WORKBENCH} .tab-strip .tab-item.is-dragging,
  ${WORKBENCH} .tab-strip .tab-item[data-dragging] { box-shadow: var(--lift-2); background: var(--paper); transform: scale(1.02); }
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
  ${PAGES} .tab-view-chip svg { width: 14px; height: 14px; color: var(--plugin-tint, var(--muted)); }
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

  /* ─── Plugin rail: this project's tools, then the ways to extend them, then you ─── */
  :root ${SHELL} :is(.assistant-island-card, .workspace-chrome .navigator-project-primary, .plugin-rail-items, .plugin-rail .personal-sidebar-footer) {
    background: transparent; box-shadow: none; border: 0;
  }
  /* Zone hairlines sit in the 8px between zones and take no height; item tracks keep ::before for their chip. */
  @media (min-width: 601px) {
    ${SHELL} .plugin-rail { position: relative; overflow: visible; }
    ${SHELL} :is(.plugin-rail, .plugin-rail .assistant-island)::before {
      content: ""; position: absolute; z-index: 1; top: -4.5px; left: 50%; width: 20px; height: 1px; margin-left: -10px;
      background: var(--line-strong); pointer-events: none;
    }
    ${SHELL} .plugin-rail-items { overflow-x: hidden; }
  }
  /* Group names read as hairlines in the icon rail and as quiet headings once names are shown. */
  ${SHELL} .plugin-rail-group {
    flex: none; width: 16px; height: 1px; margin: 5px auto; padding: 0; overflow: hidden;
    background: var(--line); color: transparent; font-size: 0; line-height: 0; user-select: none;
  }
  ${SHELL} ${RAIL_LINK} {
    border-radius: 10px;
    transition: background-color var(--dur-hover) var(--ease-swift), color var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} ${RAIL_LINK} svg {
    color: color-mix(in srgb, var(--plugin-tint, var(--muted)) 34%, var(--muted));
    transition: color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring);
  }
  ${SHELL} ${RAIL_LINK}:hover { background: var(--nav-hover); }
  ${SHELL} ${RAIL_LINK}:hover svg { color: var(--plugin-tint, var(--ink)); }
  ${SHELL} ${RAIL_LINK}:active:not(:disabled) svg { transform: scale(.84); }
  ${SHELL} :is(.plugin-rail, .assistant-island) .immersive-plugin-link:is([aria-current], [aria-expanded="true"]) svg { color: var(--plugin-tint, var(--ink)); }
  ${SHELL} :is(.plugin-rail-items, .assistant-island-card)[data-seg-thumb]::before { border-radius: 10px; }
  ${SHELL} .plugin-rail a.plugin-rail-item { text-decoration: none; color: inherit; }
  /* The current plugin keeps a mark at its leading edge beside the travelling chip. */
  ${SHELL} .plugin-rail-items .immersive-plugin-link[aria-current]::after {
    content: ""; position: absolute; left: -4px; top: 50%; width: 3px; height: 16px; margin-top: -8px;
    border-radius: 0 3px 3px 0; background: var(--plugin-tint, var(--ink));
    animation: craft-rail-mark var(--dur-move) var(--ease-spring);
  }
  ${SHELL} .plugin-rail-items .immersive-plugin-link { position: relative; }
  @keyframes craft-rail-mark { from { transform: scaleY(.2); opacity: 0; } to { transform: none; opacity: 1; } }
  /* The rail's own toggle lives with Back and Forward in the titlebar, where macOS keeps a sidebar button. */
  ${SHELL} .workspace-history .navigation-labels-toggle { flex: none; align-self: center; margin: 0; padding: 0; min-height: 0; }
  ${SHELL}[data-navigation-labels="true"] .workspace-history .navigation-labels-toggle { background: var(--nav-active); color: var(--ink); }
  ${SHELL} .navigator-project-search :is(.navigator-project-search-label, kbd) { display: none; }

  /* Names shown: a 208px sidebar with a project header, a search field, grouped tools and a personal footer. */
  @media (min-width: 761px) {
    ${SHELL}[data-navigation-labels="true"] { --plugin-rail-width: 208px; }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-primary {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-auto-rows: auto; align-items: center; gap: 6px 2px; padding: 6px 8px 0;
    }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-primary > * { grid-column: 1 / 3; }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-menu { grid-column: 1; grid-row: 1; width: auto; min-width: 0; }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-settings { grid-column: 2; grid-row: 1; width: 30px; height: 30px; min-height: 30px; }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-search { grid-row: 2; }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome :is(.desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none; }
    ${SHELL}[data-navigation-labels="true"] .immersive-workspace .navigator-project-selector {
      width: 100%; height: 34px; justify-content: flex-start; gap: 9px; padding: 0 8px 0 6px; border-radius: 10px;
    }
    ${SHELL}[data-navigation-labels="true"] .navigator-project-selector strong { font-size: 13px; color: var(--ink); }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-search {
      display: flex; align-items: center; width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 8px; padding: 0 8px 0 10px; border-radius: 9px;
      background: color-mix(in srgb, var(--ink) 4.5%, transparent); box-shadow: inset 0 0 0 1px var(--hairline); color: var(--faint); font-size: 12px;
    }
    ${SHELL}[data-navigation-labels="true"] .workspace-chrome .navigator-project-search:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--muted); }
    ${SHELL}[data-navigation-labels="true"] .navigator-project-search .navigator-project-search-label { display: inline; flex: 1; text-align: left; }
    ${SHELL}[data-navigation-labels="true"] .navigator-project-search kbd {
      display: inline; padding: 0 5px; border-radius: 5px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--hairline);
      color: var(--faint); font: inherit; font-size: 10.5px; line-height: 17px;
    }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail-items { align-items: stretch; padding: 2px 8px 6px; gap: 1px; }
    ${SHELL}[data-navigation-labels="true"] :is(.plugin-rail, .assistant-island) .plugin-rail-item {
      width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 10px; padding: 0 10px; border-radius: 8px;
    }
    ${SHELL}[data-navigation-labels="true"] :is(.plugin-rail, .assistant-island) .plugin-rail-item svg { width: 16px; height: 16px; }
    ${SHELL}[data-navigation-labels="true"] :is(.plugin-rail, .assistant-island) .plugin-rail-item > span { font-size: 13px; color: var(--ink-soft); }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail-item:is([aria-current], [aria-expanded="true"]) > span { color: var(--ink); }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail-items .immersive-plugin-link[aria-current]::after { left: -8px; }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail-group {
      width: auto; height: auto; margin: 10px 0 2px; padding: 0 10px; background: none; overflow: visible;
      color: var(--faint); font-size: 11px; line-height: 18px; letter-spacing: .02em;
    }
    ${SHELL}[data-navigation-labels="true"] :is(.plugin-rail, .plugin-rail .assistant-island)::before { left: 16px; right: 16px; width: auto; margin-left: 0; }
    /* Personal tools share one row; each keeps its name. */
    ${SHELL}[data-navigation-labels="true"] .assistant-island-card { flex-direction: row; align-items: center; gap: 2px; padding: 0 8px; }
    ${SHELL}[data-navigation-labels="true"] .assistant-island .plugin-rail-item { flex: 1 1 0; min-width: 0; justify-content: center; gap: 6px; padding: 0 6px; }
    ${SHELL}[data-navigation-labels="true"] .assistant-island .plugin-rail-item > span { font-size: 12px; }
    /* You: the account takes the row, settings is its gear. */
    ${SHELL}[data-navigation-labels="true"] .plugin-rail .personal-sidebar-footer { flex-direction: row; align-items: center; gap: 2px; padding: 0 8px; }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail .personal-account { order: 1; flex: 1; width: auto; min-width: 0; height: 36px; padding: 0 6px; border-radius: 10px; }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail .personal-settings { order: 2; flex: none; width: 32px; padding: 0; justify-content: center; }
    ${SHELL}[data-navigation-labels="true"] .plugin-rail .personal-settings > span { display: none; }
  }
  /* A phone keeps personal tools in the drawer, so the top of the page has one row less. */
  @media (max-width: 600px) {
    ${SHELL} { --assistant-island-row: 0px; }
    ${SHELL} .plugin-rail .assistant-island { grid-column: auto; grid-row: auto; padding: 0; background: transparent; }
    ${SHELL} .plugin-rail .assistant-island-card { flex-direction: column; width: 100%; height: auto; min-height: 0; padding: 4px; }
  }

  /* The project is its own mark: a letter on a stable hue, not a generic database glyph. */
  .project-monogram {
    --mono: var(--hue-indigo-fill, #5e6ad2);
    display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 7px;
    background: linear-gradient(155deg, color-mix(in srgb, var(--mono) 88%, white) 0%, var(--mono) 55%, color-mix(in srgb, var(--mono) 78%, black) 100%);
    color: #fff; font-size: 12px; font-weight: 500; line-height: 1; letter-spacing: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), inset 0 0 0 1px rgba(0, 0, 0, .06), 0 1px 2px rgba(19, 21, 32, .16);
    text-shadow: 0 1px 1px rgba(0, 0, 0, .18);
  }
  ${["indigo", "blue", "cyan", "mint", "green", "orange", "pink", "purple", "brown", "slate"].map((hue) => `.project-monogram[data-hue="${hue}"] { --mono: var(--hue-${hue}-fill); }`).join("\n  ")}
  ${SHELL} .workspace-chrome .navigator-project-selector { place-items: center; justify-content: center; }
  ${SHELL} .workspace-chrome .navigator-project-selector > svg:first-child:not(:only-child) { display: none; }
  ${SHELL} .workspace-chrome .navigator-project-selector .project-monogram { transition: transform var(--dur-move) var(--ease-spring), box-shadow var(--dur-move) var(--ease-quint); }
  ${SHELL} .workspace-chrome .navigator-project-selector:hover .project-monogram { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), inset 0 0 0 1px rgba(0, 0, 0, .06), 0 4px 10px -2px color-mix(in srgb, var(--mono) 55%, transparent); }
  ${SHELL} .workspace-chrome .navigator-project-selector:active .project-monogram { transform: scale(.9); }
  ${SHELL} .workspace-chrome .navigator-project-menu[open] .project-monogram { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .28), 0 0 0 2px var(--desk), 0 0 0 3.5px color-mix(in srgb, var(--mono) 60%, transparent); }
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

  /* ─── Directory: rows on the desk; the selected one is a small raised sheet ── */
  ${SHELL} .tree-pane :is(.mw-dir-row, .directory-list-row, .tree-node, .source-list-item) {
    border-radius: var(--r-row);
    transition: background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-swift);
  }
  ${SHELL} .tree-pane :is(.mw-dir-row, .directory-list-row, .tree-node, .source-list-item):active:not(:disabled) { background: var(--nav-press); }
  ${SHELL} .tree-pane :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .source-list-item.is-selected) {
    background: var(--paper); box-shadow: var(--lift-1); color: var(--ink);
  }
  ${SHELL} .tree-pane .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])) { background: var(--paper); box-shadow: var(--lift-1); border-radius: var(--r-row); }
  ${SHELL} .tree-pane .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])) :is(.mw-dir-row, .directory-list-row) { background: transparent; box-shadow: none; }
  ${SHELL} .tree-pane .directory-list-row.is-selected :is(.tree-node, .tree-row) { background: transparent; }
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
  ${PAGES} .mw-btn--primary {
    background-image: linear-gradient(180deg, rgba(255, 255, 255, .10), rgba(255, 255, 255, 0) 60%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14), 0 1px 2px rgba(19, 21, 32, .18), 0 0 0 1px color-mix(in srgb, var(--action) 88%, black);
  }
  ${PAGES} .mw-btn--primary:hover:not(:disabled) { background-color: color-mix(in srgb, var(--action) 88%, var(--paper)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16), 0 3px 8px -2px rgba(19, 21, 32, .28), 0 0 0 1px color-mix(in srgb, var(--action) 88%, black); }
  html[data-resolved-theme="dark"] ${PAGES} .mw-btn--primary {
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(0, 0, 0, .05));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .6), 0 1px 2px rgba(0, 0, 0, .5), 0 0 0 1px color-mix(in srgb, var(--action) 80%, black);
  }
  html[data-resolved-theme="dark"] ${PAGES} .mw-btn--primary:hover:not(:disabled) { background-color: color-mix(in srgb, var(--action) 90%, var(--desk)); }
  ${PAGES} .mw-btn--secondary:not(:disabled) { box-shadow: var(--lift-1); border-color: transparent; }
  ${PAGES} .mw-btn--secondary:hover:not(:disabled) { box-shadow: var(--lift-2); }
  ${WORKBENCH} .plugin-stage-chrome .tree-create,
  ${WORKBENCH} .goal-stage-chrome .tree-create {
    border-color: transparent; background: var(--paper); box-shadow: var(--lift-1);
  }
  ${WORKBENCH} :is(.plugin-stage-chrome, .goal-stage-chrome) .tree-create:hover { box-shadow: var(--lift-2); background: var(--paper); }
  ${WORKBENCH} :is(.plugin-stage-chrome, .goal-stage-chrome) .tree-create svg { transition: transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} :is(.plugin-stage-chrome, .goal-stage-chrome) .tree-create:hover svg { transform: rotate(90deg); }
  ${PAGES} .mw-btn:disabled, ${PAGES} .mw-btn[aria-disabled="true"] { box-shadow: none; background-image: none; }

  /* Segmented controls: the thumb settles on a spring; slots brighten on hover. */
  ${PAGES} .mw-toggle-group { border-radius: 10px; }
  ${PAGES} .mw-toggle-group[data-seg-thumb]::before { border-radius: 7px; box-shadow: var(--lift-1); }
  ${PAGES} .mw-toggle-group > .mw-toggle:not(.is-current, [aria-pressed="true"], [aria-current]):hover { color: var(--ink); }
  ${PAGES} .mw-toggle svg { transition: transform var(--dur-move) var(--ease-spring); }
  ${PAGES} .mw-toggle:is(.is-current, [aria-pressed="true"]) svg { transform: scale(1.06); }

  /* Fields: a hairline that darkens, and a soft accent halo while you write. */
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select, .mw-input-group, .project-index-search) {
    transition: border-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-swift);
  }
  ${PAGES} :is(.mw-input, .mw-textarea):not([data-plain-field]):focus-visible,
  ${PAGES} :is(.mw-input-group, .project-index-search):focus-within {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink) 7%, transparent);
  }
  ${PAGES} [data-plain-field]:focus-visible { background-image: linear-gradient(var(--focus), var(--focus)); background-size: 100% 2px; background-position: 0 100%; background-repeat: no-repeat; }

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
  ${PAGES} :is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tab-menu) { border-radius: var(--r-card); box-shadow: var(--lift-2); }
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
    background: linear-gradient(90deg, color-mix(in srgb, var(--plugin-tint, var(--focus)) 24%, transparent), transparent 80%);
    animation: craft-landed 1600ms var(--ease-swift) forwards;
  }
  @keyframes craft-landed { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }

  /* Progress bars fill instead of appearing full. */
  ${WORKBENCH} :is(.goal-progress-bar, .tree-progress, .mw-progress) > :is(i, span, .mw-progress__bar) { transition: width 520ms var(--ease-quint), transform 520ms var(--ease-quint); }

  /* ─── Status ───────────────────────────────────────────────────────────── */
  /* Work that is actually moving breathes on the canvas and board — nowhere else. */
  ${WORKBENCH} :is(.goal-canvas-node, .kanban-card, [data-graph-node], [data-kanban-card]) :is(.goal-status--executing, .goal-status--in_progress, .goal-status--clarifying, .goal-status--reviewing) :is(i, .goal-status-dot)::after,
  ${WORKBENCH} :is([data-graph-node], [data-kanban-card]) .status-dot[data-tone="progress"]::after {
    content: ""; position: absolute; inset: -3px; border-radius: 50%; background: currentColor; opacity: 0;
    animation: craft-breathe 2.4s var(--ease-swift) infinite;
  }
  @keyframes craft-breathe { 0% { transform: scale(.6); opacity: .35; } 70%, 100% { transform: scale(1.8); opacity: 0; } }

  /* ─── Goal canvas ──────────────────────────────────────────────────────── */
  ${WORKBENCH} .goal-canvas-viewport {
    background-color: var(--paper);
    background-image: radial-gradient(color-mix(in srgb, var(--ink) 13%, transparent) 1px, transparent 1.3px);
    background-size: 22px 22px;
  }
  ${WORKBENCH} .goal-canvas-viewport.is-panning { cursor: grabbing; }
  ${WORKBENCH} [data-graph-node] {
    border-radius: var(--r-card); box-shadow: var(--lift-1); border-color: transparent;
    transition: box-shadow var(--dur-move) var(--ease-quint), opacity var(--dur-move) var(--ease-swift);
  }
  ${WORKBENCH} [data-graph-node]:hover { box-shadow: var(--lift-2); }
  ${WORKBENCH} [data-graph-node].is-selected:not(.is-expanded-node) {
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--plugin-tint, var(--focus)) 70%, transparent), 0 0 0 5px color-mix(in srgb, var(--plugin-tint, var(--focus)) 12%, transparent), 0 8px 20px -6px rgba(19, 21, 32, .14);
  }
  ${WORKBENCH} [data-graph-node].is-dragging { box-shadow: var(--lift-3); cursor: grabbing; z-index: 5; }
  ${WORKBENCH} [data-graph-node].is-dragging > * { transform: rotate(-.6deg); }
  ${WORKBENCH} [data-graph-edge] path { transition: stroke var(--dur-move) var(--ease-swift), stroke-width var(--dur-move) var(--ease-swift), opacity var(--dur-move) var(--ease-swift); }
  ${WORKBENCH} [data-graph-edge].is-selected-path path { stroke-dasharray: 6 5; animation: craft-flow 900ms linear infinite; }
  @keyframes craft-flow { to { stroke-dashoffset: -11; } }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) > div {
    border-radius: 12px; background: color-mix(in srgb, var(--paper) 86%, transparent); box-shadow: var(--lift-2);
    backdrop-filter: blur(10px) saturate(1.4); -webkit-backdrop-filter: blur(10px) saturate(1.4);
  }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button:hover { background: var(--nav-hover); }
  ${WORKBENCH} :is(.goal-canvas-tools, .goal-frame-tools) button:active { transform: scale(.88); }

  /* ─── Board ────────────────────────────────────────────────────────────── */
  ${WORKBENCH} [data-kanban-card] {
    border-radius: 10px; box-shadow: var(--lift-1); border-color: transparent;
    transition: box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-swift);
  }
  ${WORKBENCH} [data-kanban-card]:hover { box-shadow: var(--lift-2); transform: translateY(-1px); }
  ${WORKBENCH} [data-kanban-card]:active { transform: translateY(0) scale(.99); transition-duration: var(--dur-press); }
  ${WORKBENCH} [data-kanban-card]:is(.is-selected, [aria-current="true"], [aria-selected="true"]) {
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--plugin-tint, var(--focus)) 70%, transparent), 0 6px 16px -6px rgba(19, 21, 32, .14);
  }

  /* ─── Goal work area ───────────────────────────────────────────────────── */
  ${WORKBENCH} .goal-node-toolbar .goal-node-back { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-swift), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .goal-node-toolbar .goal-node-back:hover { transform: translateX(-2px); }
  ${WORKBENCH} .plugin-stage-back svg { transition: transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .plugin-stage-back:hover svg { transform: rotate(180deg) translateX(2px); }
  ${WORKBENCH} .goal-details-aside { background: color-mix(in srgb, var(--desk) 40%, var(--paper)); }
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
  ${WORKBENCH} .immersive-home .home-hero { position: relative; max-width: 46rem; padding: 28px 28px 20px; }
  ${WORKBENCH} .immersive-home .home-dayview { position: relative; }
  ${WORKBENCH} .immersive-home .home-dayview::before {
    content: ""; position: absolute; inset: 0 0 auto; height: 220px; pointer-events: none;
    background:
      radial-gradient(60% 120% at 12% 0%, color-mix(in srgb, var(--hue-indigo-fill, #5e6ad2) 9%, transparent), transparent 70%),
      radial-gradient(40% 90% at 46% 0%, color-mix(in srgb, var(--hue-cyan-fill, #4db7c9) 6%, transparent), transparent 70%);
  }
  ${WORKBENCH} .immersive-home .home-hero > *, ${WORKBENCH} .immersive-home .home-tl { position: relative; }
  ${WORKBENCH} .immersive-home .craft-greeting {
    display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--muted); font-size: 12px;
  }
  ${WORKBENCH} .immersive-home .craft-greeting::before {
    content: ""; width: 7px; height: 7px; border-radius: 50%;
    background: var(--craft-daylight, var(--hue-yellow-fill));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--craft-daylight, var(--hue-yellow-fill)) 22%, transparent);
  }
  ${WORKBENCH} .immersive-home .home-hero__date time { font-size: 36px; letter-spacing: -.045em; }
  ${WORKBENCH} .immersive-home .home-hero__stats b { color: var(--ink); }
  ${WORKBENCH} .immersive-home .home-tl { border-top-color: var(--line); padding: 0 16px 16px; }
  ${WORKBENCH} .immersive-home :is(.home-tl__head, .home-tl__rows) { max-width: calc(46rem - 32px); }
  ${WORKBENCH} .immersive-home .home-erow:active { background: var(--nav-press); }
  ${WORKBENCH} .immersive-home .home-erow__dot { transition: transform var(--dur-move) var(--ease-spring), box-shadow var(--dur-move) var(--ease-swift); }
  ${WORKBENCH} .immersive-home .home-erow:hover .home-erow__dot { transform: scale(1.3); }
  ${WORKBENCH} .immersive-home .home-erow.is-on .home-erow__dot { transform: scale(1.35); box-shadow: inset 0 0 0 5px var(--node), 0 0 0 4px color-mix(in srgb, var(--node) 18%, transparent); }
  ${WORKBENCH} .immersive-home .home-tl__rows > * { animation: craft-rise 380ms var(--ease-quint) both; }
  ${[...Array(12).keys()].map((index) => `${WORKBENCH} .immersive-home .home-tl__rows > :nth-child(${index + 1}) { animation-delay: ${40 + index * 28}ms; }`).join("\n  ")}
  /* The detail column is an inspector along the sheet's right edge, not a card floating in it. */
  ${WORKBENCH} .immersive-home[data-event="on"] .home-eventcol { animation: craft-sheet-in 280ms var(--ease-quint); }
  ${WORKBENCH} .immersive-home .home-detail { border-radius: 0; box-shadow: none; background: transparent; }
  ${WORKBENCH} .immersive-home .home-detail__head { padding: 12px 10px 8px 18px; }
  ${WORKBENCH} .immersive-home .home-detail__act { padding: 10px 12px; background: var(--paper); }
  ${WORKBENCH} .immersive-home .home-day { transition: background-color var(--dur-hover) var(--ease-swift), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .immersive-home .home-day:active { transform: scale(.97); }
  ${WORKBENCH} .immersive-home .home-day.is-on { box-shadow: var(--lift-1); }
  ${WORKBENCH} .immersive-home .home-shortcut-add .home-shortcut-icon { transition: transform var(--dur-move) var(--ease-spring), border-color var(--dur-hover) var(--ease-swift), background-color var(--dur-hover) var(--ease-swift); }
  ${WORKBENCH} .immersive-home .home-shortcut-add:hover .home-shortcut-icon { transform: rotate(90deg); }
  ${WORKBENCH} .immersive-home .home-shortcut:not(.home-shortcut-add) .home-shortcut-icon { transition: transform var(--dur-move) var(--ease-spring), box-shadow var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .immersive-home .home-shortcut:not(.home-shortcut-add):hover .home-shortcut-icon { transform: translateY(-2px); box-shadow: var(--lift-2); }

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
    border-color: transparent; box-shadow: var(--lift-1); border-radius: var(--r-card);
    transition: box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint);
  }
  ${WORKBENCH} .plugin-market-body .mw-card:hover { box-shadow: var(--lift-2); transform: translateY(-1px); }
  ${WORKBENCH} .plugin-market-icon { border-radius: 10px; background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 10%, var(--paper)); color: var(--plugin-tint, var(--ink-soft)); transition: transform var(--dur-move) var(--ease-spring); }
  ${WORKBENCH} .plugin-market-body .mw-card:hover .plugin-market-icon { transform: scale(1.06) rotate(-4deg); }
  ${WORKBENCH} .plugin-market-installed-row > * { transition: transform var(--dur-move) var(--ease-spring), box-shadow var(--dur-move) var(--ease-quint); }
  ${WORKBENCH} .plugin-market-installed-row > :hover { transform: translateY(-2px); box-shadow: var(--lift-2); }
  ${WORKBENCH} .plugin-market-list > * { animation: craft-rise 360ms var(--ease-quint) both; }
  ${[...Array(10).keys()].map((index) => `${WORKBENCH} .plugin-market-list > :nth-child(${index + 1}) { animation-delay: ${index * 22}ms; }`).join("\n  ")}

  /* ─── Settings documents ───────────────────────────────────────────────── */
  ${PAGES} :is(.settings-card, .settings-group, .project-settings-card) { border-radius: var(--r-card); }

  /* ─── Project index: the arrival page ──────────────────────────────────── */
  body.project-index-page { background: var(--desk); }
  body.project-index-page .project-index { position: relative; }
  body.project-index-page .project-index::before {
    content: ""; position: fixed; inset: 0 0 auto; height: 360px; pointer-events: none; z-index: 0;
    background:
      radial-gradient(50% 100% at 20% 0%, color-mix(in srgb, var(--hue-indigo-fill, #5e6ad2) 10%, transparent), transparent 70%),
      radial-gradient(40% 80% at 70% 0%, color-mix(in srgb, var(--hue-cyan-fill, #4db7c9) 7%, transparent), transparent 70%);
  }
  body.project-index-page .project-index-panel { position: relative; z-index: 1; }
  body.project-index-page .craft-greeting { margin: 0 0 10px; color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  body.project-index-page .craft-greeting::before {
    content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--craft-daylight, var(--hue-yellow-fill));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--craft-daylight, var(--hue-yellow-fill)) 22%, transparent);
  }
  body.project-index-page .project-index-heading h1 { letter-spacing: -.03em; }
  body.project-index-page .project-card {
    position: relative; border-color: transparent; box-shadow: var(--lift-1); border-radius: 14px; overflow: hidden;
    transition: box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint);
    animation: craft-rise 460ms var(--ease-quint) both;
  }
  ${[...Array(9).keys()].map((index) => `body.project-index-page .project-card-grid > :nth-child(${index + 1}) { animation-delay: ${80 + index * 45}ms; }`).join("\n  ")}
  body.project-index-page .project-card::before {
    content: ""; position: absolute; inset: 0 0 auto; height: 72px; pointer-events: none; opacity: .9;
    background: linear-gradient(180deg, color-mix(in srgb, var(--mono, var(--hue-indigo-fill)) 11%, transparent), transparent);
    transition: opacity var(--dur-move) var(--ease-swift);
  }
  ${["indigo", "blue", "cyan", "mint", "green", "orange", "pink", "purple", "brown", "slate"].map((hue) => `body.project-index-page .project-card:has(.project-monogram[data-hue="${hue}"]) { --mono: var(--hue-${hue}-fill); }`).join("\n  ")}
  body.project-index-page .project-card:hover { box-shadow: var(--lift-2); transform: translateY(-2px); background: var(--paper); border-color: transparent; }
  body.project-index-page .project-card:hover::before { opacity: 1; }
  body.project-index-page .project-card > * { position: relative; }
  body.project-index-page .project-card .project-monogram { width: 32px; height: 32px; border-radius: 10px; font-size: 15px; }
  body.project-index-page .project-card:has(.project-monogram) .project-card-icon { display: none; }
  body.project-index-page .project-card footer svg { transition: transform var(--dur-move) var(--ease-spring); }
  body.project-index-page .project-card:hover footer svg { transform: translateX(3px); }
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
  html[data-craft-still] :is(.immersive-home[data-event="on"] .home-eventcol, .tab-pane-body > [data-work-surface], .tab-workspace-exclusive > *, .home-tl__rows > *, .plugin-market-list > *, .project-card,
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
  const railShortcuts = () => [...document.querySelectorAll(".plugin-rail-items [data-plugin-id]")]
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

  /* Rail tooltips: one element in the page, placed beside the control, so no scroll column clips it. */
  const TIP_TARGETS = ".plugin-stack :is(.immersive-plugin-link, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .personal-account, .navigator-directory-toggle, .immersive-show-directory), [data-craft-tip]";
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
    const x = beside ? box.right + 10 : box.left + box.width / 2 - tip.offsetWidth / 2;
    const y = beside ? box.top + box.height / 2 - tip.offsetHeight / 2 : box.bottom + 8;
    tip.style.setProperty("--tip-x", Math.round(Math.max(6, Math.min(innerWidth - tip.offsetWidth - 6, x))) + "px");
    tip.style.setProperty("--tip-y", Math.round(Math.max(6, y)) + "px");
    tip.style.transformOrigin = beside ? "left center" : "top center";
  };
  const showTip = (node) => {
    const name = node.querySelector(":scope > span:not(.personal-account-avatar), .personal-account-copy");
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
