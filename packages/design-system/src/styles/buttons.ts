/** Shared button presentation, used by the workbench and embedded conversations. */
export const CONTAINED_FOCUS = "outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: var(--focus-stroke-inset, 1px); box-shadow: none";
export const BUTTON_STYLES = `
  .mw-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--control-h, 32px);
    padding: 0 var(--control-pad-x, 12px);
    border: 1px solid transparent;
    border-radius: var(--radius-control, 8px);
    background: var(--control-fill);
    color: var(--ink);
    font: inherit;
    font-size: var(--type-control-size, 13px);
    font-weight: var(--weight-control, 500);
    line-height: var(--type-control-line-height, 1);
    letter-spacing: -.01em;
    box-shadow: none;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    appearance: none;
    -webkit-appearance: none;
    transition:
      background-color var(--dur-hover, 130ms) var(--ease-quint),
      color var(--dur-hover, 130ms) var(--ease-quint),
      border-color var(--dur-hover, 130ms) var(--ease-quint),
      box-shadow var(--dur-hover, 130ms) var(--ease-quint),
      opacity var(--dur-hover, 130ms) var(--ease-quint);
  }
  body .mw-btn:active { filter: none; }
  .mw-btn svg { width: 14px; height: 14px; flex: none; }
  .mw-btn--sm { min-height: 28px; }
  .mw-btn--md { min-height: 32px; }
  .mw-btn--lg { min-height: 36px; padding-inline: 16px; }
  .mw-btn--lg svg { width: 16px; height: 16px; }
  .mw-btn--icon, .mw-btn--icon-only {
    width: var(--control-h, 28px);
    min-width: var(--control-h, 28px);
    padding: 0;
  }
  .mw-btn--icon.mw-btn--sm, .mw-btn--icon-only.mw-btn--sm {
    width: 28px; min-width: 28px; min-height: 28px;
  }
  .mw-btn:focus-visible { ${CONTAINED_FOCUS}; }
  .mw-btn--primary {
    border-color: var(--action);
    background: var(--action);
    color: var(--action-ink);
    box-shadow: var(--lift-1);
  }
  .mw-btn--primary:hover:not(:disabled) {
    background: var(--action-hover, color-mix(in srgb, var(--action) 90%, var(--action-ink)));
    border-color: var(--action-hover, var(--action));
    color: var(--action-ink);
    box-shadow: var(--lift-1);
  }
  .mw-btn--primary:is(:active, [aria-expanded="true"]):not(:disabled) {
    background: var(--action-hover, var(--action)); border-color: var(--action-hover, var(--action));
  }
  /* Secondary is the soft button: a wash on whatever surface it sits on, no outline. Its size is the button's own
     (.mw-btn and --sm, --md, --lg), so a small secondary stands as tall as the small primary and ghost beside it. */
  .mw-btn--secondary { background: var(--control-fill); color: var(--ink); }
  .mw-btn--secondary:hover:not(:disabled) {
    border-color: transparent;
    background: var(--nav-hover);
  }
  .mw-btn--secondary:active:not(:disabled),
  .mw-btn--ghost:active:not(:disabled) {
    background: var(--nav-press);
  }
  .mw-btn--ghost { border-color: transparent; background: transparent; color: var(--ink-soft); }
  .mw-btn--ghost:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink); }
  /* A ghost with words keeps an outline, so a button never reads as plain text; one that is only an icon stays bare. */
  .mw-btn--ghost:not(.mw-btn--icon, .mw-btn--icon-only) { border-color: var(--line-strong); }
  /* Danger is a red wash with red words: it warns without shouting louder than the primary beside it. */
  .mw-btn--danger { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
  .mw-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--red) 16%, transparent); }
  .mw-btn--danger:active:not(:disabled) { background: color-mix(in srgb, var(--red) 22%, transparent); }
  .mw-btn--danger-outline {
    border-color: color-mix(in srgb, var(--red) 30%, transparent);
    background: transparent;
    color: var(--red);
  }
  .mw-btn--danger-outline:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--red) 46%, var(--control-border));
    background: color-mix(in srgb, var(--red) 8%, var(--paper));
  }
  .mw-btn--link {
    min-height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-weight: var(--weight-control, 500);
    box-shadow: none;
  }
  .mw-btn--link:hover:not(:disabled) {
    color: var(--accent-strong, var(--accent));
    text-decoration: underline;
    text-underline-offset: 3px;
    background: transparent;
  }
  .mw-btn--link:active:not(:disabled) { color: var(--accent-strong, var(--accent)); }
  .mw-btn--link:focus-visible { box-shadow: none; outline: var(--focus-stroke); outline-offset: 2px; }
  /* Disabled reads as switched off, not as a faded live button: muted words, and the filled kinds give up their fill for a flat wash.
     A loading button keeps its own look. */
  .mw-btn:disabled:not([data-loading]) { cursor: not-allowed; color: color-mix(in srgb, var(--ink) 35%, transparent); box-shadow: none; }
  .mw-btn:is(.mw-btn--primary, .mw-btn--secondary, .mw-btn--danger):disabled:not([data-loading]) {
    border-color: transparent; background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .mw-btn--danger-outline:disabled { border-color: var(--line); }
  .mw-btn[data-loading] { pointer-events: none; }
  .mw-btn[data-loading] > :not(.mw-spinner) { visibility: hidden; animation: mw-loading-out var(--dur-move) var(--ease-quint) var(--dur-move) backwards; }
  .mw-btn[data-loading] > .mw-spinner { position: absolute; visibility: visible; animation: mw-loading-in var(--dur-move) var(--ease-quint) var(--dur-move) both; }
  /* With an icon the button keeps its words while it works: the spinner takes the icon's slot, so the width holds. */
  .mw-btn > .mw-spinner { display: inline-grid; place-items: center; width: 16px; height: 16px; }
  .mw-btn[data-loading]:has(> svg) > [data-slot="button-label"] { visibility: visible; animation: none; }
  .mw-btn[data-loading] > svg { display: none; }
  .mw-btn[data-loading]:has(> svg) > .mw-spinner { position: static; width: 14px; height: 14px; }
  @keyframes mw-loading-out { from { opacity: 1; visibility: visible; } to { opacity: 0; visibility: hidden; } }

`;
