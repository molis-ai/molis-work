/**
 * Ways out and ways back (specs/page-interaction-flow). Appended right after the Soft Workbench final layer on the
 * workbench and settings pages, so it speaks the same tokens and wins over nothing but its own selectors.
 */
const WORKBENCH = "body.immersive-workbench";

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

  /* The switcher names a cover the way it names a plugin. */
  ${WORKBENCH} .plugin-picker-chip.is-cover svg { color: var(--ink-soft); }
`;
