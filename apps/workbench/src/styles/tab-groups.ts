/**
 * Tab groups on the desk (specs/plugin-tab-groups): each group is a tinted run in its colour — a plugin's catalog hue,
 * or the colour a person chose — holding its tabs; the current tab is still a small piece of the sheet. Appended after
 * the Soft Workbench final layer, so it wins over the generic tab rules only inside groups.
 */
const WORKBENCH = "body.immersive-workbench";
const GROUP_IN = ".tab-group:is([data-plugin-group], [data-tab-group])";
const GROUP = `${WORKBENCH} .tab-strip ${GROUP_IN}`;

export const TAB_GROUP_STYLES = `
  ${WORKBENCH} .tab-strip .tab-scroll { gap: 6px; }
  ${WORKBENCH} .tab-strip .tab-item:is([data-tab-kind="home"], [data-tab-kind="plugin"]):not([data-pinned]) { width: max-content; flex-shrink: 0; }
  ${GROUP} {
    --group-wash: color-mix(in srgb, var(--group-color) 10%, transparent);
    height: 28px; gap: 2px; padding: 2px; border-radius: var(--r-row, 10px); background: var(--group-wash);
    transition: background-color var(--dur-move) var(--ease-quint);
  }
  ${GROUP}[data-active="true"] { --group-wash: color-mix(in srgb, var(--group-color) 15%, transparent); }
  ${GROUP}::after { display: none; }
  ${GROUP} .tab-group-pages { gap: 2px; }
  ${GROUP} { --group-ink: color-mix(in srgb, var(--group-color) 72%, var(--ink)); }
  ${GROUP} .tab-item { height: 24px; border-radius: 8px; color: color-mix(in srgb, var(--group-color) 35%, var(--ink)); }
  ${GROUP} .tab-item svg.tab-item-icon { color: var(--group-color); }
  ${GROUP} .tab-item:hover { background: color-mix(in srgb, var(--group-color) 12%, transparent); color: var(--ink); }
  ${GROUP} .tab-item[aria-current] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
  ${GROUP} .tab-item[aria-current]::after {
    content: ""; position: absolute; left: 50%; bottom: 1px; width: 14px; height: 2px; border-radius: 2px;
    background: var(--group-fill, var(--group-color)); transform: translateX(-50%); pointer-events: none;
  }
  ${GROUP} .tab-item[data-tab-kind="plugin"], ${GROUP} .tab-item[data-tab-kind="plugin"]:is(:hover, [aria-current]) { color: var(--group-ink); font-weight: var(--weight-control, 500); }
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) ${GROUP_IN} .tab-item[aria-current] { background: transparent; box-shadow: none; }
  ${WORKBENCH} .tab-strip:has(.tab-view-chip.is-exclusive) ${GROUP_IN} .tab-item[aria-current]::after { display: none; }
  ${GROUP} .tab-group-count {
    flex: none; display: inline-grid; place-items: center; min-width: 16px; height: 16px; margin-left: 6px; padding: 0 4px;
    border-radius: var(--r-tag, 6px); background: var(--group-color); color: var(--paper); font-size: 11px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums;
  }
  ${GROUP}[data-collapsed="true"] .tab-item[data-tab-kind="plugin"] { display: inline-flex; }

  /* Where a dragged tab or group will land: inside a group the slot is a tab of that group; a whole group's slot is the group. */
  ${GROUP} [data-tab-reorder-slot] { height: 24px; border-radius: 8px; background: color-mix(in srgb, var(--group-color) 22%, transparent); box-shadow: none; }
  ${WORKBENCH} .tab-strip [data-tab-reorder-slot].is-group {
    height: 28px; max-width: none; border-radius: 10px;
    background: color-mix(in srgb, var(--plugin-color) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--plugin-color) 34%, transparent);
  }

  /* A person's group is named by a small solid label in its colour; unnamed, it is a dot. */
  ${GROUP} .tab-group-label, ${GROUP}[data-active="true"] .tab-group-label {
    height: 20px; min-width: 20px; margin: 0 2px; padding: 0 7px; gap: 0; border-radius: var(--r-tag, 6px);
    background: var(--group-color); color: var(--paper); font-size: 11px; font-weight: 600;
  }
  ${GROUP} .tab-group-label::before { display: none; }
  ${GROUP} .tab-group-label:has(.tab-group-name:empty) { min-width: 20px; padding: 0; background: transparent; }
  ${GROUP} .tab-group-label:has(.tab-group-name:empty)::before { display: block; width: 8px; height: 8px; margin: auto; border-radius: 50%; background: var(--group-color); }
  ${GROUP} .tab-group-label:has(.tab-group-name:empty):hover { background: color-mix(in srgb, var(--group-color) 14%, transparent); }
  ${GROUP} .tab-group-label:not(:has(.tab-group-name:empty)):hover { background: color-mix(in srgb, var(--group-color) 86%, var(--ink)); }

  /* The way back after closing a group, for a few seconds at the end of the strip. */
  ${WORKBENCH} .tab-undo-chip {
    flex: none; display: inline-flex; align-items: center; gap: 6px; height: 24px; margin: 0 4px; padding: 0 10px 0 8px;
    border: 0; border-radius: 8px; background: color-mix(in srgb, var(--group-color) 12%, var(--paper)); color: color-mix(in srgb, var(--group-color) 72%, var(--ink));
    font: inherit; font-size: 12px; font-weight: var(--weight-control, 500); white-space: nowrap; cursor: pointer; box-shadow: var(--lift-1);
    animation: tab-undo-arrive var(--dur-move) var(--ease-quint) both;
    transition: background-color var(--dur-hover) var(--ease-quint);
  }
  ${WORKBENCH} .tab-undo-chip svg { width: 13px; height: 13px; }
  ${WORKBENCH} .tab-undo-chip:hover { background: color-mix(in srgb, var(--group-color) 20%, var(--paper)); }
  ${WORKBENCH} .tab-undo-chip:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  @keyframes tab-undo-arrive { from { opacity: 0; transform: translateX(-6px); } }

  @media (max-width: 760px), (pointer: coarse) {
    ${GROUP} { height: auto; padding: 0; border-radius: 12px; }
    ${GROUP} .tab-item { height: 44px; border-radius: 12px; }
    ${GROUP} .tab-group-label { height: 44px; min-width: 44px; }
    ${WORKBENCH} .tab-undo-chip { height: 44px; }
    ${GROUP} [data-tab-reorder-slot], ${WORKBENCH} .tab-strip [data-tab-reorder-slot].is-group { height: 44px; border-radius: 12px; }
  }
  /* A phone's strip is too narrow to spend on words: the chip is its undo mark in the closed plugin's colour. */
  @media (max-width: 760px) {
    ${WORKBENCH} .tab-undo-chip { width: 44px; padding: 0; justify-content: center; border-radius: 12px; }
    ${WORKBENCH} .tab-undo-chip span { display: none; }
    ${WORKBENCH} .tab-undo-chip svg { width: 16px; height: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    ${GROUP}, ${WORKBENCH} .tab-undo-chip { transition: none; animation: none; }
  }
`;
