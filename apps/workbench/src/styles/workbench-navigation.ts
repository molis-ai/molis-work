/**
 * The workbench's navigation parts as the 07-1 layout settled them (docs/design/workbench-navigation, scheme A with zoning 1,
 * user 2026-11-04), drawn on the component board first (`/__ui/catalog/navigation`) so the slices that move the product onto
 * them use these rules as they are. Each part is a small step on the tab strip and titlebar the product already draws
 * (tab-workspace.ts, tab-groups.ts): the group's head and its tabs a weight apart with a hairline between; the current tab of a
 * pane without the focus keeping only its place; the strip's text buttons (all tabs, one pane only); the menus that open from
 * the titlebar (＋, all tabs, layout); a tab whose record is gone, whose plugin did not start or was removed; the Main | Right
 * switch on a phone; glyph-only tabs that widen in place to say their name; the count on a glyph; and the layout button at the
 * titlebar's end. Appended after TAB_GROUP_STYLES, so it wins over the generic tab rules only where it says so.
 */
const W = "body.immersive-workbench";
const GROUP_IN = ".tab-group:is([data-plugin-group], [data-tab-group])";
const GROUP = `${W} .tab-strip ${GROUP_IN}`;
const GLYPH = `${W} .tab-item[data-glyph-only]`;
const GROWN = `${GLYPH}:is(.is-grown, :has(.tab-item-trigger:focus-visible))`;
const STRIP_BUTTON = `${W} :is(.tab-all-button, .tab-solo-chip)`;

