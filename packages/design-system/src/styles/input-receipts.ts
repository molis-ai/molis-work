/**
 * The receipt under a supplement (`createInputReceipts`). Tokens only, so both themes come from the palette. Each kind of content
 * has its own container and colour: the fact is a solid chip in its state's colour, the run record a green ground, the model's
 * claim a dashed chip and a dashed accent ground with a 「AI 说」 tag, never a dot or a check, so a claim cannot read as a
 * fact. The fact and the claim share one line when they fit.
 */
export const INPUT_RECEIPTS_STYLES = `
.mw-receipt{display:block;margin:6px 0 0;max-width:100%;color:var(--muted);font-size:12px;line-height:1.5;text-align:left}
.mw-receipt>summary{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;list-style:none;cursor:pointer;border-radius:var(--r-tag)}
.mw-receipt>summary::-webkit-details-marker{display:none}
.mw-receipt>summary:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.mw-receipt__fact{display:inline-flex;align-items:center;gap:6px;min-height:22px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,currentColor 10%,transparent)}
.mw-receipt__fact::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.mw-receipt__fact::after{content:"";flex:none;width:5px;height:5px;margin:-3px 0 0 2px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);opacity:.6;transition:transform var(--dur-hover,130ms) var(--ease-quint)}
.mw-receipt[open] .mw-receipt__fact::after{margin-top:3px;transform:rotate(-135deg)}
.mw-receipt[data-state=read] .mw-receipt__fact{color:var(--green)}
.mw-receipt:is([data-state=unread],[data-state=waiting]) .mw-receipt__fact,.mw-receipt__ask{color:var(--amber)}
.mw-receipt[data-state=withdrawn] .mw-receipt__fact::before{background:none;box-shadow:inset 0 0 0 1px currentColor}
.mw-receipt__claim{display:inline-flex;align-items:center;min-height:22px;padding:0 8px 0 3px;border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);border-radius:999px;background:var(--accent-soft);color:var(--ink-soft)}
.mw-receipt__ask,.mw-receipt__link{flex-basis:100%;padding-left:8px}
.mw-receipt__claim b{margin-right:6px;padding:0 6px;border-radius:999px;background:var(--paper);color:var(--accent);font-weight:var(--weight-control)}
.mw-receipt__body{display:grid;gap:8px;margin-top:8px}
.mw-receipt__body :where(dl,dd,p,ul){margin:0}
.mw-receipt__body dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:2px 12px}
.mw-receipt__body dd{color:var(--ink-soft);overflow-wrap:anywhere}
.mw-receipt__facts,.mw-receipt__claimed{padding:8px 10px;border-radius:var(--r-row)}
.mw-receipt__facts{background:var(--green-soft)}
.mw-receipt__claimed{border:1px dashed color-mix(in srgb,var(--accent) 40%,transparent);background:var(--accent-soft)}
.mw-receipt__who{margin-bottom:-4px;font-weight:var(--weight-control)}
.mw-receipt__who:has(+.mw-receipt__facts){color:var(--green)}
.mw-receipt__claimed>.mw-receipt__who{margin-bottom:6px;color:var(--accent)}
.mw-receipt__note{color:var(--faint);font-size:11px}
.mw-receipt__body dt{color:var(--muted)}
.mw-receipt__acts{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.mw-tray__list{display:grid;gap:4px;padding:0;list-style:none}
.mw-receipt__problem{color:var(--danger)}
.mw-receipt--host{font-style:normal}
@media (prefers-reduced-motion:reduce){.mw-receipt__fact::after{transition:none}}
`;
