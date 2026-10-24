/** The one toast (DESIGN「Toasts」), part of the primitives every product page loads. */
export const TOAST_STYLES = `
  /* The one toast (DESIGN「Toasts」): a graphite capsule as wide as its words, a state mark on its first line when it says how
     something went (data-mw-state mounts it), an action in its own ink. Where it sits is the host's: centred by inset and
     auto margins, never by transform, so the arrival below and a failure's nudge move it without fighting the placement. */
  :where(.mw-toast) { position: relative; }
  .mw-toast {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; box-sizing: border-box;
    width: max-content; max-width: calc(100vw - 32px); padding: 12px 16px; border: 0; border-radius: 12px;
    background: var(--tip-bg, var(--action)); color: var(--tip-ink, var(--action-ink)); box-shadow: var(--shadow);
    font-size: 13px; line-height: 18px; animation: mw-toast-in var(--dur-move, 250ms) var(--ease-quint) both;
  }
  .mw-toast[hidden] { display: none; }
  .mw-toast[data-ring-mounted] { padding-left: 36px; }
  .mw-toast > .mw-state-ring { --ring-neutral: currentColor; --ring-success: color-mix(in srgb, var(--green) 60%, currentColor); --ring-danger: color-mix(in srgb, var(--red) 60%, currentColor); position: absolute; left: 12px; top: 13.5px; }
  .mw-toast.is-error { animation: mw-toast-in var(--dur-move, 250ms) var(--ease-quint) both, mw-toast-nudge var(--dur-arrive, 420ms) var(--ease-quint) var(--dur-hover, 130ms); }
  .mw-toast__action {
    min-height: 30px; margin-block: -6px; margin-inline-end: -8px; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer;
    transition: background-color var(--dur-hover, 130ms) var(--ease-quint);
  }
  /* A diagnostic ID is a link inside the sentence, in the toast's ink; its touch height is padding that takes no line room. */
  .mw-toast .mw-btn[data-molis-call-id] { min-height: 0; padding-block: var(--reach, 10px); margin-block: calc(-1 * var(--reach, 10px)); color: inherit; text-decoration: underline; }
  .mw-toast__action--primary { background: color-mix(in srgb, currentColor 12%, transparent); }
  .mw-toast__action:hover { background: color-mix(in srgb, currentColor 18%, transparent); }
  .mw-toast__action:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  @keyframes mw-toast-in { from { opacity: 0; transform: translateY(12px) scale(.97); } }
  @keyframes mw-toast-nudge { 0%, 100% { translate: 0; } 25% { translate: -4px; } 50% { translate: 3px; } 75% { translate: -2px; } }
  @media (prefers-reduced-motion: reduce) { .mw-toast, .mw-toast.is-error { animation: none; } }
`;
