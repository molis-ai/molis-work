/**
 * Ways out and ways back (specs/page-interaction-flow). Appended right after the Soft Workbench final layer on the
 * workbench and settings pages, so it speaks the same tokens and wins over nothing but its own selectors.
 */
const WORKBENCH = "body.immersive-workbench";
/** The bar outside a pane, and the component board's real-bar specimen. */
const BAR = "html :is(body.immersive-workbench:not([data-pane-embedded]), .mw-catalog-bar-stage) .workbench-bar";

export const NAVIGATION_FLOW_STYLES = `
  /* A cover names itself where the tabs are and carries its own close. */
  ${WORKBENCH} .tab-view-chip.is-exclusive { gap: 6px; padding-right: 3px; cursor: default; }
  ${WORKBENCH} .tab-view-chip-close {
    display: inline-grid; place-items: center; flex: none; width: 20px; height: 20px; margin: 0; padding: 0;
    border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint);
  }
  ${WORKBENCH} .tab-view-chip-close svg { width: 12px; height: 12px; color: currentColor; }
  ${WORKBENCH} .tab-view-chip-close:hover { background: var(--nav-active); color: var(--ink); }
  ${WORKBENCH} .tab-view-chip-close:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  @media (max-width: 760px), (pointer: coarse) {
    ${WORKBENCH} .tab-view-chip-close { width: 32px; height: 32px; }
  }

  /* The two groups of the bar sit in trays as tall as the composer: the Dock on the left, the person's own (Shelf,
     灵光, discussion) on the right. A tray is a recessed tone, not a raised surface, so the composer stays the one
     raised thing in the bar and the current entry still reads as a paper tile lifted out of its tray. */
  /* On a phone the two groups already sit on their own row under the composer; trays there only add weight. */
  @media (min-width: 601px) {
    ${BAR} { --bar-tray: color-mix(in srgb, var(--ink) 4%, transparent); --bar-tray-edge: color-mix(in srgb, var(--ink) 6%, transparent); }
    ${BAR} :is(.bar-start, .bar-residents) { padding: 6px; border-radius: var(--r-composer, 15px); background: var(--bar-tray); box-shadow: inset 0 0 0 1px var(--bar-tray-edge); }
    ${BAR} .bar-start .dock-pins { height: var(--dock-btn); }
    ${BAR} .bar-start .dock-pins::before { top: calc((var(--dock-btn) - 20px) / 2); }
  }
  @media (min-width: 601px) and (max-height: 560px) {
    ${BAR} :is(.bar-start, .bar-residents) { padding: 3px; }
  }
  /* The left column never gets narrower than its tray's least content — the Dock menu, 项目首页 and the +N fold —
     so what folds stays inside the tray instead of sliding under the composer. */
  @media (min-width: 601px) {
    ${BAR} { grid-template-columns: minmax(calc(var(--dock-btn) * 3 + 38px), 1fr) minmax(200px, 660px) minmax(max-content, 1fr); }
  }
  @media (min-width: 601px) and (max-width: 1100px) {
    ${BAR} { grid-template-columns: minmax(calc(var(--dock-btn) * 3 + 38px), 1fr) minmax(200px, 560px) minmax(max-content, 1fr); }
  }

  /* The switcher names a cover the way it names a plugin. */
  ${WORKBENCH} .plugin-picker-chip.is-cover svg { color: var(--ink-soft); }
`;
