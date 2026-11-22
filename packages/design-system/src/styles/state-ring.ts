export const STATE_RING_STYLES = `
  .mw-state-ring {
    --ring-neutral: var(--ink); --ring-success: var(--green); --ring-attention: var(--amber);
    --ring-danger: var(--red); --ring-interruption: var(--status-interruption);
    display: inline-block; flex: none; vertical-align: middle; overflow: visible;
    width: var(--ring-size, calc(1em + 2px)); height: var(--ring-size, calc(1em + 2px));
    fill: none; stroke: var(--ring-neutral); stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round;
    path { transition: stroke var(--dur-move, 250ms) var(--ease-quint); @media (prefers-reduced-motion: reduce) { transition: none; } }
    [data-ring-segments] > path { stroke-width: var(--ring-stroke, 2.585); }
    [data-ring-tone=success], &[data-ring-family=done] [data-ring-core] { stroke: var(--ring-success); }
    [data-ring-tone=attention], &[data-ring-family=verify] [data-ring-core] { stroke: var(--ring-attention); }
    [data-ring-tone=danger] { stroke: var(--ring-danger); }
    [data-ring-tone=interruption] { stroke: var(--ring-interruption); }
    [data-ring-core] { stroke-width: calc(var(--ring-stroke, 2.585) * .8); }
  }
  [data-mw-state]:not(svg) > .mw-state-ring { margin-inline-end: 5px; }
  :is([data-mw-state][aria-hidden=true], .assistant-state-ring) > .mw-state-ring { margin: 0; }
  :is(.mw-btn--primary, .mw-btn--danger) .mw-state-ring { --ring-neutral: currentColor; }
  .mw-spinner > .mw-state-ring { width: 100%; height: 100%; }
  .mw-state-ring--fixed { --ring-size: 20px; width: 20px; height: 20px; }
`;
