export const STATE_RING_STYLES = `
  .mw-state-ring {
    --ring-neutral: var(--ink); --ring-success: var(--green); --ring-attention: var(--amber);
    --ring-danger: var(--red); --ring-interruption: var(--status-interruption);
    display: inline-block; flex: none; vertical-align: middle; overflow: visible;
    /* As tall as the words beside it (DESIGN「Order」): 1em and the stroke's reach, so 12px words carry a 14px mark. A ring
       that stands alone (an empty state, a result) is given its size. */
    width: var(--ring-size, calc(1em + 2px)); height: var(--ring-size, calc(1em + 2px));
    fill: none; stroke: var(--ring-neutral); stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round;
  }
  .mw-state-ring path { transition: stroke var(--dur-move, 250ms) var(--ease-quint); }
  .mw-state-ring [data-ring-segments] > path { stroke-width: var(--ring-stroke, 2.585); }
  .mw-state-ring [data-ring-tone=success], .mw-state-ring[data-ring-family=done] [data-ring-core] { stroke: var(--ring-success); }
  .mw-state-ring [data-ring-tone=attention], .mw-state-ring[data-ring-family=verify] [data-ring-core] { stroke: var(--ring-attention); }
  .mw-state-ring [data-ring-tone=danger] { stroke: var(--ring-danger); }
  .mw-state-ring [data-ring-tone=interruption] { stroke: var(--ring-interruption); }
  .mw-state-ring [data-ring-core] { stroke-width: calc(var(--ring-stroke, 2.585) * .8); }
  [data-mw-state]:not(svg) > .mw-state-ring { margin-inline-end: 5px; }
  [data-mw-state][aria-hidden=true] > .mw-state-ring, .assistant-state-ring > .mw-state-ring { margin: 0; }
  .mw-btn--primary .mw-state-ring, .mw-btn--danger .mw-state-ring { --ring-neutral: currentColor; }
  .mw-spinner > .mw-state-ring { width: 100%; height: 100%; }
  @media (prefers-reduced-motion: reduce) { .mw-state-ring path { transition: none; } }
`;