export const WORKBENCH_NAVIGATION_STYLES = `
  /* Two tiers in a group: the head names the plugin in its colour, its tabs are a step lighter, a hairline between them. */
  ${GROUP} .tab-group-sep { flex: none; width: 1px; height: 14px; margin: 0 2px; background: color-mix(in srgb, var(--group-color) 30%, transparent); }
  ${GROUP} .tab-item:not([data-tab-kind="plugin"]):not([aria-current]) { font-weight: 400; }
  /* A pane without the focus: its current tab says where that pane is, without the lift that says "you are here". */
  ${W} .tab-strip[data-unfocused] .tab-item[aria-current] { background: var(--nav-active); box-shadow: none; }
  ${W} .tab-strip[data-unfocused] ${GROUP_IN} .tab-item[aria-current] { background: color-mix(in srgb, var(--group-color) 18%, transparent); box-shadow: none; }
  ${W} .tab-strip[data-unfocused] .tab-item[aria-current]::after { display: none; }
  /* The strip's own text buttons: every tab, once the strip cannot hold them; the way back from one pane only. */
  ${STRIP_BUTTON} {
    flex: none; display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 0; border-radius: var(--r-control, 8px);
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; font-weight: var(--weight-control, 500); white-space: nowrap; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${STRIP_BUTTON} svg { width: 14px; height: 14px; flex: none; }
  ${STRIP_BUTTON}:hover { background: var(--nav-hover); color: var(--ink); }
  ${STRIP_BUTTON}:active { background: var(--nav-press, var(--nav-active)); }
  ${STRIP_BUTTON}:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${W} .tab-all-button[aria-expanded="true"] { background: var(--nav-active); color: var(--ink); }
  ${W} .tab-all-count { color: var(--muted); font-variant-numeric: tabular-nums; }
  ${W} .tab-solo-chip { background: var(--accent-soft); color: var(--accent-strong, var(--accent)); }
  ${W} .tab-solo-chip:hover { background: color-mix(in srgb, var(--accent) 18%, var(--paper)); color: var(--accent-strong, var(--accent)); }
  /* The undo chip sits after the scrolling tabs, so a long strip never scrolls it away. */
  ${W} .tab-strip > .tab-undo-chip { margin: 0 2px; }
  /* Menus that open from the titlebar: a search field on top, sections, a row's place and its "open beside", the keys at the foot. */
  ${W} .tab-menu[hidden] { display: none; }
  ${W} .tab-menu { width: 320px; max-width: calc(100vw - 16px); max-height: min(70dvh, 560px); overflow: auto; overscroll-behavior: contain; }
  ${W} .tab-menu-head { padding: 6px 12px 4px; color: var(--ink); font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The search field is the board's grouped field (mw-input-group); in a menu it sits at the top, over the rows. */
  ${W} .tab-menu-find { margin: 0 0 6px; }
  ${W} .tab-menu-find .mw-input { flex: 1; }
  ${W} .tab-menu .mw-menu__item[aria-current] { background: var(--nav-active); }
  ${W} .tab-menu .mw-menu__label { display: flex; align-items: center; gap: 6px; }
  ${W} .tab-menu-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--group-color); }
  ${W} .tab-menu .mw-menu__item > svg:first-child { color: var(--group-color, var(--ink-soft)); }
  ${W} .tab-menu-row { position: relative; display: flex; align-items: center; }
  ${W} .tab-menu-row > .mw-menu__item { padding-right: 44px; }
  ${W} .tab-menu-where, ${W} .tab-menu-note { flex: none; margin-left: auto; padding-left: 8px; color: var(--muted); font-size: 11px; white-space: nowrap; }
  ${W} .tab-menu-note { color: var(--amber); }
  ${W} .tab-menu-row > .tab-menu-beside {
    position: absolute; right: 4px; top: 50%; width: 28px; height: 28px; min-height: 28px; margin-top: -14px; padding: 0;
    opacity: 0; transform: translateX(6px); transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-move) var(--ease-quint);
  }
  ${W} .tab-menu-row:is(:hover, :focus-within) > .tab-menu-beside { opacity: 1; transform: none; }
  ${W} .tab-menu-foot { margin-top: 4px; padding: 8px 12px 4px; box-shadow: inset 0 1px 0 var(--line); color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* A tab whose record is gone is struck through; a plugin that did not start carries the amber point; a removed plugin's group greys. */
  ${W} .tab-item[data-tab-state="gone"] .tab-item-name { color: var(--faint); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--faint) 60%, transparent); }
  ${W} .tab-item-trigger > .nav-warn-dot { margin-left: -2px; }
  ${GROUP}[data-group-state="removed"] { --group-color: var(--faint); --group-fill: var(--faint); }
  ${GROUP}[data-group-state="removed"] .tab-item-name { color: var(--muted); }
  ${W} .tab-group-tag { flex: none; padding: 0 6px 0 2px; color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); white-space: nowrap; }
  /* On a phone only the focused pane shows: the strip leads with which one. */
  ${W} .tab-pane-switch { display: none; flex: none; margin-right: 4px; }
  /* Glyph-only tabs (the right side, pinned) widen in place after a short rest or on keyboard focus. The width steps at once, only the name fades in; in a row against the right edge the name comes before the glyph, so the glyph stays put. */
  ${W} .tab-glyph-row { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
  ${GLYPH} { width: 32px; min-width: 32px; max-width: 32px; padding: 0; }
  ${GLYPH} .tab-item-trigger { justify-content: center; gap: 6px; }
  ${GLYPH} .tab-item-name { display: none; }
  ${GROWN} { width: max-content; max-width: 208px; padding: 0 10px 0 8px; }
  ${GROWN}:not([aria-current]) { background: var(--nav-hover); color: var(--ink); }
  ${GROWN} .tab-item-name { display: block; animation: tab-name-in var(--dur-hover) var(--ease-quint) both; }
  ${W} .tab-glyph-row ${GROWN} { padding: 0 8px 0 10px; }
  ${W} .tab-glyph-row ${GLYPH} .tab-item-trigger { flex-direction: row-reverse; }
  @keyframes tab-name-in { from { opacity: 0; } }
  /* The count of unfinished work on a glyph (background tasks). */
  ${W} .tab-count-badge {
    position: absolute; top: 0; right: 0; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--action); color: var(--action-ink);
    font-size: 10px; font-weight: 600; line-height: 14px; text-align: center; font-variant-numeric: tabular-nums; pointer-events: none;
  }
  /* The window's one layout button at the titlebar's end, after a hairline; with the right side hidden, its glyphs sit before it. */
  ${W} .titlebar-layout { position: relative; display: flex; align-items: center; flex: none; gap: 4px; padding-left: 9px; }
  ${W} .titlebar-layout::before { content: ""; position: absolute; left: 0; top: 50%; width: 1px; height: 16px; margin-top: -8px; background: var(--line-strong); }
  ${W} .titlebar-layout-button {
    display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--r-control, 8px); background: transparent; color: var(--ink-soft); cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${W} .titlebar-layout-button svg { width: 16px; height: 16px; }
  ${W} .titlebar-layout-button:hover, ${W} .titlebar-layout-button[aria-expanded="true"] { background: var(--nav-hover); color: var(--ink); }
  ${W} .titlebar-layout-button:active { background: var(--nav-active); }
  ${W} .titlebar-layout-button:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${W} .titlebar-layout-button:disabled { color: var(--faint); background: transparent; cursor: default; }

  @media (max-width: 760px) {
    ${W} .tab-pane-switch { display: inline-flex; }
    ${W} .tab-pane-switch .mw-toggle { min-height: 40px; }
    ${STRIP_BUTTON}, ${W} .titlebar-layout-button { height: 44px; min-width: 44px; }
    ${W} .tab-all-button > span:not(.tab-all-count) { display: none; }
    ${W} .tab-menu .mw-menu__item { min-height: 44px; }
    ${W} .tab-menu-row > .tab-menu-beside { width: 44px; height: 44px; margin-top: -22px; opacity: 1; transform: none; }
    ${W} .tab-menu-row > .mw-menu__item { padding-right: 52px; }
  }
  @media (prefers-reduced-motion: reduce) {
    ${GROWN} .tab-item-name { animation: none; }
    ${STRIP_BUTTON}, ${W} .titlebar-layout-button, ${W} .tab-menu-row > .tab-menu-beside { transition: none; }
  }
`;
