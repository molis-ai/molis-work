/**
 * The conversation around the shared interaction parts: turns, the AI mark, the jump to the latest message and the
 * collapsed question. The parts themselves are styled by the design system's INTERACTION_STYLES.
 */
export const cardStyles = `
.ix-thread { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 18px; padding: 18px 20px 20px; outline: 0; }
.ix-thread:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.cd-main .ix-thread { width: 100%; max-width: 780px; margin: 0 auto; padding: 20px 24px; }
.ix-turn--person { align-self: flex-end; max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--rail); color: var(--ink); }
.ix-turn--ai { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; }
.ix-ai-mark { padding-top: 2px; color: var(--accent); }
.ix-turn-body { display: grid; gap: 10px; min-width: 0; }
.ix-turn-body > p { color: var(--ink); }
.ix-turn[data-op-turn]:not([hidden]) { animation: pv-arrive var(--dur-arrive) var(--ease-quint); }
.ix-jump { position: absolute; left: 50%; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: 999px;
  background: var(--action); color: var(--action-ink); font-size: 12px; box-shadow: var(--lift-3); transform: translateX(-50%); }
.ix-collapsed { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--r-card); background: var(--rail); color: var(--ink); text-align: left; }
.ix-collapsed:hover { background: var(--nav-hover); }
.ix-collapsed-title { font-weight: var(--weight-control, 500); }
.ix-collapsed-meta { margin-left: auto; color: var(--muted); font-size: 12px; }
.cd-composer-row .mw-ix-steps { --mw-ix-step-h: 40px; }
.cd-shell .mw-ix-into { justify-self: start; }
@media (max-width: 600px) {
  .ix-thread, .cd-main .ix-thread { padding: 14px 12px 16px; }
  .ix-turn--ai { grid-template-columns: minmax(0, 1fr); }
  .ix-ai-mark { display: none; }
  .cd-composer-row .mw-ix-steps { --mw-ix-step-h: 44px; }
  .scene--assistant .mw-ix-steps { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); justify-content: flex-start; }
}
`;
