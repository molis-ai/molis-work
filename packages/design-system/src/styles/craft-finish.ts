import { MW_PLUGINS } from "../palette.js";

/** Soft Workbench finish: the last layer of every Molis Work page (module name kept from the craft pass).
 *
 * One spatial idea runs through it. The desk is pearl grey; the work is one continuous white surface
 * lying on it with soft 14px corners and a shadow you feel more than see. Plugin directories are
 * columns inside that surface, not a second chrome. Global navigation and the unified conversation
 * live in the resident bar under the surface; there is no global sidebar.
 *
 * Depth is tonal first. Ordinary content separates by spacing, weight and the occasional hairline;
 * only raised things — the composer, the current Dock item, menus, dialogs, sheets, toasts — cast a
 * diffuse shadow, and a floating layer never also draws a heavy outline. Graphite is the primary
 * action and the selected choice; copper marks focus, links and a selection's small detail.
 *
 * Movement answers the operation: a 130ms press that gives and springs back, 250ms state changes,
 * 420ms arrivals that rise a few pixels, menus that grow from their control, sheets from their edge.
 * `prefers-reduced-motion` and automation remove every movement here.
 *
 * Structure, density and domain ownership stay with the layers before this one; this layer owns
 * tone, depth, corners, the resident bar's geometry and motion.
 */

