/** The Goal's detail decks (focus sections). The document pane they sit in is styled in the design system's desktop-titlebar layer,
 * ahead of the desktop shell's own rule for it. */
export const FOCUS_SECTION_STYLES = `
  .focus-section-card-row { width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(136px, 1fr)); align-items: stretch; gap: 12px; }
  .focus-section-card { min-width: 0; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--rail) 72%, var(--paper)); overflow: clip; }
  /* Under reduced motion the design system's desktop-titlebar layer sets transition: none on the card. */
  @media (prefers-reduced-motion: no-preference) {
    .focus-section-card { transition: border-color 250ms var(--ease-quint), background-color 250ms var(--ease-quint), box-shadow 250ms var(--ease-quint); }
  }
  .focus-section-card.is-active { border-color: var(--ink); background: var(--paper); box-shadow: inset 0 -1px 0 var(--ink); }
  .focus-section-card-icon { width: 18px; height: 18px; color: var(--muted); display: grid; place-items: center; }
  .focus-section-card.is-active .focus-section-card-icon { color: var(--ink); }
  .focus-section-card-copy { display: grid; gap: 4px; }
  .focus-section-card-copy strong { color: var(--ink); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; text-wrap: pretty; }
  .focus-section-card-copy > small { overflow: visible; overflow-wrap: anywhere; text-wrap: pretty; }
  .focus-section-card-caret { width: 16px; height: 16px; display: grid; place-items: center; color: var(--muted); }
  .focus-section-card.is-active .focus-section-card-caret { color: var(--ink); }
  .focus-section-stage { width: 100%; margin-top: 12px; display: grid; align-items: start; }
  .focus-section-card-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; clip-path: inset(0 0 10% 0 round 12px); border-radius: 12px; box-shadow: inset 0 0 0 1px transparent; }
  .focus-section-card-reveal.is-active { grid-template-rows: 1fr; opacity: 1; visibility: visible; clip-path: inset(0 0 0 0); background: color-mix(in srgb, var(--rail) 46%, var(--paper)); box-shadow: inset 0 0 0 1px var(--line); }
  .focus-section-card-content { overflow: hidden; padding: 0 24px; color: var(--ink-soft); }
  .focus-section-card-reveal.is-active .focus-section-card-content { padding: 24px 24px 24px; }
  @container (max-width: 700px) {
    .focus-section-card-row { gap: 8px; }
    .focus-section-card-reveal.is-active .focus-section-card-content { padding: 16px 16px 24px; }
  }
  @container (max-width: 430px) {
    .focus-section-card-row { grid-template-columns: minmax(0, 1fr); }
  }
`;
