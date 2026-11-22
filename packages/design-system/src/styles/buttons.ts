/** Shared button presentation, used by the workbench and embedded conversations. */
export const CONTAINED_FOCUS = "outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: var(--focus-stroke-inset, 1px); box-shadow: none";
export const BUTTON_STYLES = `
  .mw-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border: 1px solid transparent;
    border-radius: var(--radius-control, 8px);
    background: var(--control-fill);
    color: var(--ink);
    font: inherit;
    font-size: var(--type-control-size);
    font-weight: var(--weight-control);
    line-height: var(--type-control-line-height);
    letter-spacing: -.01em;
    box-shadow: none;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    appearance: none;
    transition-property: background-color, color, border-color, box-shadow, opacity, transform;
    transition-duration: var(--dur-hover);
    transition-timing-function: var(--ease-quint), var(--ease-quint), var(--ease-quint), var(--ease-quint), var(--ease-quint), var(--ease-spring);
    &:active:not(:disabled) { transform: scale(.985); }
    svg { width: 14px; height: 14px; flex: none; }
    /* Disabled reads as switched off, not as a faded live button: muted words, and the filled kinds give up their fill for a flat wash.
       A loading button keeps its own look. */
    &:disabled:not([data-loading]) { cursor: not-allowed; color: color-mix(in srgb, var(--ink) 35%, transparent); box-shadow: none; }
    /* With an icon the button keeps its words while it works: the spinner takes the icon's slot, so the width holds. */
    > .mw-spinner { display: inline-grid; place-items: center; width: 16px; height: 16px; }
    &[data-loading] {
      pointer-events: none;
      > :not(.mw-spinner) { visibility: hidden; animation: mw-loading-out var(--dur-move) var(--ease-quint) var(--dur-move) backwards; }
      > .mw-spinner { position: absolute; visibility: visible; animation: mw-loading-in var(--dur-move) var(--ease-quint) var(--dur-move) both; }
      > svg { display: none; }
      &:has(> svg) {
        > [data-slot="button-label"] { visibility: visible; animation: none; }
        > .mw-spinner { position: static; width: 14px; height: 14px; }
      }
    }
  }
  @media (prefers-reduced-motion: reduce) { .mw-btn:active:not(:disabled) { transform: none; } }
  .mw-btn:focus-visible { ${CONTAINED_FOCUS}; }
  .mw-btn:is(.mw-btn--primary, .mw-btn--secondary, .mw-btn--danger):disabled:not([data-loading]) {
    border-color: transparent; background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  body .mw-btn:active { filter: none; }
  .mw-btn--sm { min-height: 28px; }
  .mw-btn--md { min-height: 32px; }
  .mw-btn--lg { min-height: 36px; padding-inline: 16px; svg { width: 16px; height: 16px; } }
  .mw-btn--icon, .mw-btn--icon-only {
    width: var(--control-h);
    min-width: var(--control-h);
    padding: 0;
    &.mw-btn--sm { width: 28px; min-width: 28px; min-height: 28px; }
  }
  .mw-btn--primary {
    border-color: var(--action);
    background: var(--action);
    color: var(--action-ink);
    box-shadow: var(--lift-1), inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);
    &:hover:not(:disabled), &[aria-pressed="true"]:not(:disabled) {
      background: var(--action-hover);
      border-color: var(--action-hover);
      box-shadow: var(--lift-1), inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent);
    }
  }
  .mw-btn--primary:is(:active, [aria-expanded="true"]):not(:disabled) {
    background: var(--action-hover, var(--action)); border-color: var(--action-hover, var(--action));
  }
  /* Secondary is a crisp paper-bordered action that reads cleanly on both sunlit sheets and recessed wells. */
  .mw-btn--secondary {
    border-color: var(--control-border);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 1px 1.5px color-mix(in srgb, var(--shadow-color) 4%, transparent), inset 0 1px 0 var(--edge-highlight);
    &:hover:not(:disabled) { border-color: var(--line-strong); background: var(--surface-soft); }
  }
  .mw-btn--ghost {
    border-color: transparent; background: transparent; color: var(--ink-soft);
    &:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink); }
    /* A ghost with words keeps an outline, so a button never reads as plain text; one that is only an icon stays bare. */
    &:not(.mw-btn--icon, .mw-btn--icon-only) { border-color: var(--line-strong); }
  }
  /* Pressed/expanded state on ghost & secondary uses low-specificity :where() after base rules so it wins over
     .mw-btn--ghost without overriding higher-specificity page option pills (Batch 03 / VUX-55). */
  :where(.mw-btn--secondary, .mw-btn--ghost):where([aria-expanded="true"], [aria-pressed="true"]):not(:disabled) {
    background: var(--nav-active);
    color: var(--ink);
  }
  :is(.mw-btn--secondary, .mw-btn--ghost):active:not(:disabled) { background: var(--nav-press); }
  /* Danger is a red wash with red words: it warns without shouting louder than the primary beside it. */
  .mw-btn--danger {
    border-color: color-mix(in srgb, var(--red) 18%, transparent);
    background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red);
    &:hover:not(:disabled) { background: color-mix(in srgb, var(--red) 16%, transparent); }
    &:active:not(:disabled) { background: color-mix(in srgb, var(--red) 22%, transparent); }
  }
  .mw-btn--danger-outline {
    border-color: color-mix(in srgb, var(--red) 30%, transparent);
    background: transparent;
    color: var(--red);
    &:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--red) 46%, var(--control-border));
      background: color-mix(in srgb, var(--red) 8%, var(--paper));
    }
    &:disabled { border-color: var(--line); }
  }
  .mw-btn--link {
    min-height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-weight: var(--weight-control);
    box-shadow: none;
    &:hover:not(:disabled) {
      color: var(--accent-strong);
      text-decoration: underline;
      text-underline-offset: 3px;
      background: transparent;
    }
    &:active:not(:disabled) { color: var(--accent-strong); }
    &:focus-visible { box-shadow: none; outline: var(--focus-stroke); outline-offset: 2px; }
  }
  @keyframes mw-loading-out { from { opacity: 1; visibility: visible; } to { opacity: 0; visibility: hidden; } }

`;
