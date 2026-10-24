/**
 * The product's motion vocabulary (DESIGN「Motion」): one keyframe for each kind of entrance, and the one wash for
 * something that has just landed, plus the menu lifecycle rules. Part of the final layer every product page loads, so a plugin animates with these
 * names and never writes its own.
 */
export const MOTION_STYLES = `
  /* Something arrives: a surface's first reveal, a reading, a result, a card or a step. 7px from 40%, so words never blink. */
  @keyframes craft-rise { from { opacity: .4; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  /* Something shown again, or a layer that only appears: a cross-fade. */
  @keyframes craft-fade-in { from { opacity: 0; } to { opacity: 1; } }
  /* A menu grows from its control: down from one above it, up from one below it (and from the bar); 4px and .97. */
  @keyframes craft-drop { from { opacity: 0; transform: translateY(-4px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes craft-rise-from-bar { from { opacity: 0; transform: translateY(4px) scale(.97); } to { opacity: 1; transform: none; } }
  /* Something that just landed (a new Goal, message, Inbox entry, issue or record) says so once: one copper wash that fades.
     Set data-craft-new on the row, or call molisCraft.land(row); the row keeps its own background and pseudo-elements' room. */
  [data-craft-new] { position: relative; }
  [data-craft-new]::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: var(--accent-soft); opacity: 0;
    animation: craft-landed var(--dur-moment, 640ms) var(--ease-quint);
  }
  @keyframes craft-landed { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { [data-craft-new]::after { animation: none; } }
`;

/** Popovers and menus that drop from the control that opened them. */
/** The menus whose closing plays back (the Assistant's composer, also in DROPDOWN, keeps its own motion). */
const MENU_EXIT = ".mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tree-filter, .feed-filter-panel, .tui-menu";
const DETAILS_MENU = `:is(${MENU_EXIT}):not([popover])`;
export const DROPDOWN = ":is(.mw-menu, .navigator-project-menu-popover, .plugin-market-project-popover, .tree-filter, .feed-filter-panel, .source-filter-menu > .source-filter-row, .tui-menu, .assistant-composer)";

/** Menu entry and exit share one motion owner; the final layer supplies its existing page scope and insertion point. */
export function renderMenuMotion(pages: string): string {
  return `${pages} ${DROPDOWN} { transform-origin: top left; }
  ${pages} ${DROPDOWN}:is(:popover-open, [open], .is-open, :not([hidden])):where(:not(details > ${DETAILS_MENU})) { animation: craft-drop var(--dur-move) var(--ease-quint); }
  ${pages} details[open] > .navigator-project-menu-popover { transform-origin: top left; }
  /* Closing plays the opening backwards on the short clock and a closing menu keeps its box, takes no pointer. Only closing holds the content (held on opening, an opening menu was undrawn and unclickable). The hold is a custom property on the menu's details, read by the closed-details rule at zero specificity so a disclosure's own transition wins: a :has() on a ::details-content subject cost every node put in the page 30 ms of style (VUX-36). */
  ${pages} details:has(> :is(${MENU_EXIT})) { --exit-hold: var(--dur-hover); }
  :where(details:not([open]))::details-content { transition: content-visibility var(--exit-hold, 0s) allow-discrete; }
  ${pages} :is(${MENU_EXIT}) { transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-hover) var(--ease-quint), display var(--dur-hover) allow-discrete, overlay var(--dur-hover) allow-discrete; }
  ${pages} :is(details:not([open]) > :is(${MENU_EXIT}), :is(${MENU_EXIT})[hidden], :is(${MENU_EXIT})[popover]:not(:popover-open)) { opacity: 0; transform: translateY(-4px) scale(.97); pointer-events: none; }
  /* A details menu reverses its current transition; a still-running entry keyframe would otherwise finish over its exit. */
  ${pages} details > ${DETAILS_MENU} { animation: none; }
  ${pages} details[open] > ${DETAILS_MENU} { transition-duration: var(--dur-move); }
  ${pages} details:not([open]) > ${DETAILS_MENU} { transform: translateY(var(--menu-from-y, -4px)) scale(.97); }
  @starting-style { ${pages} details[open] > ${DETAILS_MENU} { opacity: 0; transform: translateY(var(--menu-from-y, -4px)) scale(.97); } }`;
}