const WORKBENCH = "body.immersive-workbench";
/** The shell outside a pane. The component board's bar stage takes the same rules so its specimen is the real bar. */
const SHELL = ":is(body.immersive-workbench:not([data-pane-embedded]), .mw-catalog-bar-stage)";
/** The resident Assistant lives in the workbench bar and, for personal work without a project, on the project list. */
const ASSIST = ":is(body.immersive-workbench:not([data-pane-embedded]), body.project-index-page)";
const RAIL_LINK = ":is(.plugin-rail, .assistant-island, .workspace-chrome) :is(.immersive-plugin-link, .navigator-project-search, .navigator-project-settings, .navigator-directory-toggle, .immersive-show-directory, .personal-account)";
const PAGES = "body:is(.immersive-workbench, .settings-page, .project-index-page, .project-preferences-page)";
/** A plugin's list page (not Feed or Coding, which lay out their own columns; not Jelly's calendar). */
const STAGE_SHELL = "body.immersive-workbench .plugin-stage-shell:not([data-feed-stage-shell], .mw-layout-primitives, [data-work-surface=\"jelly\"])";
const STAGE_LIST = `${STAGE_SHELL}[data-expanded="false"] > .plugin-stage-list`;
const STAGE_OPEN = `${STAGE_SHELL}[data-expanded="true"]`;
const SESSIONS_LIST = "body.immersive-workbench .session-stage-shell:not([data-expanded=\"true\"])";

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
    --r-tag: 6px; --r-row: 10px; --r-control: 8px; --r-card: 12px; --r-sheet: 14px; --r-dialog: 16px; --r-composer: 15px;
    --sheet-inset: 14px;
    --desk: var(--page);
    --ease-quint: cubic-bezier(.22, 1, .36, 1);
    --ease-spring: cubic-bezier(.2, 1.35, .4, 1);
    --ease-swift: var(--ease-quint);
    --dur-press: 130ms; --dur-hover: 130ms; --dur-move: 250ms; --dur-arrive: 420ms; --dur-moment: 640ms;
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

  /* ─── Desk and sheet ───────────────────────────────────────────────────── */
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
    ${SHELL} .tab-workspace-panes:has(> .tab-pane + .tab-pane) > .tab-pane.is-focused {
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

  /* Where am I: the plugin whose page this pane shows, ahead of the item tabs. */
  ${PAGES} .tab-view-chip {
    flex: none; display: inline-flex; align-items: center; gap: 8px; height: 26px; margin: 0 4px 0 0; padding: 0 12px 0 8px;
    border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
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
  ${viewChipTints()}

  /* ─── Plugin rail: this project — where the work lives and its plugins; the account at the foot ── */
  :root ${ASSIST} :is(.assistant-island-card, .workspace-chrome .navigator-project-primary, .plugin-rail-items, .plugin-rail .personal-sidebar-footer) {
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
  ${SHELL} :is(.plugin-rail-items, .assistant-island-card)[data-seg-thumb]::before { border-radius: 8px; background: var(--nav-active); }
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
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item {
      width: 100%; height: 30px; min-height: 30px; justify-content: flex-start; gap: 12px; padding: 0 12px; border-radius: 8px;
    }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item svg { width: 16px; height: 16px; }
    ${SHELL}:not([data-navigation-labels="false"]) :is(.plugin-rail, .assistant-island) .plugin-rail-item > span { font-size: 13px; color: var(--ink-soft); }
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

  /* ─── Bottom bar: the Dock, the resident Assistant, the project ────────────── */
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
  ${SHELL} :is(.dock-pin, .bar-resident, .bar-chat, .account-global-trigger) {
    position: relative; display: inline-grid; place-items: center; flex: none; width: var(--dock-btn); height: var(--dock-btn); padding: 0; border: 0; border-radius: 11px;
    background: transparent; box-shadow: none; color: var(--ink-soft); cursor: pointer; list-style: none;
    transition: transform var(--dur-move) var(--ease-spring), background-color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${SHELL} :is(.dock-pin, .bar-resident, .bar-chat, .account-global-trigger) svg { width: 20px; height: 20px; stroke-width: 1.6; }
  ${SHELL} :is(.dock-pin, .bar-resident, .bar-chat, .account-global-trigger):hover { background: var(--nav-hover); color: var(--ink); transform: translateY(-1px); }
  ${SHELL} :is(.dock-pin[aria-current], .bar-resident[aria-current], .bar-chat[aria-expanded="true"], .account-global-menu[open] > .account-global-trigger) {
    background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); transform: none;
  }
  ${SHELL} :is(.dock-pin[aria-current], .bar-resident[aria-current])::after {
    content: ""; position: absolute; left: 50%; bottom: 3px; width: 3px; height: 3px; margin-left: 0px; border-radius: 50%; background: var(--accent); pointer-events: none;
  }
  ${SHELL} :is(.dock-pin, .bar-resident, .bar-chat, .account-global-trigger):focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${SHELL} .workbench-bar :is(.dock-pin, .bar-resident, .bar-chat, .plugin-picker-trigger, .account-global-trigger, .navigator-project-selector):active { transform: scale(.94); transition-duration: var(--dur-press); }

  /* Shelf and 灵光: the person's own, beside the project at the right. */
  ${SHELL} .bar-residents { display: flex; align-items: center; gap: 4px; min-width: 0; }

  /* The Dock menu: which plugins stay, what is yours everywhere, settings and the account. */
  ${SHELL} .bar-start .personal-sidebar-footer { display: contents; }
  ${SHELL} .account-global-menu { position: relative; flex: none; }
  ${SHELL} .account-global-trigger::-webkit-details-marker { display: none; }
  ${SHELL} .account-global-menu:not([open]):has([data-market-update-count]:not([hidden])) > .account-global-trigger::after {
    content: ""; position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
  }
  ${SHELL} .account-global-popover {
    position: absolute; z-index: 60; left: 0; bottom: calc(100% + 10px); display: grid; gap: 1px; width: 264px; max-height: min(70dvh, 620px); overflow: auto; padding: 8px;
    border-radius: 14px; background: var(--paper); box-shadow: var(--lift-3);
  }
  ${SHELL} .account-global-heading { margin: 8px 8px 4px; color: var(--muted); font-size: 11px; font-weight: 500; line-height: 18px; }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice) {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; height: 34px; min-height: 34px;
    margin: 0; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; box-shadow: none;
    color: var(--ink); font: inherit; font-size: 13px; font-weight: 400; text-align: left; text-decoration: none; cursor: pointer;
  }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice) svg { flex: none; width: 16px; height: 16px; color: var(--ink-soft); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) :is(.account-global-item, .dock-choice):hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${SHELL} :is(.account-global-popover, .navigator-personal) .account-global-item:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  ${SHELL} .account-global-popover .dock-choice > span { flex: 1; min-width: 0; text-align: left; }
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"] { color: var(--ink); }
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"] svg { color: var(--ink); }
  /* A chosen plugin shows the same graphite check as every other choice. */
  ${SHELL} .account-global-popover .dock-choice[aria-pressed="true"]::after {
    content: ""; flex: none; width: 9px; height: 5px; margin: -4px 4px 0 0; border-left: 1.6px solid var(--ink); border-bottom: 1.6px solid var(--ink); transform: rotate(-45deg);
  }
  ${SHELL} .account-global-popover .dock-choice:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  ${SHELL} .account-global-popover .dock-choices { display: grid; gap: 1px; }
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
    background: var(--paper); box-shadow: var(--composer-shadow);
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
    html ${SHELL} .workbench-bar .plugin-picker-popover { width: 800px; }
    html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items p[data-rail-zone] { grid-column: 1 / -1; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[data-rail-zone] {
    display: grid !important; grid-template-columns: 16px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 0; align-items: center; align-content: center;
    width: 100%; height: auto; min-height: 44px; padding: 4px 12px; border-radius: 8px; text-align: left;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item > span { position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; line-height: 18px; color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item .plugin-rail-hint { display: block; grid-column: 2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; line-height: 16px; color: var(--muted); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item:not(:has(.plugin-rail-hint)) { grid-template-rows: auto; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-item svg { grid-row: 1 / span 2; width: 16px; height: 16px; color: var(--ink-soft); }
  html ${SHELL} .workbench-bar .plugin-picker-popover :is(.plugin-rail-group, .plugin-rail-subgroup) {
    width: auto; height: auto; margin: 8px 0 4px; padding: 0 12px; background: none; overflow: visible; color: var(--muted); font-size: 11px; font-weight: 500; line-height: 18px;
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items[data-seg-thumb]::before { display: none; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] > span { color: var(--ink); font-weight: 500; }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item[aria-current] svg { color: var(--ink); }
  html ${SHELL} .workbench-bar .plugin-picker-popover .plugin-rail-items .plugin-rail-item:not([aria-current]):hover { background: var(--nav-hover); }
  /* The switcher at the bar's left: where you are, and every entry; the Dock's own settings at the foot of its list. */
  ${SHELL} .bar-start .plugin-picker { flex: none; max-width: 60%; }
  ${SHELL} .plugin-picker-all { display: none; }
  ${SHELL} .plugin-picker-all svg { width: 20px; height: 20px; stroke-width: 1.6; }
  ${SHELL} .bar-start .plugin-picker-trigger { height: var(--dock-btn, 38px); position: relative; }
  ${SHELL} .plugin-picker:has([data-market-update-count]:not([hidden])) > .plugin-picker-trigger::after {
    content: ""; position: absolute; top: 7px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
  }
  html ${SHELL} .workbench-bar .plugin-picker-popover .dock-settings { position: static; z-index: auto; display: grid; width: auto; max-height: none; overflow: visible; margin: 8px -8px -8px;
    padding: 6px 8px 8px; border-radius: 0; background: transparent; box-shadow: inset 0 1px 0 var(--line); animation: none; }
  /* Search heads the list: finding a place is part of going there (⌘K opens it from anywhere). */
  html ${SHELL} .workbench-bar .plugin-picker-search { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; margin: 0 0 6px; padding: 0 10px; border: 0; border-radius: 9px;
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
    position: absolute; z-index: 50; left: -40px; right: calc(-1 * min(40px, var(--assistant-room, 40px))); bottom: calc(100% + 8px); display: flex; flex-direction: column; overflow: hidden;
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
  ${ASSIST} .assistant-tabs { position: relative; flex: 0 1 auto; min-width: 0; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  ${ASSIST} .assistant-tabs::-webkit-scrollbar { display: none; }
  ${ASSIST} .assistant-tab { position: relative; flex: 0 1 184px; width: 184px; min-width: 96px; display: flex; align-items: center; height: 34px; border-radius: 9px 9px 0 0; color: var(--muted); }
  ${ASSIST} .assistant-tab:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${ASSIST} .assistant-tab[data-current] { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line); clip-path: inset(-1px -1px 0 -1px); }
  ${ASSIST} .assistant-tab-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 4px 0 10px; border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-tab-main:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-tab[data-current] .assistant-tab-main { font-weight: 500; }
  ${ASSIST} .assistant-tab-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The marks, shared by tabs and the list of works: waiting on you, running, news not yet seen, did not finish. */
  ${ASSIST} .assistant-tab-mark { flex: none; display: none; width: 7px; height: 7px; border-radius: 50%; }
  ${ASSIST} [data-mark] .assistant-tab-mark { display: inline-block; }
  ${ASSIST} [data-mark="waiting"] .assistant-tab-mark { background: var(--tone-attention, var(--amber, #c27c0e)); }
  ${ASSIST} [data-mark="unread"] .assistant-tab-mark { background: var(--accent); }
  ${ASSIST} [data-mark="failed"] .assistant-tab-mark { background: var(--danger); }
  ${ASSIST} [data-mark="running"] .assistant-tab-mark { width: 9px; height: 9px; box-sizing: border-box; background: none; border: 1.5px solid var(--hue-green-fill); border-right-color: transparent; animation: mw-spin 640ms var(--ease-quint) infinite; }
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
  /* 概况: the state, what it is doing now, where it belongs, who carries it, and what can be done to it now. */
  ${ASSIST} .assistant-summary { display: flex; flex-direction: column; gap: 2px; }
  ${ASSIST} .assistant-summary-state { margin: 0; }
  ${ASSIST} .assistant-summary-state:has(.assistant-state:empty) { display: none; }
  ${ASSIST} .assistant-summary-title { margin: 0; color: var(--ink); font-size: 15px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  ${ASSIST} .assistant-summary-now { margin: 2px 0 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-summary-now[hidden] { display: none; }
  ${ASSIST} .assistant-summary-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 6px 10px; margin: 10px 0 0; }
  ${ASSIST} .assistant-summary-meta:empty { display: none; }
  ${ASSIST} .assistant-summary-meta dt { color: var(--muted); }
  ${ASSIST} .assistant-summary-meta dd { margin: 0; min-width: 0; color: var(--ink); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-summary-top { display: flex; align-items: center; gap: 8px; min-height: 22px; margin-bottom: 2px; }
  ${ASSIST} .assistant-summary-top:not(:has(.assistant-state:not(:empty), .assistant-control:not([hidden]))) { display: none; }
  ${ASSIST} .assistant-summary-controls { display: flex; gap: 2px; margin-left: auto; }
  ${ASSIST} .assistant-control { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-control[hidden] { display: none; }
  ${ASSIST} .assistant-control:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-control--stop:hover { color: var(--danger); }
  ${ASSIST} .assistant-control[data-assistant-control="resume"] { background: var(--ink); color: var(--paper); }
  ${ASSIST} .assistant-control:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  /* The work's state as a small pill: a dot that says waiting, running, done or not done. */
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px 1px 7px; border-radius: 999px; background: var(--wash); color: var(--ink-soft); font-size: 11px; line-height: 18px; }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state::before { content: ""; flex: none; width: 6px; height: 6px; margin: 0; border-radius: 50%; background: var(--faint); vertical-align: 0; }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state:is([data-state="waiting-input"], [data-state="waiting-review"], [data-state="needs-check"]) { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 13%, transparent); color: var(--ink); }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state:is([data-state="waiting-input"], [data-state="waiting-review"], [data-state="needs-check"])::before { background: var(--tone-attention, #c27c0e); }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state[data-state="running"]::before { width: 8px; height: 8px; box-sizing: border-box; background: none; border: 1.5px solid var(--hue-green-fill); border-right-color: transparent; animation: mw-spin 640ms var(--ease-quint) infinite; }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state[data-state="completed"]::before { background: var(--hue-green-fill); }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state:is([data-state="failed"], [data-state="stopped"])::before { background: var(--danger); }
  ${ASSIST} .assistant-next { align-self: flex-start; margin-top: 8px; }
  ${ASSIST} .assistant-next[hidden] { display: none; }
  /* One row of equal parts, however many choices: five Coding modes fit the side pane without wrapping. */
  ${ASSIST} .assistant-segmented { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--wash); }
  ${ASSIST} .assistant-segment { min-width: 0; height: 24px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  ${ASSIST} .assistant-segment:hover:not(:disabled) { color: var(--ink); }
  ${ASSIST} .assistant-segment[aria-pressed="true"] { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  ${ASSIST} .assistant-segment:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-summary-meta .mw-select-picker { width: 100%; min-width: 0; }
  ${ASSIST} .assistant-summary-meta :is(select.mw-select, .mw-select-picker__trigger) { width: 100%; min-width: 0; height: 28px; min-height: 28px; font-size: 12px; }
  /* 路径 · 材料 · 成果: each a heading, small groups, and one line per thing with what can be done to it. */
  ${ASSIST} .assistant-block[hidden] { display: none; }
  ${ASSIST} .assistant-block-head { display: flex; align-items: center; gap: 6px; width: 100%; margin: 0; padding: 12px 0 4px; border: 0; border-radius: 0; background: transparent; box-shadow: inset 0 1px 0 var(--line); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-block-head:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${ASSIST} .assistant-block-chevron { flex: none; display: inline-grid; place-items: center; width: 12px; height: 12px; color: var(--muted); }
  ${ASSIST} .assistant-block-chevron::before { content: "›"; font-size: 13px; line-height: 1; transform: rotate(90deg); transition: transform var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-block-head[aria-expanded="false"] .assistant-block-chevron::before { transform: none; }
  ${ASSIST} .assistant-block-head:hover .assistant-block-chevron { color: var(--ink); }
  /* Folding never animates height: a folded block is gone at once, and opening one lets its rows arrive. */
  ${ASSIST} .assistant-block[data-folded] .assistant-block-body { display: none; }
  ${ASSIST} .assistant-block[data-opening] .assistant-block-body { animation: craft-rise var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-block-title { color: var(--ink); font-size: 12px; font-weight: 600; }
  ${ASSIST} .assistant-block-sub { margin: 8px 0 2px; color: var(--faint); font-size: 11px; }
  /* The name opens what it names, and its target is the whole row; the row's own actions sit above it. */
  ${ASSIST} .assistant-side-action { flex: none; height: 22px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--accent, var(--ink)); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
  ${ASSIST} .assistant-side-action:hover:not(:disabled) { background: var(--nav-active); }
  ${ASSIST} .assistant-side-action { transition: background-color var(--dur-hover) var(--ease-quint), opacity var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-side-action[aria-busy="true"] { color: var(--muted); cursor: progress; }
  /* Stop, take back and cancel wait for the pointer or keyboard to reach the row; touch screens always show them. */
  ${ASSIST} .assistant-side-action.is-quiet { opacity: 0; }
  ${ASSIST} :is(.assistant-item, .assistant-subtask):is(:hover, :focus-within) .assistant-side-action.is-quiet { opacity: 1; }
  @media (hover: none) { ${ASSIST} .assistant-side-action.is-quiet { opacity: 1; } }
  ${ASSIST} .assistant-side-action:disabled { color: var(--muted); cursor: default; }
  ${ASSIST} .assistant-side-action:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-block--usage[hidden] { display: none; }
  ${ASSIST} .assistant-usage > summary { display: flex; align-items: center; gap: 6px; padding-top: 12px; box-shadow: inset 0 1px 0 var(--line); color: var(--muted); list-style: none; cursor: pointer; }
  ${ASSIST} .assistant-usage > summary::-webkit-details-marker { display: none; }
  ${ASSIST} .assistant-usage > summary::before { content: "›"; display: inline-grid; place-items: center; width: 12px; font-size: 13px; line-height: 1; transition: transform var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-usage[open] > summary::before { transform: rotate(90deg); }
  ${ASSIST} .assistant-usage > summary:hover { color: var(--ink); }
  ${ASSIST} .assistant-usage > summary:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${ASSIST} .assistant-material-add { padding: 1px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--accent, var(--ink)); font: inherit; font-size: 12px; cursor: pointer; }
  ${ASSIST} .assistant-material-add:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-material-add:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-material--optional .assistant-material-label { color: var(--muted); }
  ${ASSIST} .assistant-usage-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0 2px; }
  ${ASSIST} .assistant-usage-input { width: 9em; min-width: 0; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface, transparent); color: var(--ink); font: inherit; font-size: 12px; }
  ${ASSIST} .assistant-round-executor { margin: 0 0 4px; font-size: 11px; color: var(--muted); }
  /* With the panel open, its tab says where the next message goes; with the side pane shown, it lists what goes with it and who carries it. */
  ${ASSIST} [data-assistant-island]:has(> .assistant-panel:not([hidden])) .assistant-target { display: none; }
  ${ASSIST} [data-assistant-island][data-side-shown] :is(.assistant-materials-button, [data-assistant-executor], [data-assistant-character], [data-assistant-mode]) { display: none; }
  /* The side pane speaks in shapes, not only lines: the overview is a card toned by the state; what waits on you are
     cards with their buttons; the path is a line with markers; materials drop into a zone and sit as tiles; results are
     cards you open or take back. Colour only says state: amber waits on you, green is done, copper is a suggestion. */
  ${ASSIST} .assistant-summary { padding: 12px; border-radius: 12px; background: var(--wash); transition: background-color var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-summary[data-tone="waiting"] { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 11%, var(--paper)); }
  ${ASSIST} .assistant-summary[data-tone="running"] { background: color-mix(in srgb, var(--tone-done, #3a8f5c) 8%, var(--paper)); }
  ${ASSIST} .assistant-summary[data-tone="failed"] { background: color-mix(in srgb, var(--tone-blocked, #c53030) 8%, var(--paper)); }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state { background: var(--paper); }
  ${ASSIST} .assistant-summary .assistant-next { align-self: stretch; justify-content: center; margin-top: 10px; }
  ${ASSIST} .assistant-summary .assistant-summary-meta { margin-top: 12px; padding-top: 10px; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent); }
  ${ASSIST} .assistant-glyph-icon { display: inline-grid; place-items: center; flex: none; }
  ${ASSIST} .assistant-glyph-icon svg { width: 15px; height: 15px; }
  ${ASSIST} .assistant-glyph { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--wash); color: var(--ink-soft); }
  ${ASSIST} .assistant-glyph.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 15%, transparent); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-glyph.is-done { background: color-mix(in srgb, var(--tone-done, #3a8f5c) 14%, transparent); color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-glyph.is-suggest { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  ${ASSIST} .assistant-glyph.is-blocked { background: color-mix(in srgb, var(--tone-blocked, #c53030) 12%, transparent); color: var(--tone-blocked, #c53030); }
  ${ASSIST} .assistant-spinner { display: inline-block; width: 13px; height: 13px; box-sizing: border-box; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: mw-spin 640ms var(--ease-quint) infinite; }
  /* Block headings carry a glyph and a badge; the one that waits on you does not fold. */
  ${ASSIST} .assistant-block-head .assistant-glyph-icon { color: var(--muted); }
  ${ASSIST} .assistant-block-head.is-fixed { cursor: default; }
  ${ASSIST} .assistant-block-head.is-fixed .assistant-glyph-icon { color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-block-badge { margin-left: auto; padding: 0 8px; border-radius: 999px; background: var(--wash); color: var(--muted); font-size: 11px; font-weight: 400; line-height: 18px; white-space: nowrap; }
  ${ASSIST} .assistant-block-badge.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 15%, transparent); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-block--attention .assistant-block-head { box-shadow: none; padding-top: 2px; }
  ${ASSIST} .assistant-block-body { padding-top: 6px; }
  ${ASSIST} .assistant-group-list { display: flex; flex-direction: column; gap: 10px; }
  ${ASSIST} .assistant-group > .assistant-block-sub { margin: 0 0 6px; }
  /* Cards: glyph, title and one line; the title opens it and the whole card is its target; actions sit above that. */
  ${ASSIST} .assistant-stack { display: flex; flex-direction: column; gap: 6px; }
  ${ASSIST} .assistant-item { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; background: var(--paper); box-shadow: 0 0 0 1px var(--line);
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-item.is-openable:hover { background: var(--nav-hover); box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-item.is-openable:active { background: var(--nav-active); }
  ${ASSIST} .assistant-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  ${ASSIST} .assistant-item-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 12px; font-weight: 500; line-height: 1.45; }
  ${ASSIST} button.assistant-item-title { padding: 0; border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 500; text-align: left; cursor: pointer; }
  ${ASSIST} button.assistant-item-title::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  ${ASSIST} button.assistant-item-title:focus-visible { outline: none; }
  ${ASSIST} :is(.assistant-item, .assistant-tile):has(> button.assistant-item-title:focus-visible, .assistant-item-text > button.assistant-item-title:focus-visible) { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-item-sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-item-sub.is-attention { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-item-sub.is-blocked { color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-item-actions { position: relative; z-index: 1; flex: none; display: flex; align-items: center; gap: 4px; }
  ${ASSIST} .assistant-item.is-done .assistant-item-title { color: var(--muted); font-weight: 400; text-decoration: line-through; }
  ${ASSIST} .assistant-item.is-done .assistant-glyph { opacity: .6; }
  /* A card that waits on you: its words wrap, its buttons sit under them, and its edge is amber. */
  ${ASSIST} .assistant-item--ask { flex-wrap: wrap; align-items: flex-start; box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 38%, var(--line)); }
  ${ASSIST} .assistant-item--ask:has(.assistant-glyph.is-suggest) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 32%, var(--line)); }
  ${ASSIST} .assistant-item--ask :is(.assistant-item-title, .assistant-item-sub) { white-space: normal; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-item--ask .assistant-item-actions { flex-basis: 100%; padding-left: 38px; }
  /* Buttons on cards: primary is graphite, secondary a quiet outline, both with the shared press. */
  ${ASSIST} .assistant-side-action { display: inline-flex; align-items: center; gap: 4px; }
  ${ASSIST} .assistant-side-action .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-side-action:is(.is-primary, .is-secondary) { height: 26px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
  ${ASSIST} .assistant-side-action.is-primary { background: var(--ink); color: var(--paper); }
  ${ASSIST} .assistant-side-action.is-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 86%, var(--paper)); }
  ${ASSIST} .assistant-side-action.is-secondary { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-side-action.is-secondary:hover:not(:disabled) { background: var(--nav-hover); }
  /* 路径: a vertical line; each step a marker on it — a glyph, or how many sub-tasks are done. */
  ${ASSIST} .assistant-timeline { position: relative; display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0 0 0 28px; list-style: none; }
  ${ASSIST} .assistant-timeline::before { content: ""; position: absolute; left: 10px; top: 12px; bottom: 12px; width: 1.5px; border-radius: 1px; background: var(--line-strong); }
  ${ASSIST} .assistant-step { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  ${ASSIST} .assistant-step-marker { position: absolute; left: -28px; top: -1px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--paper);
    box-shadow: 0 0 0 1.5px var(--line-strong); color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  ${ASSIST} .assistant-step-marker .assistant-glyph-icon svg { width: 12px; height: 12px; }
  ${ASSIST} .assistant-step-marker.is-attention { box-shadow: 0 0 0 1.5px var(--tone-attention, #c27c0e); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-step-marker.is-done { background: var(--tone-done, #3a8f5c); box-shadow: none; color: var(--paper); }
  ${ASSIST} .assistant-step-marker.is-later { box-shadow: none; outline: 1.5px dashed var(--line-strong); outline-offset: -1.5px; }
  ${ASSIST} .assistant-step-label { margin: 2px 0 0; color: var(--muted); font-size: 11px; line-height: 18px; }
  ${ASSIST} .assistant-progress { display: block; height: 4px; border-radius: 2px; background: var(--wash); overflow: hidden; }
  ${ASSIST} .assistant-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-subtask { position: relative; display: flex; align-items: center; gap: 8px; min-height: 28px; margin: 0 -6px; padding: 2px 6px; border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-subtask:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-subtask.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 9%, transparent); }
  ${ASSIST} .assistant-subtask-mark { flex: none; display: inline-grid; place-items: center; width: 16px; color: var(--muted); }
  ${ASSIST} .assistant-subtask-mark.is-done { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-subtask-mark.is-attention { color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-subtask-mark.is-blocked { color: var(--tone-blocked, #c53030); }
  ${ASSIST} .assistant-subtask-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-subtask-name::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  ${ASSIST} .assistant-subtask-name:focus-visible { outline: none; }
  ${ASSIST} .assistant-subtask:has(> .assistant-subtask-name:focus-visible) { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-subtask-state { flex: none; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-subtask.is-attention .assistant-subtask-state { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-subtask .assistant-side-action { position: relative; z-index: 1; }
  /* 步骤: a checklist on the path; the step in hand reads stronger, one set aside is struck through. */
  ${ASSIST} span.assistant-subtask-name { cursor: default; }
  ${ASSIST} .assistant-step-item:not(.is-attention):hover { background: transparent; }
  ${ASSIST} .assistant-step-item.is-current .assistant-subtask-name { font-weight: 500; }
  ${ASSIST} .assistant-step-item.is-abandoned .assistant-subtask-name { color: var(--muted); text-decoration: line-through; }
  ${ASSIST} .assistant-step-item .assistant-subtask-mark.is-done + .assistant-subtask-name { color: var(--ink-soft); }
  /* The memories an answer was given, folded under it like its steps. */
  ${ASSIST} .assistant-memory { display: flex; align-items: baseline; gap: 6px; }
  ${ASSIST} .assistant-memory-scope { flex: none; padding: 0 5px; border-radius: 5px; box-shadow: 0 0 0 1px var(--line); color: var(--muted); font-size: 11px; line-height: 17px; }
  ${ASSIST} .assistant-memory-omitted { margin: 6px 0 0 12px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-subtask:is(:hover, :focus-within) .assistant-side-action.is-quiet { opacity: 1; }
  /* 材料: the next Send's things in a zone files can be dropped on; what was used, as tiles two to a row. */
  ${ASSIST} .assistant-drop { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: 10px;
    transition: border-color var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-drop[data-dropping] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  ${ASSIST} .assistant-drop-label { margin: 0; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  ${ASSIST} .assistant-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 26px; padding: 2px 2px 2px 8px; border-radius: 8px; background: var(--wash); color: var(--ink); font-size: 12px; }
  ${ASSIST} .assistant-chip.is-optional { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
  ${ASSIST} .assistant-chip .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} button.assistant-chip-label { padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: start; cursor: pointer; }
  ${ASSIST} button.assistant-chip-label:hover { text-decoration: underline; text-underline-offset: 2px; }
  ${ASSIST} .assistant-drop-hint { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-drop-hint > span:not(.assistant-glyph-icon) { flex: 1; min-width: 0; }
  ${ASSIST} .assistant-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  ${ASSIST} .assistant-tile { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px; border-radius: 10px; box-shadow: 0 0 0 1px var(--line);
    transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-tile > :is(.assistant-item-title, .assistant-item-sub) { max-width: 100%; }
  ${ASSIST} .assistant-tile.is-openable:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-tile.is-attention { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 38%, var(--line)); }
  /* The conversation reads like a document: headings, lists (nested, checklists), tables, quotes, rules and links from
     Markdown, code with its language, length, colours and a copy button. Nothing a model wrote becomes markup. */
  ${ASSIST} .assistant-rich :is(h3, h4, h5) { margin: 14px 0 6px; color: var(--ink); line-height: 1.4; }
  ${ASSIST} .assistant-rich > :first-child { margin-top: 0; }
  ${ASSIST} .assistant-rich h3 { font-size: 15px; font-weight: 600; }
  ${ASSIST} .assistant-rich h4 { font-size: 13px; font-weight: 600; }
  ${ASSIST} .assistant-rich h5 { font-size: 13px; font-weight: 500; color: var(--ink-soft); }
  ${ASSIST} .assistant-rich :is(ul, ol) :is(ul, ol) { margin: 2px 0 2px; }
  ${ASSIST} .assistant-rich li + li { margin-top: 2px; }
  ${ASSIST} .assistant-rich li::marker { color: var(--muted); }
  ${ASSIST} .assistant-rich .assistant-task { position: relative; list-style: none; margin-left: -18px; padding-left: 20px; }
  ${ASSIST} .assistant-task-box { position: absolute; left: 0; top: 0.36em; width: 12px; height: 12px; border-radius: 3px; box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  ${ASSIST} .assistant-task.is-done { color: var(--muted); }
  ${ASSIST} .assistant-task.is-done .assistant-task-box { background: var(--tone-done, #3a8f5c); box-shadow: none; }
  ${ASSIST} .assistant-task.is-done .assistant-task-box::after { content: ""; position: absolute; left: 4px; top: 1.5px; width: 3px; height: 6px; border: solid var(--paper); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  ${ASSIST} .assistant-task > ul, ${ASSIST} .assistant-task > ol { color: var(--ink); }
  ${ASSIST} .assistant-rich blockquote { margin: 0 0 8px; padding: 6px 12px; border-radius: 8px; background: var(--wash); color: var(--ink-soft); }
  ${ASSIST} .assistant-rich blockquote > :last-child { margin-bottom: 0; }
  ${ASSIST} .assistant-rich hr { height: 1px; margin: 12px 0; border: 0; background: var(--line); }
  ${ASSIST} .assistant-rich s { color: var(--muted); }
  ${ASSIST} .assistant-link { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); text-underline-offset: 2px; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-link:hover { text-decoration-color: currentColor; }
  ${ASSIST} .assistant-inline-object { display: inline-flex; align-items: center; gap: 4px; margin: 0 1px; padding: 0 6px; border: 0; border-radius: 6px; background: var(--wash); color: var(--ink); font: inherit;
    line-height: 1.5; vertical-align: baseline; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-inline-object:hover { background: var(--nav-active); }
  ${ASSIST} .assistant-inline-object:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-inline-object svg { width: 13px; height: 13px; color: var(--muted); }
  ${ASSIST} .assistant-table { max-width: 100%; margin: 0 0 10px; overflow-x: auto; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  ${ASSIST} .assistant-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
  ${ASSIST} .assistant-table :is(th, td) { padding: 6px 10px; text-align: left; vertical-align: top; box-shadow: inset 0 -1px 0 var(--line); }
  ${ASSIST} .assistant-table th { background: var(--wash); color: var(--ink); font-weight: 600; white-space: nowrap; }
  ${ASSIST} .assistant-table tr:last-child td { box-shadow: none; }
  ${ASSIST} .assistant-code { position: relative; margin: 0 0 10px; overflow: hidden; border-radius: 10px; box-shadow: 0 0 0 1px var(--line); background: var(--wash); }
  ${ASSIST} .assistant-code-head { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 6px 0 12px; box-shadow: inset 0 -1px 0 var(--line); color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-code-lang { color: var(--ink-soft); font-weight: 500; }
  ${ASSIST} .assistant-code-lines { margin-right: auto; }
  ${ASSIST} .assistant-code-copy, ${ASSIST} .assistant-code-more { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} :is(.assistant-code-copy, .assistant-code-more):hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-code-copy[data-done] { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-rich .assistant-code pre, ${ASSIST} .assistant-code pre { margin: 0; padding: 10px 12px; border-radius: 0; background: transparent; overflow: auto; font-size: 12px; line-height: 1.55; }
  ${ASSIST} .assistant-code[data-folded] pre { max-height: 300px; overflow: hidden; }
  ${ASSIST} .assistant-code-more { display: block; width: 100%; height: 28px; border-radius: 0; box-shadow: inset 0 1px 0 var(--line); }
  /* Cards: one shape for every moment that asks something of you — a kicker saying what kind, a badge saying what act,
     the title, the body, the buttons, and a line on what happens when you press them. */
  ${ASSIST} .assistant-card { gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--paper); }
  ${ASSIST} .assistant-card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  ${ASSIST} .assistant-card-kicker { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; font-weight: 500; }
  ${ASSIST} .assistant-card-kicker .assistant-glyph-icon svg { width: 14px; height: 14px; }
  ${ASSIST} .assistant-card-kicker.is-attention { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-card-kicker.is-done { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-card-kicker.is-blocked { color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-card-badge { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 0 8px; border-radius: 999px; background: var(--wash); color: var(--ink-soft); font-size: 11px; line-height: 20px; white-space: nowrap; }
  ${ASSIST} .assistant-card-badge .assistant-glyph-icon svg { width: 12px; height: 12px; }
  ${ASSIST} .assistant-card-badge.is-blocked { background: color-mix(in srgb, var(--tone-blocked, #c53030) 12%, transparent); color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-card .assistant-card-title { color: var(--ink); font-size: 13px; font-weight: 600; line-height: 1.45; }
  ${ASSIST} .assistant-card-summary { color: var(--ink-soft); }
  ${ASSIST} .assistant-card-meta { color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-card-hint { margin: -2px 0 0; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-card:has(.assistant-card-kicker.is-attention) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 40%, var(--line)); }
  ${ASSIST} .assistant-card-status.is-done { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-card-status.is-blocked { color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-card-status.is-attention { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-fields dd.is-asked :is(input, select, textarea) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 45%, var(--line)); }
  ${ASSIST} .assistant-field-label { margin: 0 0 4px; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-field-code .assistant-code { margin: 0; }
  ${ASSIST} .assistant-choices { display: flex; flex-wrap: wrap; gap: 6px; }
  ${ASSIST} .assistant-choices.is-stacked { flex-direction: column; }
  ${ASSIST} .assistant-choice { min-height: 32px; padding: 6px 12px; border: 0; border-radius: 9px; background: var(--wash); color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    box-shadow: inset 0 0 0 1px var(--line); transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-choice:hover:not(:disabled) { background: var(--nav-active); box-shadow: inset 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-choice:active:not(:disabled) { transform: scale(.98); }
  ${ASSIST} .assistant-choice:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-choice-row { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 4px 8px; border-radius: 8px; cursor: pointer; }
  ${ASSIST} .assistant-choice-row:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-choice-row:has(input:checked) { background: var(--nav-active); }
  ${ASSIST} .assistant-problem .assistant-card-kicker { margin-bottom: -2px; }
  /* What a message carried: chips with their kind; an object opens where it lives. */
  ${ASSIST} .assistant-attachments { align-self: flex-end; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 85%; margin-top: -4px; }
  ${ASSIST} .assistant-attachment { display: inline-flex; align-items: center; gap: 5px; max-width: 220px; height: 24px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--wash); color: var(--ink-soft); font: inherit; font-size: 11px; }
  ${ASSIST} button.assistant-attachment { cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} button.assistant-attachment:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-attachment .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-attachment-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-attachment.is-draft { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 40%, transparent); }
  /* Each step of the process with the glyph of what it did; one still running turns. */
  ${ASSIST} .assistant-activity { display: flex; align-items: center; gap: 6px; }
  ${ASSIST} .assistant-activity .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-activity .assistant-spinner { width: 11px; height: 11px; }
  ${ASSIST} .assistant-activity[data-state="unknown"] { color: var(--tone-attention, #b7791f); }
  /* After the last round: what to do next, pointed at directly. */
  ${ASSIST} .assistant-next-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
  ${ASSIST} .assistant-next-label { color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-next-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 28px; padding: 0 10px; border: 0; border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 12px;
    box-shadow: 0 0 0 1px var(--line-strong); cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-next-chip > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-next-chip:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-next-chip:active { transform: scale(.97); }
  ${ASSIST} .assistant-next-chip:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-next-chip .assistant-glyph-icon svg { width: 14px; height: 14px; color: var(--muted); }
  /* Pressing gives a little everywhere in the panel, the same 130ms spring as the bar. */
  ${ASSIST} :is(.assistant-side-action, .assistant-segment, .assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-control, .assistant-start, .assistant-copy, .assistant-tab-close):active:not(:disabled) { transform: scale(.94); }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-tab-close, .assistant-tab-main) { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-tab-main:active { transform: scale(.98); }
  ${ASSIST} .assistant-tab { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-segment { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  /* Moving between works: the new work's content arrives; a drawer slides from its edge; the list grows from its button. */
  ${ASSIST} .assistant-panel[data-arrive] :is(.assistant-thread, .assistant-side) { animation: assistant-arrive var(--dur-move) var(--ease-quint); }
  @keyframes assistant-arrive { from { opacity: .4; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  ${ASSIST} .assistant-panel[data-layout="drawer"][data-side="open"] .assistant-side { animation: assistant-drawer var(--dur-move) var(--ease-quint); }
  @keyframes assistant-drawer { from { opacity: .6; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
  ${ASSIST} .assistant-works:not([hidden]) { transform-origin: top right; animation: craft-drop var(--dur-move) var(--ease-quint); }
  ${ASSIST} :is(.assistant-thread > .assistant-card, .assistant-thread > .assistant-problem, .assistant-round > .assistant-msg, .assistant-round > .assistant-card) { animation: craft-rise var(--dur-move) var(--ease-quint); }
  /* “Go to it” marks what it took you to for a moment. */
  ${ASSIST} [data-flash] { outline: 2px solid transparent; outline-offset: 3px; animation: assistant-flash var(--dur-moment) var(--ease-quint); }
  @keyframes assistant-flash { 0%, 45% { outline-color: var(--accent); } 100% { outline-color: transparent; } }
  ${ASSIST} .assistant-attention[data-bump] { animation: assistant-bump 420ms var(--ease-spring); }
  @keyframes assistant-bump { 0% { transform: scale(.82); } 60% { transform: scale(1.08); } 100% { transform: none; } }
  /* The pill at the foot of the conversation: what waits below, or news that arrived while reading above. */
  ${ASSIST} .assistant-main { position: relative; }
  ${ASSIST} .assistant-jump { position: absolute; z-index: 2; left: 50%; bottom: 12px; translate: -50% 0; height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--ink); color: var(--paper); box-shadow: var(--lift-2);
    font: inherit; font-size: 12px; cursor: pointer; animation: craft-rise-from-bar var(--dur-move) var(--ease-quint); transition: transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-jump[hidden] { display: none; }
  ${ASSIST} .assistant-jump:active { transform: scale(.95); }
  ${ASSIST} .assistant-jump:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  /* A new work starts from this page's starting points or goes back to a recent work. */
  ${ASSIST} .assistant-empty-list { display: flex; flex-direction: column; gap: 4px; max-width: 520px; margin-top: 14px; }
  ${ASSIST} .assistant-empty-list:empty { display: none; }
  ${ASSIST} .assistant-empty-title { margin: 10px 0 2px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-empty-title:first-child { margin-top: 0; }
  ${ASSIST} .assistant-start { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 6px 12px; border: 0; border-radius: 10px; background: var(--wash); color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  ${ASSIST} .assistant-start:hover { background: var(--nav-active); }
  ${ASSIST} .assistant-start:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-start-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-start-state { flex: none; color: var(--muted); font-size: 12px; }
  ${ASSIST} .assistant-empty-list > :nth-child(2) { animation-delay: 30ms; } ${ASSIST} .assistant-empty-list > :nth-child(3) { animation-delay: 60ms; }
  ${ASSIST} .assistant-empty-list > :nth-child(4) { animation-delay: 90ms; } ${ASSIST} .assistant-empty-list > :nth-child(n + 5) { animation-delay: 120ms; }
  ${ASSIST} .assistant-empty-hint { margin: 12px 0 0; color: var(--faint); font-size: 12px; }
  /* Copy an answer: it appears with the pointer over the round (always on touch) and says when it is done. */
  ${ASSIST} .assistant-copy { align-self: flex-start; margin: -6px 0 0 -6px; height: 22px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    opacity: 0; transition: opacity var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} :is(.assistant-round:hover .assistant-copy, .assistant-copy:focus-visible, .assistant-copy[data-done]) { opacity: 1; }
  ${ASSIST} .assistant-copy:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-copy[data-done] { color: var(--hue-green-fill); }
  @media (hover: none) { ${ASSIST} .assistant-copy { opacity: 1; } }
  /* A later round opens with when it began. */
  ${ASSIST} .assistant-round-time { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-round-time::before, ${ASSIST} .assistant-round-time::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  /* What a round carried reads as a line under the person's own message. */
  /* The conversation: the person's words on the right, the assistant's answer as text, what it did as quiet lines. */
  ${ASSIST} .assistant-thread { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 16px; font-size: 13px; line-height: 1.6; overscroll-behavior: contain; }
  ${ASSIST} .assistant-empty { color: var(--muted); }
  ${ASSIST} .assistant-empty strong { display: block; margin-bottom: 4px; color: var(--ink); font-weight: 500; }
  ${ASSIST} .assistant-empty p { margin: 0; }
  ${ASSIST} .assistant-empty[hidden] { display: none; }
  ${ASSIST} .assistant-round { display: flex; flex-direction: column; gap: 8px; }
  ${ASSIST} .assistant-msg { max-width: 100%; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-msg--user { align-self: flex-end; max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--nav-active); color: var(--ink); white-space: pre-wrap; }
  ${ASSIST} .assistant-msg--assistant { color: var(--ink); }
  ${ASSIST} .assistant-msg--note { font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-rich > :last-child { margin-bottom: 0; }
  ${ASSIST} .assistant-rich p { margin: 0 0 8px; }
  ${ASSIST} .assistant-rich :is(ul, ol) { margin: 0 0 8px; padding-left: 24px; }
  ${ASSIST} .assistant-rich .assistant-rich-heading { font-weight: 600; }
  ${ASSIST} .assistant-rich pre { margin: 0 0 8px; padding: 8px 12px; border-radius: 8px; background: var(--wash); overflow: auto; font-size: 12px; }
  ${ASSIST} .assistant-rich code { padding: 0 4px; border-radius: 4px; background: var(--wash); font-size: 12px; }
  ${ASSIST} .assistant-rich pre code { padding: 0; background: none; }
  ${ASSIST} :is(.assistant-activity, .assistant-round-status, .assistant-materials, .assistant-muted) { margin: 0; font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-activity[data-state="failed"] { color: var(--danger); }
  ${ASSIST} .assistant-round-status[hidden] { display: none; }
  ${ASSIST} .assistant-round-status[data-phase="failed"] { color: var(--danger); }
  /* What needs the person: a question to answer, or an exact effect to allow. */
  ${ASSIST} .assistant-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px; border-radius: 10px; box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-card-title { margin: 0; font-weight: 500; color: var(--ink); }
  ${ASSIST} .assistant-card--action { box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-card--action[data-status="done"] { box-shadow: 0 0 0 1px var(--line); }
  ${ASSIST} .assistant-card--action :is(input.mw-input, textarea.mw-input) { width: 100%; font: inherit; font-size: 12px; }
  ${ASSIST} .assistant-card-status { margin: 0; font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-card--action[data-status="failed"] .assistant-card-status { color: var(--danger); }
  ${ASSIST} .assistant-card--action[data-status="unknown"] .assistant-card-status { color: var(--ink); }
  ${ASSIST} .assistant-card p { margin: 0; }
  ${ASSIST} .assistant-card-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  ${ASSIST} .assistant-answer { display: flex; gap: 8px; }
  ${ASSIST} .assistant-answer .mw-input { flex: 1; min-width: 0; }
  ${ASSIST} .assistant-questionnaire { display: flex; flex-direction: column; gap: 8px; }
  ${ASSIST} .assistant-questionnaire fieldset { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; border: 0; }
  ${ASSIST} .assistant-questionnaire legend { padding: 0; margin-bottom: 4px; font-weight: 500; }
  ${ASSIST} .assistant-fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 12px; }
  ${ASSIST} .assistant-fields dt { color: var(--muted); }
  ${ASSIST} .assistant-diff { margin: 0; max-height: 280px; overflow: auto; padding: 8px 8px; border-radius: 6px; background: var(--wash); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-diff .is-added { color: var(--hue-green-fill); }
  ${ASSIST} .assistant-diff .is-removed { color: var(--danger); }
  ${ASSIST} .assistant-fields dd { margin: 0; max-height: 200px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-problem { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 12px; border-radius: 10px; background: var(--wash); }
  ${ASSIST} .assistant-problem p { margin: 0; }
  ${ASSIST} .assistant-recovery { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 0; padding-left: 16px; font-size: 12px; }
  /* On the project list the Assistant floats at the foot of the page, in the person's own scope. */
  body.project-index-page .project-index { padding-bottom: 96px; }
  body.project-index-page .project-index-dock { position: fixed; z-index: 40; left: 50%; bottom: 16px; width: min(640px, calc(100vw - 32px)); transform: translateX(-50%); }
  body.project-index-page .project-index-dock .bar-center { position: relative; min-width: 0; }
  body.project-index-page .project-index-dock .bar-composer { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 8px; border-radius: 12px; background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-2); }
  body.project-index-page .project-index-dock .bar-composer:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-2); }
  body.project-index-page .project-index-dock .assistant-composer-input { flex: 1; min-width: 0; height: 32px; padding: 0 8px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  body.project-index-page .project-index-dock .assistant-composer-input::placeholder { color: var(--faint); }
  body.project-index-page .project-index-dock .assistant-panel { left: 0; right: 0; height: min(560px, calc(100dvh - 140px)); }
  /* In front of the input: where the next Send goes — a new work (and whose), or the work it continues. */
  /* The Assistant's choosers read like the plugin switcher: quiet words with a hover wash, never a row of outlined chips. */
  ${ASSIST} .assistant-target { display: inline-flex; flex: 0 1 auto; align-items: center; min-width: 0; max-width: 26%; height: 28px; border-radius: 8px; box-shadow: none; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-target:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-target[data-mode="work"] { background: var(--nav-hover); box-shadow: none; }
  ${ASSIST} .assistant-target-main {
    min-width: 0; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted);
    font: inherit; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
  }
  ${ASSIST} .assistant-target-main > span { display: block; overflow: hidden; text-overflow: ellipsis; }
  ${ASSIST} .assistant-target[data-mode="work"] .assistant-target-main { color: var(--ink); padding-right: 4px; }
  ${ASSIST} .assistant-target-main:hover { color: var(--ink); }
  ${ASSIST} :is(.assistant-target-main, .assistant-target-clear):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-target-clear { display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; margin-right: 4px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
  ${ASSIST} .assistant-target-clear[hidden] { display: none; }
  ${ASSIST} .assistant-target-clear:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-target-clear svg { width: 12px; height: 12px; }
  /* What goes with this Send, and ways to begin: small popovers rising from the composer. */
  ${ASSIST} .assistant-executor { display: inline-flex; flex: none; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; box-shadow: none; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
  ${ASSIST} .assistant-executor[hidden] { display: none; }
  ${ASSIST} .assistant-executor svg { width: 12px; height: 12px; color: var(--muted); }
  ${ASSIST} .assistant-executor:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-executor:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-starter[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} :is(.assistant-materials-button, .bar-composer-attach) {
    display: inline-flex; flex: none; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 0; border-radius: 7px;
    background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${ASSIST} .assistant-materials-button { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-materials-button[hidden] { display: none; }
  ${ASSIST} :is(.assistant-materials-button, .bar-composer-attach) svg { width: 14px; height: 14px; }
  ${ASSIST} :is(.assistant-materials-button, .bar-composer-attach):hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} :is(.assistant-materials-button, .bar-composer-attach):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-popover {
    position: absolute; z-index: 60; left: 0; bottom: calc(100% + 8px); display: flex; flex-direction: column; gap: 4px; width: min(420px, 100%);
    max-height: 50dvh; overflow: auto; padding: 8px; border-radius: 10px; background: var(--paper); box-shadow: var(--lift-3); font-size: 13px;
  }
  ${ASSIST} .assistant-popover[hidden] { display: none; }
  /* One “+” beside the input: adding files and every choice about the next work, each with its current value. */
  ${ASSIST} .assistant-more { left: auto; right: 0; width: min(300px, 100%); gap: 2px; }
  ${ASSIST} .assistant-more-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 32px; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-more-item:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-more-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-more-value { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
  /* What this message carries, named — the page's own object first — rather than counted. */
  ${ASSIST} .assistant-materials-button { flex: 0 1 auto; min-width: 0; max-width: 188px; }
  ${ASSIST} .assistant-materials-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-materials-button [data-assistant-materials-count]:empty { display: none; }
  ${ASSIST} .assistant-materials-button[data-optional] { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
  /* A phone, or a crowded bar, keeps the pill's mark and count; its name is in its list and its label. */
  @media (max-width: 600px) { ${ASSIST} .assistant-materials-label { display: none; } }
  ${SHELL} .bar-composer[data-fit="narrow"] .assistant-materials-label { display: none; }
  /* News alone is a quiet bell; a number means something waits for the person. */
  /* The work's own menu: where it belongs, who carries it, handing over, usage. */
  /* The steps between two messages: one quiet line that opens to each step. */
  ${ASSIST} .assistant-steps { margin: 0; font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-steps > summary { width: fit-content; margin-left: -4px; padding: 2px 4px; border-radius: 6px; list-style: none; cursor: pointer; }
  ${ASSIST} .assistant-steps > summary::-webkit-details-marker { display: none; }
  ${ASSIST} .assistant-steps > summary::before { content: "›"; display: inline-block; width: 12px; transition: transform var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-steps[open] > summary::before { transform: rotate(90deg); }
  ${ASSIST} .assistant-steps > summary:hover { background: var(--nav-hover); color: var(--ink-soft); }
  ${ASSIST} .assistant-steps > summary:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-steps[data-state="failed"] > summary { color: var(--danger); }
  ${ASSIST} .assistant-steps > .assistant-activity { padding: 2px 0 0 12px; }
  /* A long message of the person's folds after six lines. */
  ${ASSIST} .assistant-msg--user[data-folded] { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden; }
  ${ASSIST} .assistant-msg-more { align-self: flex-end; margin-top: -8px; padding: 0 4px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  ${ASSIST} .assistant-msg-more:hover { color: var(--ink); }
  ${ASSIST} .assistant-msg-more:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  /* The contextual actions' bar sits right above the input; the contextual script fills it and marks it active.
     It gives way to an open panel (the conversation is then what the person is doing) and to a waiting page suggestion. */
  ${ASSIST} .assistant-context-actions { position: absolute; z-index: 54; left: 0; right: 0; bottom: calc(100% + 8px); display: flex; align-items: center; gap: 6px; min-width: 0; }
  ${ASSIST} .assistant-context-actions:is(:empty, :not([data-state="active"])) { display: none; }
  ${ASSIST} [data-assistant-island]:has(.assistant-panel:not([hidden]), .assistant-offer:not([hidden])) .assistant-context-actions { display: none; }
  /* A plugin's suggestion waits above the bar until the person puts it in the input or ignores it. */
  ${ASSIST} .assistant-offer {
    position: absolute; z-index: 55; right: 0; bottom: calc(100% + 8px); display: flex; flex-direction: column; gap: 6px; width: min(420px, 100%);
    padding: 10px 12px; border-radius: 10px; background: var(--paper); box-shadow: var(--lift-3); font-size: 13px;
  }
  ${ASSIST} .assistant-offer[hidden] { display: none; }
  ${ASSIST} .assistant-offer-copy { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-offer-copy strong { margin-right: 4px; }
  ${ASSIST} .assistant-offer-actions { display: flex; gap: 6px; justify-content: flex-end; }
  /* Attention: a count only for what the person's rules let through here; the list says what waits and why. */
  ${ASSIST} .assistant-attention {
    display: inline-flex; flex: none; align-items: center; gap: 3px; height: 28px; padding: 0 7px; border: 0; border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${ASSIST} .assistant-attention[hidden] { display: none; }
  ${ASSIST} .assistant-attention svg { width: 14px; height: 14px; }
  ${ASSIST} .assistant-attention:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-notices { left: auto; right: 0; gap: 8px; }
  ${ASSIST} .assistant-notice { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 8px; background: var(--nav-hover); }
  ${ASSIST} .assistant-notice-text { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-notices-held > summary { cursor: pointer; color: var(--muted); font-size: 12px; padding: 4px 2px; }
  ${ASSIST} .assistant-notices-held > .assistant-notice { margin-top: 6px; }
  ${ASSIST} .assistant-popover-title { margin: 0 0 4px; padding: 0 8px; font-size: 11px; color: var(--faint); }
  ${ASSIST} .assistant-material { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 7px; }
  ${ASSIST} .assistant-material:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-material-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  ${ASSIST} .assistant-material--image { grid-template-columns: 28px minmax(0, 1fr) auto auto; }
  ${ASSIST} .assistant-mention { display: grid; gap: 2px; text-align: left; }
  ${ASSIST} .assistant-mention-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-mention-snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted); }
  ${ASSIST} .assistant-material-thumb { width: 28px; height: 28px; border-radius: 4px; object-fit: cover; background: var(--nav-hover); }
  ${ASSIST} .assistant-composer[data-dropping] { outline: 2px dashed var(--accent, var(--ink)); outline-offset: 2px; }
  ${ASSIST} .assistant-material-origin { font-size: 11px; color: var(--faint); white-space: nowrap; }
  ${ASSIST} .assistant-material-remove { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
  ${ASSIST} .assistant-material-remove:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-starter { width: 100%; padding: 8px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-soft); font: inherit; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-starter:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-starter--work { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; }
  ${ASSIST} .assistant-starter-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-starter-state { color: var(--muted); font-size: 12px; white-space: nowrap; }
  ${ASSIST} :is(.assistant-starter, .assistant-material-remove):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-exact summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-exact pre { margin: 4px 0 0; max-height: 200px; overflow: auto; padding: 8px 12px; border-radius: 8px; background: var(--wash); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* The input always keeps room to type; the Assistant's choosers give way first and end in an ellipsis. */
  ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 120px; min-width: 120px; }
  ${SHELL} .bar-composer .assistant-target { flex: 0 1 auto; min-width: 72px; max-width: 180px; }
  ${SHELL} .bar-composer .assistant-executor { flex: 0 1 auto; min-width: 0; max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A narrower bar compacts the choosers first (short labels, tighter gaps); below 860px it keeps one beside the input,
     the rule main's phone bar uses: the executor or Character shows once chosen or while the panel is open. */
  @media (max-width: 1100px) {
    ${SHELL} .bar-composer { gap: 4px; }
    ${SHELL} .bar-composer .assistant-target { min-width: 56px; max-width: 96px; }
    ${SHELL} .bar-composer .assistant-executor { max-width: 72px; }
    ${SHELL} .bar-composer .assistant-composer-input { min-width: 96px; }
  }
  @media (max-width: 860px) and (min-width: 601px) {
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
  }
  /* ⌘K search opens from the same place: one entry for finding and for asking. */
  @media (min-width: 601px) {
    ${SHELL} dialog.global-search-dialog[open] { position: fixed; inset: auto 0 calc(var(--dock-h) + 4px) 0; margin: 0 auto; width: min(640px, calc(100vw - 32px)); max-height: min(70dvh, 560px); }
  }
  @keyframes craft-dock-rise { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
  /* Everything that opens from the bar rises from it, anchored at the edge nearest its control. */
  @keyframes craft-rise-from-bar { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  html ${SHELL} .workbench-bar :is(.account-global-popover, .plugin-picker-popover:not([hidden])) { transform-origin: bottom left; animation: craft-rise-from-bar 250ms var(--ease-quint) both; }
  html ${SHELL} .workbench-bar details[open] > .navigator-project-menu-popover { transform-origin: bottom right; animation: craft-rise-from-bar 250ms var(--ease-quint) both; }

  /* The project: a round mark at the far right; its menu switches project, opens settings and the person. */
  html ${SHELL} .workbench-bar .bar-end .workspace-chrome { position: static; display: flex; width: auto; height: auto; min-height: 0; margin: 0 0 0 4px; padding: 0; border: 0; background: transparent; box-shadow: none; grid-area: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-primary { display: flex; flex-direction: row; align-items: center; width: auto; height: auto; min-height: 0; margin: 0; padding: 0; gap: 0; background: transparent; box-shadow: none; }
  html ${SHELL} .workbench-bar .bar-end :is(.navigator-project-search, .desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none !important; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu { position: relative; width: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector {
    display: grid; grid-template-columns: 40px; place-items: center; justify-content: center; gap: 0; width: 40px; height: 40px; min-height: 40px;
    padding: 0; border-radius: 50%; background: transparent; overflow: visible; list-style: none; cursor: pointer;
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector::-webkit-details-marker { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector > :is(strong, svg:last-child) { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector .project-monogram {
    width: 36px; height: 36px; border-radius: 50%; font-size: 13px; font-weight: 600;
    box-shadow: 0 0 0 2px var(--paper), var(--lift-1); transition: box-shadow var(--dur-move) var(--ease-quint);
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector:hover .project-monogram,
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu[open] > .navigator-project-selector .project-monogram { box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--line-strong), var(--lift-1); }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector:focus-visible { outline: var(--focus-stroke); outline-offset: 3px; }
  @media (max-width: 1100px) {
    ${SHELL} .workbench-bar { grid-template-columns: minmax(120px, 1fr) minmax(200px, 560px) minmax(max-content, 1fr); gap: 12px; }
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover {
    position: absolute; top: auto; left: auto; right: 0; bottom: calc(100% + 12px); width: 276px; min-width: 0; max-height: min(78dvh, 640px); overflow: auto;
  }
  /* The switch list keeps one layout at every width. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { display: block; padding: 8px 12px 4px; color: var(--muted); font-size: 11px; font-weight: 500; line-height: 18px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover nav { display: grid; gap: 1px; }
  html ${SHELL} .workbench-bar .navigator-project-option {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; padding: 0 12px; border-radius: 8px;
    color: var(--ink); font-size: 13px; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-option > span { display: flex; align-items: center; gap: 8px; min-width: 0; }
  html ${SHELL} .workbench-bar .navigator-project-option strong { overflow: hidden; font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  html ${SHELL} .workbench-bar .navigator-project-option.is-current strong { font-weight: 500; }
  html ${SHELL} .workbench-bar .navigator-project-option > svg { flex: none; width: 14px; height: 14px; color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-option:hover { background: var(--nav-hover); }
  html ${SHELL} .workbench-bar .navigator-project-option.is-current { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .navigator-project-option:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  /* One row system for the project menu: every row 34px, a 20px leading slot, one text column, and one kind of
     divider with even space on both sides. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover { padding: 8px; border-radius: 14px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { padding: 4px 12px 4px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item, .navigator-personal > .personal-account) {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; height: 34px; min-height: 34px;
    margin: 0; padding: 0 12px; border: 0; border-radius: 8px; box-shadow: none; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; font-weight: 400; line-height: 1; text-align: left; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item) > svg:first-child {
    flex: none; width: 16px; height: 16px; margin: 0 4px; color: var(--ink-soft);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item) > span:not(.personal-account-avatar):not(.personal-account-copy) {
    position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; white-space: nowrap;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item):hover { background: var(--nav-hover); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-project-im, .navigator-personal > .account-global-item):hover > svg:first-child { color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option.is-current, .navigator-project-settings[aria-current], .navigator-personal > .account-global-item[aria-current]) { background: var(--nav-active); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > span { gap: 12px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option .project-monogram { flex: none; width: 20px; height: 20px; border-radius: 6px; font-size: 11px; box-shadow: none; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > svg { margin-left: auto; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar {
    display: grid; place-items: center; flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar svg { width: 12px; height: 12px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy { display: flex; align-items: baseline; gap: 8px; min-width: 0; line-height: 1; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy strong { font-size: 13px; font-weight: 500; color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy small { font-size: 12px; color: var(--muted); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal { display: grid; gap: 0; margin: 0; padding: 0; box-shadow: none; }
  /* Groups: switch projects · this project · you. The divider is drawn in the gap, so it never touches a row.
     Who you are is shown, not clicked: no hover, no pointer. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account { cursor: default; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account:hover { background: transparent; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal { position: relative; margin-top: 12px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal::before {
    content: ""; position: absolute; left: 5px; right: 5px; top: -6px; height: 1px; background: var(--line); pointer-events: none;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im {
    display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 12px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .navigator-project-menu-popover .navigator-project-im svg { width: 16px; height: 16px; color: var(--ink-soft); }
  /* Group chat grows from its button at the right of the bar. */
  ${SHELL} .dock-window {
    position: absolute; z-index: 50; right: 0; bottom: calc(100% + 10px); width: min(400px, calc(100vw - 16px)); display: flex; flex-direction: column; overflow: hidden;
    height: min(560px, calc(100dvh - var(--desktop-titlebar-height) - var(--dock-h) - 40px));
    border-radius: 16px; background: var(--paper); box-shadow: var(--lift-3); transform-origin: bottom right; animation: craft-dock-rise 250ms var(--ease-quint) both;
  }
  ${SHELL} .dock-window[hidden] { display: none; }
  ${SHELL} .dock-window-head { flex: none; display: flex; align-items: center; gap: 4px; height: 44px; padding: 0 8px 0 16px; box-shadow: inset 0 -1px 0 var(--line); }
  ${SHELL} .dock-window-head strong { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: var(--ink); }
  ${SHELL} .dock-window-action {
    display: inline-flex; align-items: center; gap: 8px; width: auto; height: 28px; padding: 0 8px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${SHELL} .dock-window-action:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-window-action svg { width: 14px; height: 14px; }
  ${SHELL} .dock-window-body { flex: 1; min-height: 0; overflow: hidden; }
  ${SHELL} .dock-window-body iframe { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }

  /* A narrow Assistant column (a 640–900px window, a side-by-side layout) keeps one chooser beside a usable input, as on
     a phone: unchosen Character and executor chips fold away while the panel is closed, the plugin chip narrows. */
  @container assistant-bar (max-width: 460px) {
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
    ${SHELL} .bar-composer { gap: 4px; }
    ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 40px; min-width: 40px; }
    /* While typing the input takes the column; focusing a chip keeps that chip on screen. */
    ${SHELL} .bar-composer:has(.assistant-composer-input:focus) :is(.assistant-target, .assistant-executor, .assistant-materials-button, .assistant-attention) { display: none; }
  }
  /* A crowded composer at any width takes the same steps, as far as the island measures it needs (data-fit): the chips
     present — a work, its materials, what needs a look, who does it — would otherwise leave the input no room at all. */
  ${SHELL} .bar-composer[data-fit] { gap: 4px; }
  ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
  /* With the panel open the choosers are back; the ones nobody changed give up their width before the input does. */
  ${SHELL} .bar-composer[data-fit="narrow"] .assistant-executor:not([data-chosen]) { flex: 0 1 auto; min-width: 0; }
  ${SHELL} .bar-composer[data-fit="narrow"] .assistant-executor:not([data-chosen]) > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The input's floor holds only where the column has room for it; a narrow column's own steps above take over there. */
  @container assistant-bar (min-width: 461px) {
    ${SHELL} .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) .assistant-composer-input { flex: 1 1 64px; min-width: 64px; }
    ${SHELL} .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) .assistant-target { min-width: 56px; }
    ${SHELL} .bar-composer[data-fit="narrow"] .assistant-target { max-width: 96px; }
  }
  /* A phone: two rows at the foot — the Assistant line first, then the Dock and the project. A plugin's own list
     opens in a drawer from a button just left of the project, only when that plugin has one. */
  @media (max-width: 600px) {
    ${SHELL} { --plugin-rail-width: 0px; --workspace-chrome-height: 0px; --assistant-island-row: 0px; --dock-h: 116px; --dock-btn: 40px; --composer-h: 50px; }
    ${SHELL} .immersive-workspace,
    ${SHELL} .immersive-workspace.is-directory-collapsed,
    ${SHELL} .immersive-workspace.is-plugin-directory-empty { grid-template-rows: auto 0 0 minmax(0, 1fr) auto; }
    ${SHELL} .workbench-bar {
      z-index: 45; grid-row: 5; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 58px 50px; gap: 0 8px;
      padding: 4px 12px max(8px, env(safe-area-inset-bottom));
    }
    ${SHELL} .bar-center { grid-column: 1 / -1; grid-row: 1; align-self: center; }
    ${SHELL} .bar-start { grid-column: 1; grid-row: 2; }
    html ${SHELL} .workbench-bar .bar-end { grid-column: 2; grid-row: 2; justify-self: end; }
    /* 4px between the row's 40px targets, so the widest state (a plugin with a directory) still fits 390px. */
    ${SHELL} .dock-pins { gap: 4px; margin-left: 8px; }
    ${SHELL} .dock-pins::before { left: -5px; }
    ${SHELL} .dock-pin.is-fixed { margin-right: 4px; }
    ${SHELL} .dock-pin.is-fixed:not(:only-child)::before { right: -4px; }
    html ${SHELL} .workbench-bar :is(.bar-start, .bar-end) { gap: 4px; }
    ${SHELL} .bar-composer .assistant-composer-input { font-size: 16px; }
    ${SHELL} .plugin-picker-trigger { max-width: 132px; }
    html ${SHELL} .immersive-workspace > .tree-pane,
    html ${SHELL} .immersive-sidebar-scrim:not([hidden]) { bottom: var(--dock-h); }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-primary { gap: 4px; }
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
    ${SHELL} .assistant-panel, ${SHELL} .dock-window { position: fixed; left: 10px; right: 10px; bottom: calc(var(--dock-h) + 6px); width: auto; height: min(70dvh, 560px); }
    ${SHELL} .account-global-popover { position: fixed; left: 10px; bottom: calc(var(--dock-h) + 6px); width: min(300px, calc(100vw - 20px)); }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover { position: fixed; right: 10px; left: auto; bottom: calc(var(--dock-h) + 6px); }
    /* The composer row carries the Assistant's own choosers; on a phone they stay compact, and typing gives the input the row. */
    ${ASSIST} .assistant-target { max-width: 30%; }
    ${SHELL} .bar-start .plugin-picker { max-width: none; padding-right: 4px; }
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
    ${SHELL} .bar-composer { gap: 4px; }
    ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 64px; min-width: 64px; }
    ${ASSIST} .assistant-executor { flex: 0 1 auto; min-width: 28px; max-width: 64px; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
    ${ASSIST} .assistant-executor > svg { display: none; }
    /* One chooser beside the input: the Character appears while the panel is open (to choose) or once chosen (then it
       replaces the executor, which a Character implies); search steps aside while the panel is open. */
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
    /* Only while typing: focusing the switcher or a chip must keep it on screen. */
    ${SHELL} .bar-composer:has(.assistant-composer-input:focus) :is(.assistant-target, .assistant-executor, .assistant-materials-button, .assistant-attention) { display: none; }
    body.project-index-page .assistant-panel { position: fixed; left: 10px; right: 10px; bottom: 68px; width: auto; height: min(70dvh, 560px); }
  }

  /* Prompt 与 Character settings: grouped by source, each prompt expandable to edit, the default beside the person's version. */
  .prompt-settings-notice { margin: 0 0 16px; padding: 12px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 13px; }
  .prompt-settings-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }
  .prompt-settings-search { flex: 1 1 220px; min-width: 0; }
  .prompt-group-title { margin: 0 0 8px; font-size: 15px; }
  .prompt-roles-label { margin: 0 0 4px; font-size: 12px; color: var(--muted); }
  .prompt-roles { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .prompt-role { display: inline-flex; flex-direction: column; align-items: flex-start; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: inherit; box-shadow: 0 0 0 1px var(--line); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .prompt-role:hover { background: var(--hover); }
  .prompt-role[aria-pressed="true"] { box-shadow: 0 0 0 1.5px var(--accent); }
  .prompt-role-focus { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 16px; padding: 12px 12px; border-radius: 8px; background: var(--hover); font-size: 13px; }
  .prompt-role-focus p { margin: 4px 0 0; color: var(--muted); }
  .prompt-diagnostics { margin-top: 24px; }
  .assistant-rules { margin-bottom: 18px; }
  .assistant-rule-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-top: 12px; font-size: 13px; }
  .assistant-rule-form > strong { flex-basis: 100%; font-weight: 500; }
  .assistant-rule-surfaces { display: flex; flex-wrap: wrap; gap: 6px 14px; flex-basis: 100%; }
  .assistant-rule-form select { width: auto; }
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
  .prompt-tag, .prompt-state { font-size: 11px; padding: 1px 8px; border-radius: 5px; box-shadow: 0 0 0 1px var(--line); color: var(--muted); white-space: nowrap; }
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

  /* ─── Controls ─────────────────────────────────────────────────────────── */
  ${PAGES} .mw-btn {
    transition:
      background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint),
      border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint),
      transform var(--dur-move) var(--ease-spring), opacity var(--dur-hover) var(--ease-quint);
    will-change: auto;
  }
  ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .home-shortcut-main, .project-card, .plugin-market-project-trigger):active:not(:disabled, [aria-disabled="true"], [aria-expanded="true"], [aria-haspopup]) {
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
  ${PAGES} .mw-toggle-group { border-radius: 9px; }
  ${PAGES} .mw-toggle-group[data-seg-thumb]::before { border-radius: 6px; background: var(--paper); box-shadow: var(--lift-1); transition-timing-function: var(--ease-quint); }
  ${PAGES} .mw-toggle-group > .mw-toggle:not(.is-current, [aria-pressed="true"], [aria-current]):hover { color: var(--ink); }
  ${PAGES} .mw-toggle svg { transition: transform var(--dur-move) var(--ease-spring); }

  /* Fields: the edge darkens and a soft copper halo sits around the one you are writing in. */
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select, .mw-input-group, .project-index-search) {
    transition: border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint);
  }
  ${PAGES} :is(.mw-input, .mw-textarea, .mw-select):not([data-plain-field]):focus-visible,
  ${PAGES} :is(.mw-input-group, .project-index-search):focus-within {
    /* The edge is full copper so the focused field reads at 3:1 or better against its surface; the halo only softens it. */
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

  /* ─── Overlays ─────────────────────────────────────────────────────────── */
  ${PAGES} ${CENTRED_DIALOG}[open] { animation: craft-dialog-in 250ms var(--ease-quint); }
  ${PAGES} ${CENTRED_DIALOG}[open]::backdrop { animation: craft-fade-in 250ms var(--ease-quint); }
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
  /* Leaving mirrors arriving: a closing dialog or sheet fades and settles back instead of vanishing. */
  ${PAGES} :is(${CENTRED_DIALOG}, dialog.mw-sheet) {
    transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint), overlay var(--dur-move) allow-discrete, display var(--dur-move) allow-discrete;
  }
  ${PAGES} ${CENTRED_DIALOG}:not([open]) { opacity: 0; transform: translateY(8px) scale(.98); }
  ${PAGES} dialog.mw-sheet:not([open]) { opacity: 0; transform: translateX(32px); }
  ${PAGES} :is(${CENTRED_DIALOG}, dialog.mw-sheet)::backdrop { transition: opacity var(--dur-move) var(--ease-quint), overlay var(--dur-move) allow-discrete, display var(--dur-move) allow-discrete; }
  ${PAGES} :is(${CENTRED_DIALOG}, dialog.mw-sheet):not([open])::backdrop { opacity: 0; }
  /* A tab switch: the current tab's paper settles in; the pane's content comes up with a short fade. */
  ${WORKBENCH} .tab-item { transition: background-color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  ${WORKBENCH} iframe.tab-content-frame:not([hidden]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint) both; }
  /* A disclosure the person opens (never one rendered open) lets its content settle in. */
  ${PAGES} details[data-just-opened] > :not(summary) { animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  ${WORKBENCH} .immersive-home .home-erow__slot[data-just-opened] { animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  @keyframes craft-dialog-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes craft-sheet-in { from { opacity: 0; transform: translateX(48px); } to { opacity: 1; transform: none; } }
  @keyframes craft-fade-in { from { opacity: 0; } to { opacity: 1; } }
  ${PAGES} ${DROPDOWN} { transform-origin: top left; }
  ${PAGES} ${DROPDOWN}:is(:popover-open, [open], .is-open, :not([hidden])) { animation: craft-drop 250ms var(--ease-quint); }
  ${PAGES} details[open] > .navigator-project-menu-popover { animation: craft-drop 250ms var(--ease-quint); transform-origin: top left; }
  ${PAGES} :is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tab-menu) { border: 0; border-radius: var(--r-card); box-shadow: var(--lift-3); }
  /* Dark reads as three layers: whatever floats (menus, popovers, dialogs, the Assistant panel) sits a step above the
     work surface on --popover, edged by the light ring in its lift rather than by a darker shadow. */
  html[data-resolved-theme="dark"] ${PAGES} :is(.mw-menu, .mw-popover, .navigator-project-menu-popover, .plugin-market-project-popover,
    .tab-menu, .tree-filter, .feed-filter-panel, .source-filter-menu > .source-filter-row, .project-record-filter-menu > div, .tui-menu,
    [data-plugin-picker-popover], .account-global-popover, .shelf-side-menu, .shelf-find, .feed-source-rail, ${CENTRED_DIALOG},
    dialog.mw-sheet, .assistant-panel, .home-talk) { background-color: var(--popover); }
  @keyframes craft-drop { from { opacity: 0; transform: translateY(-5px) scale(.97); } to { opacity: 1; transform: none; } }
  ${PAGES} :is(.mw-menu, .tab-menu) :is([role="menuitem"], [role="option"], button) { transition: background-color 130ms var(--ease-quint), color 130ms var(--ease-quint); }

  /* Toasts: a graphite note that rises above the bar and says, with a mark, how it went. */
  ${PAGES} .toast {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 16px 12px 12px; border-radius: 12px; font-size: 13px; line-height: 18px;
    background: var(--tip-bg); color: var(--tip-ink);
    box-shadow: var(--shadow);
    transform: translate(-50%, 12px) scale(.97);
    transition: opacity 250ms var(--ease-quint), transform 420ms var(--ease-quint);
  }
  ${SHELL} .toast { bottom: calc(var(--dock-h) + 14px); }
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
  ${PAGES} .toast.is-visible.is-error { animation: craft-nudge 420ms var(--ease-quint) 130ms; }
  @keyframes craft-nudge { 0%, 100% { translate: 0; } 25% { translate: -4px; } 50% { translate: 3px; } 75% { translate: -2px; } }
  body.settings-page .toast { transform: translateY(16px) scale(.96); }
  body.settings-page .toast.is-visible { transform: none; }

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
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child > p { margin: 0; max-width: 34em; color: var(--muted); font-size: 13px; line-height: 1.75; }
  ${WORKBENCH} .plugin-stage-list > .mw-empty > :is(.mw-btn, .mw-empty__actions),
  ${WORKBENCH} .plugin-stage-list > div:only-child > .mw-empty:only-child > :is(.mw-btn, .mw-empty__actions) { margin: 24px 0 0; justify-content: center; }
  ${WORKBENCH} .plugin-stage-list .mw-empty__actions { gap: 8px; }

  /* ─── Lists and rows ───────────────────────────────────────────────────── */
  ${WORKBENCH} :is(.tree-entry, .feed-stage-entry, .plugin-stage-list .mw-dir-row, .home-erow, .inbox-stage-row, .session-stage-row) {
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint);
  }
  ${WORKBENCH} .plugin-stage-list :is(.mw-dir-row, .tree-node):active:not(:disabled) { background: var(--nav-press); }
  /* A selected Goal row is one wash on its entry, not a second fill on the button inside it. */
  ${WORKBENCH} :is(.goal-canvas-shell, .plugin-stage-list) .tree-entry.is-selected :is(.tree-node, .tree-row) { background: transparent; }
  /* Something that just landed says so once: a wash that fades from its left edge. */
  ${PAGES} [data-craft-new] { position: relative; }
  ${PAGES} [data-craft-new]::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: color-mix(in srgb, var(--focus) 12%, transparent);
    animation: craft-landed 640ms var(--ease-quint) forwards;
  }
  @keyframes craft-landed { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }

  /* Progress bars fill instead of appearing full. */
  ${WORKBENCH} :is(.goal-progress-bar, .tree-progress, .mw-progress) > :is(i, span, .mw-progress__bar) { transition: transform 420ms var(--ease-quint); }

  /* ─── Goal canvas ──────────────────────────────────────────────────────── */
  /* The canvas is plain paper: nodes and their links are the only marks on it. */
  ${WORKBENCH} :is(.goal-canvas-viewport, .goal-frame-canvas) { background-color: var(--paper); background-image: none; }
  ${WORKBENCH} .momentum-map.graph-stage { background: var(--paper); }
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

  /* 能力 in the workbench: its page fills the cover, edge to edge on the sheet. */
  ${WORKBENCH} [data-work-surface="capabilities"]:not([hidden]) { display: block; height: 100%; min-height: 0; padding: 0; }
  ${WORKBENCH} .capabilities-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }

  /* ─── Board ────────────────────────────────────────────────────────────── */
  ${WORKBENCH} [data-kanban-card] {
    border-radius: 10px; box-shadow: none; border-color: var(--line);
    transition: border-color var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint);
  }
  ${WORKBENCH} [data-kanban-card]:hover { border-color: var(--line-strong); }
  ${WORKBENCH} [data-kanban-card]:is(.is-selected, [aria-current="true"], [aria-selected="true"]) { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }

  /* ─── Goal work area ───────────────────────────────────────────────────── */
  ${WORKBENCH} .goal-node-toolbar .goal-node-back { border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
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
  @keyframes craft-rise { from { opacity: .4; transform: translateY(7px); } to { opacity: 1; transform: none; } }

  /* Opening a project: the rail settles in from the edge, then the sheet. Once per page. */
  ${SHELL}.is-craft-opening .plugin-stack :is(.immersive-plugin-link, .navigator-project-selector, .navigator-project-search, .navigator-project-settings, .personal-account) {
    animation: craft-rail-in 420ms var(--ease-quint) both; animation-delay: calc(var(--craft-i, 0) * 130ms + 130ms);
  }
  ${SHELL}.is-craft-opening .immersive-plugin-stage { animation: craft-sheet-open 640ms var(--ease-quint) both 130ms; }
  ${SHELL}.is-craft-opening .immersive-titlebar .tab-strip--chrome { animation: craft-fade-in 420ms var(--ease-quint) both 130ms; }
  ${SHELL}.is-craft-opening .workbench-bar > * { animation: craft-bar-in 420ms var(--ease-quint) both; }
  ${SHELL}.is-craft-opening .workbench-bar > .bar-center { animation-delay: 130ms; }
  ${SHELL}.is-craft-opening .workbench-bar > .bar-end { animation-delay: 130ms; }
  @keyframes craft-bar-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes craft-rail-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
  @keyframes craft-sheet-open { from { opacity: 0; transform: translateY(10px) scale(.994); } to { opacity: 1; transform: none; } }

  /* ─── Home ─────────────────────────────────────────────────────────────── */
  /* The page owns its layout in project-home.ts; this layer adds only the arrival cascade and the press tone. */
  ${WORKBENCH} .immersive-home .home-erow:active { background: var(--nav-press); }
  /* Arrival plays once per surface (\`is-arriving\`, set on its first reveal); showing Home again does not replay it. */
  ${WORKBENCH} .immersive-home.is-arriving :is(.home-focus, .home-note) { animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  ${WORKBENCH} .immersive-home.is-arriving .home-note { animation-delay: 130ms; }
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
    /* One header on every page: the title and one sentence on the left, the page's actions on the right. */
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome) {
      position: relative; inset: auto; z-index: 5; display: grid; grid-auto-flow: column; grid-template-columns: minmax(0, 1fr);
      grid-auto-columns: auto; grid-template-rows: auto auto; align-items: center; column-gap: 8px; row-gap: 4px;
      width: auto; max-width: none; height: auto; min-height: 40px; flex: none; margin: 0 0 24px; padding: 0;
    }
    ${STAGE_LIST} > :is(.plugin-stage-chrome, .shelf-stage-chrome) > * { grid-row: 1 / span 2; }
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
    ${STAGE_LIST} > .plugin-stage-chrome .tree-create { min-height: 34px; padding: 0 12px; border-radius: 8px; font-size: 13px; }
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
  /* Sessions keep their own shell (a fixed header over a scrolling list); the page reads the same way. */
  @media (min-width: 761px) {
    ${SESSIONS_LIST}::before {
      content: var(--stage-title, "") / ""; position: absolute; top: 24px; left: max(32px, calc((100% - 960px) / 2)); z-index: 21;
      max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none;
      font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 40px; color: var(--ink);
    }
    ${SESSIONS_LIST}::after {
      content: var(--stage-desc, "") / ""; position: absolute; top: 66px; left: max(32px, calc((100% - 960px) / 2)); z-index: 21;
      max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; font-size: 13px; line-height: 20px; color: var(--muted);
    }
    ${SESSIONS_LIST} > [data-session-stage-chrome] { top: 28px; left: auto; right: max(32px, calc((100% - 960px) / 2)); height: 40px; }
    ${SESSIONS_LIST} > [data-session-stage-chrome] .tree-create { min-height: 34px; padding: 0 12px; border-radius: 8px; font-size: 13px; background: var(--action); color: var(--action-ink); }
    ${SESSIONS_LIST} > [data-session-stage-chrome] .tree-create svg { color: currentColor; }
    /* The header's actions sit on the right, so their filter menus open leftward and stay inside the page. */
    :is(${STAGE_LIST} > .plugin-stage-chrome, ${SESSIONS_LIST} > [data-session-stage-chrome]) .project-record-filter-menu > div { left: auto; right: 0; transform-origin: top right; }
    ${SESSIONS_LIST} > [data-session-stage-chrome] .tree-create:hover { background: var(--action-hover, color-mix(in srgb, var(--action) 90%, var(--action-ink))); }
    ${SESSIONS_LIST} > .session-stage-list { top: 104px; padding: 0 max(32px, calc((100% - 960px) / 2)) 56px; }
    ${SESSIONS_LIST} .session-stage-row { height: auto; min-height: 44px; padding-block: 8px; border-radius: 8px; }
    ${SESSIONS_LIST} .goal-collection-fold { margin: 0 0 16px; }
    ${WORKBENCH} .session-stage-shell[data-expanded="true"] > .session-stage-list { background: var(--surface-soft); }
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

  /* ─── Plugin market ────────────────────────────────────────────────────── */
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

  /* ─── Settings documents ───────────────────────────────────────────────── */
  ${PAGES} :is(.settings-card, .settings-group, .project-settings-card) { border-radius: var(--r-card); }

  /* ─── Project index: the arrival page ──────────────────────────────────── */
  body.project-index-page { background: var(--desk); }
  body.project-index-page .craft-greeting { margin: 0 0 12px; color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  body.project-index-page .project-index-heading h1 { letter-spacing: -.03em; }
  body.project-index-page .project-card {
    position: relative; border-color: var(--line); box-shadow: none; border-radius: 12px; background: var(--paper);
    transition: border-color var(--dur-hover) var(--ease-quint);
    animation: craft-rise 420ms var(--ease-quint) both;
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
  ${PAGES} [data-craft-drag-source] { opacity: .45; transition: opacity 130ms var(--ease-quint); }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas], .tab-strip, [data-drop-target], .shelf-drop, .workflow-gap) {
    transition: box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-move) var(--ease-quint);
  }
  body[data-craft-dragging] :is(.goal-frame-canvas, [data-frame-canvas]) { background-color: color-mix(in srgb, var(--focus) 4%, var(--paper)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 18%, transparent); }
  body[data-craft-dragging] :is([data-drop-target], .tab-strip):hover { background-color: color-mix(in srgb, var(--focus) 6%, transparent); }

  /* ─── A Goal that just finished ────────────────────────────────────────── */
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

  /* ─── Catalog specimens for this layer ─────────────────────────────────── */
  .mw-catalog .mw-craft-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
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
  .mw-catalog .mw-craft-space__sheet b { display: block; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
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
  .mw-catalog .mw-icon-inventory { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
  .mw-catalog .mw-icon-inventory { width: min(880px, 100%); }
  .mw-catalog #icon-inventory .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog #icon-inventory .mw-catalog__specimens > * { width: 100%; }
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

  /* ─── Reduced motion: nothing here moves ───────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    /* State still changes and focus still moves; only the movement goes. Transitions stop too, not just animations:
       a 0s duration (not 1ms) so a new size or position is there the moment the state changes. */
    ${PAGES} *, ${PAGES} *::before, ${PAGES} *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
    ${PAGES} :is(.mw-btn, .mw-toggle, .tree-create, .tab-item, .tab-view-chip, .project-card, .home-day, [data-kanban-card], .mw-check, .mw-radio, .dock-pin, .bar-resident, .bar-chat, .account-global-trigger, .plugin-picker-trigger):is(:active, :hover) { transform: none !important; }
    ${PAGES} :is(.mw-btn, .tab-item, [data-kanban-card], .project-card, .plugin-market-body .mw-card, .plugin-market-installed-row > *):hover { transform: none !important; }
    ${PAGES} :is(.assistant-side-action, .assistant-segment, .assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-control, .assistant-start, .assistant-copy, .assistant-tab-close, .assistant-tab-main, .assistant-jump):active { transform: none !important; }
    .craft-burst, .craft-tip { transition: none; }
    .craft-burst { display: none; }
  }
`;

/** Under automation (headless review, e2e) the layer holds still so geometry reads settle at once. */
const STILL_RESET = `
  html[data-craft-still] :is(.workbench-bar > *, .immersive-plugin-stage, .dock-overflow, .dock-window, .account-global-popover, .assistant-panel, .plugin-picker-popover, .immersive-home :is(.home-focus, .home-note, .home-erow__slot), .tab-pane-body > [data-work-surface], .tab-workspace-exclusive > *, .home-tl__rows > *, .plugin-market-list > *, .project-card,
    dialog[open], ${DROPDOWN}, details[open] > .navigator-project-menu-popover, .toast, .mw-check, .mw-radio, [data-graph-edge] path,
    [data-craft-celebrate] .goal-status--completed, [data-craft-celebrate] .goal-status--completed svg) { animation: none !important; }
  html[data-craft-still] :is(dialog[open], .mw-check:checked, .mw-radio:checked, .plugin-rail-items .immersive-plugin-link[aria-current], [data-craft-new])::after,
  html[data-craft-still] dialog[open]::backdrop,
  html[data-craft-still] :is(.goal-canvas-node, [data-graph-node], [data-kanban-card]) *::after { animation: none !important; }
  html[data-craft-still] [data-assistant-island] :is(*, *::before, *::after) { animation: none !important; }
  html[data-craft-still] :is(dialog, dialog::backdrop, iframe.tab-content-frame, [data-just-opened], [data-just-opened] > *, .is-arriving, .is-arriving *) { transition: none !important; animation: none !important; }
  /* Under automation nothing eases either, so a reading taken right after a change sees the settled value. */
  html[data-craft-still] *, html[data-craft-still] *::before, html[data-craft-still] *::after { transition-duration: 0s !important; transition-delay: 0s !important; }
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
    const [text] = daylight();
    node.textContent = T(text);
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

  /* Arrival plays once per surface: the first time a work surface is revealed it carries \`is-arriving\` for one
   * arrival's length; showing it again later (a tab switch, a return) never replays the cascade. */
  const arrived = new WeakSet();
  const arrive = (surface) => {
    if (arrived.has(surface) || surface.hidden || reduced()) { arrived.add(surface); return; }
    arrived.add(surface);
    surface.classList.add("is-arriving");
    setTimeout(() => surface.classList.remove("is-arriving"), 900);
  };
  if (workbench) {
    document.querySelectorAll("[data-work-surface]").forEach((surface) => { if (!surface.hidden) arrive(surface); });
    new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target;
        if (node instanceof HTMLElement && node.hasAttribute("data-work-surface") && !node.hidden) arrive(node);
      }
    }).observe(body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  /* A disclosure lets its content settle in only when a person opened it; rendering one already open stays still. */
  let userToggleAt = 0;
  const noteToggle = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("summary, [data-home-open-event]")) userToggleAt = Date.now();
  };
  document.addEventListener("click", noteToggle, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") noteToggle(event); }, true);
  const settleOpened = (node) => {
    if (reduced() || !node) return;
    node.setAttribute("data-just-opened", "");
    setTimeout(() => node.removeAttribute("data-just-opened"), 420);
  };
  document.addEventListener("toggle", (event) => {
    const details = event.target;
    if (details instanceof HTMLDetailsElement && details.open && Date.now() - userToggleAt < 400) settleOpened(details);
  }, true);
  document.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest("[data-home-open-event]") : null;
    if (row) requestAnimationFrame(() => settleOpened(document.querySelector(".immersive-home .home-erow-wrap.is-open .home-erow__slot")));
  });

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
