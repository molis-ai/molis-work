/** The one toast (DESIGN「Toasts」), part of the primitives every product page loads. */
export const TOAST_STYLES = `
  /* The one toast (DESIGN「Toasts」): a graphite capsule as wide as its words, a state mark on its first line when it says how
     something went (data-mw-state mounts it), an action in its own ink and the main one a light chip. Where it sits is the host's: centred by inset and
     auto margins, never by transform, so the arrival below and a failure's nudge move it without fighting the placement. */
  :where(.mw-toast) { position: relative; }
  .mw-toast {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
    width: max-content; max-width: calc(100vw - 32px); padding: 15px 18px; border: 0; border-radius: 14px;
    background: var(--tip-bg, var(--action)); color: var(--tip-ink); box-shadow: var(--shadow);
    font-size: 13px; line-height: 18px; animation: mw-toast-in var(--dur-move) var(--ease-quint) both;
    &[hidden] { display: none; }
    &[data-ring-mounted] { padding-left: 38px; }
    > .mw-state-ring { --ring-neutral: currentColor; --ring-success: color-mix(in srgb, var(--green) 60%, currentColor); --ring-danger: color-mix(in srgb, var(--red) 60%, currentColor); position: absolute; left: 14px; top: 16.5px; }
    &.is-error { animation: mw-toast-in var(--dur-move) var(--ease-quint) both, mw-toast-nudge var(--dur-arrive) var(--ease-quint) var(--dur-hover); }
    .mw-btn[data-molis-call-id] { min-height: 0; padding-block: var(--reach, 10px); margin-block: calc(-1 * var(--reach, 10px)); color: inherit; text-decoration: underline; }
  }
  @media (prefers-reduced-motion: reduce) { .mw-toast, .mw-toast.is-error { animation: none; } }
  .mw-toast--host { position: fixed; inset-inline: 0; bottom: calc(var(--dock-h, var(--helm-h, 74px)) + 14px); margin-inline: auto; z-index: 90; pointer-events: none; }
  .mw-date-input { font-variant-numeric: tabular-nums; }
  .mw-date-wrap { position: relative; display: inline-flex; align-items: center; max-width: 100%; > .mw-date-input { padding-inline-end: 28px; } }
  .mw-date-clear { position: absolute; right: 4px; display: inline-grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; &:hover { background: var(--nav-hover); color: var(--ink); } &[hidden] { display: none; } }
  .mw-toast__action {
    min-height: 28px; margin-block: -5px; margin-inline-end: -4px; padding: 0 12px; border: 0; border-radius: 999px;
    background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint);
    &:where(:not(.mw-toast__action ~ *, :has(~ .mw-toast__action))) { background: color-mix(in srgb, currentColor 12%, transparent); }
    &:hover { background: color-mix(in srgb, currentColor 18%, transparent); }
    &:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  }
  .mw-toast__action--primary {
    background: var(--tip-ink); color: var(--tip-bg);
    &:hover { background: color-mix(in srgb, var(--tip-ink) 86%, var(--tip-bg)); }
  }
  @keyframes mw-toast-in { from { opacity: 0; transform: translateY(12px) scale(.97); } }
  @keyframes mw-toast-nudge { 0%, 100% { translate: 0; } 25% { translate: -4px; } 50% { translate: 3px; } 75% { translate: -2px; } }
`;
