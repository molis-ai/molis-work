/**
 * The receipt under a supplement (`createInputReceipts`). Tokens only, so both themes come from the palette. The fact line
 * has a solid dot; the model's claim has a dashed rule and a dashed 「AI 说」 tag, never a dot or a check, so a claim
 * cannot read as a fact.
 */
export const INPUT_RECEIPTS_STYLES = `
.mw-receipt{display:block;margin:6px 0 0;max-width:100%;color:var(--muted);font-size:12px;line-height:1.5;text-align:left}
.mw-receipt>summary{display:grid;gap:2px;justify-items:start;list-style:none;cursor:pointer;border-radius:var(--r-tag)}
.mw-receipt>summary::-webkit-details-marker{display:none}
.mw-receipt>summary:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.mw-receipt__fact{display:inline-flex;align-items:center;gap:6px}
.mw-receipt__fact::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.mw-receipt__fact::after{content:"";flex:none;width:5px;height:5px;margin:-3px 0 0 2px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);opacity:.6;transition:transform var(--dur-hover,130ms) var(--ease-quint)}
.mw-receipt[open] .mw-receipt__fact::after{margin-top:3px;transform:rotate(-135deg)}
.mw-receipt[data-state=read] .mw-receipt__fact{color:var(--ink-soft)}
.mw-receipt:is([data-state=unread],[data-state=waiting]) .mw-receipt__fact,.mw-receipt__ask{color:var(--amber)}
.mw-receipt[data-state=withdrawn] .mw-receipt__fact::before{background:none;box-shadow:inset 0 0 0 1px currentColor}
.mw-receipt__claim{padding-left:10px;border-left:2px dashed var(--faint)}
.mw-receipt__ask,.mw-receipt__link{padding-left:12px}
.mw-receipt__claim b{margin-right:6px;padding:0 5px;border:1px dashed currentColor;border-radius:var(--r-tag);font-weight:var(--weight-control)}
.mw-receipt__body{display:grid;gap:8px;margin-top:6px;padding:8px 10px;border-radius:var(--r-row);background:var(--wash)}
.mw-receipt__body dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:2px 12px;margin:0}
.mw-receipt__body dd{margin:0;color:var(--ink-soft);overflow-wrap:anywhere}
.mw-receipt__note,.mw-receipt__who,.mw-receipt__problem{margin:0}
.mw-receipt__claimed{padding:6px 8px;border:1px dashed var(--faint);border-radius:var(--r-row)}
.mw-receipt__who{margin-bottom:4px;font-weight:var(--weight-control)}
.mw-receipt__acts{display:flex;flex-wrap:wrap;gap:6px}
.mw-tray__list{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.mw-receipt__problem{color:var(--danger)}
.mw-receipt--host{font-style:normal}
@media (prefers-reduced-motion:reduce){.mw-receipt__fact::after{transition:none}}
`;
