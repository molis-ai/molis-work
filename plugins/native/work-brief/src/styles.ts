/**
 * The brief page's style sheet; the client bundle carries it minified (tooling/minify-styles.mjs). Controls, cards, notices and marks
 * are the design system's `mw-*`; this only places them, with the design system's semantic variables.
 */
export const WORK_BRIEF_STYLES = `
[data-work-brief=workbench] [hidden]{display:none!important}
.wb{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;padding:16px 20px 72px;background:var(--paper);color:var(--ink)}
.wb-frame{min-width:0;max-width:960px;margin-inline:auto}
.wb-frame .mw-frame__panel{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:28px}
.wb-frame .mw-items{width:100%;grid-template-columns:minmax(0,1fr);align-content:start}
.wb-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.wb-sec{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.wb-sec .mw-items{width:100%;grid-template-columns:minmax(0,1fr)}
.wb-h{margin:0;font-size:13px;font-weight:var(--weight-control,560);color:var(--ink-soft)}
.wb-muted{margin:0;font-size:12px;color:var(--muted)}
.wb-pulse{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px}
.wb-pulse li{display:inline-flex;align-items:center;gap:8px;min-width:0}
.wb-plug{font-size:13px;color:var(--ink);white-space:nowrap}
.wb-claims{margin:0;padding:0 0 0 20px;display:grid;gap:12px}
.wb-claims>li{padding-left:4px;position:relative;border-radius:var(--r-control)}
.wb-claims>li::marker{color:var(--muted);font-size:12px}
.wb-claims .wb-anchor{position:static}
.wb-claim__text{max-width:60ch;font-size:14px;line-height:1.65;color:var(--ink)}
.wb-claim__text .mw-badge{margin-inline-end:6px;vertical-align:1px}
.wb-claim__edit{margin-inline-start:4px;vertical-align:middle;opacity:0;transition:opacity var(--dur-fast,120ms) var(--ease-out,ease-out)}
.wb-claim:hover .wb-claim__edit,.wb-claim:focus-within .wb-claim__edit{opacity:1}
@media (hover:none){.wb-claim__edit{opacity:1}}
.wb-claim>.mw-alert,.wb-claim>.wb-now{margin-top:8px}
.wb-now{margin:0;font-size:13px;line-height:1.6;color:var(--ink-soft);padding:8px 12px;border-radius:var(--r-control);background:var(--surface-soft);max-width:60ch}
.wb-thennow{display:flex}
.wb-basis{margin:4px 0 0;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.wb-basis svg{width:14px;height:14px;flex:none}
.wb-anchor{position:relative;display:inline-block}
.wb-fn{margin-inline-start:4px;height:18px;min-width:22px;padding:0 5px;border:0;border-radius:var(--r-tag);background:var(--accent-soft);color:var(--accent);font:500 11px/18px inherit;font-variant-numeric:tabular-nums;vertical-align:2px;cursor:pointer;transition:background var(--dur-fast,120ms) var(--ease-out,ease-out)}
.wb-fn:hover,.wb-fn[aria-expanded=true]{background:color-mix(in srgb,var(--accent) 22%,transparent)}
.wb-fn[data-stale]{background:var(--surface-soft);color:var(--muted);box-shadow:inset 0 0 0 1px var(--line-strong)}
.wb-fn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wb-pop{position:absolute;z-index:30;top:calc(100% + 6px);left:0;right:0;width:auto;max-width:360px;transform-origin:top left;animation:craft-drop var(--dur-move) var(--ease-quint,ease-out) both;display:grid;gap:10px;padding:12px}
.wb-pop--end{left:auto;right:0;width:max-content;max-width:min(420px,calc(100vw - 32px));transform-origin:top right}
.wb-pop .mw-preview-card{box-shadow:none;padding:0;background:none}
.wb-pop-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wb-pop-foot>.wb-slot{flex:1 1 100%}
.wb-pop-foot>.mw-btn{margin-inline-start:auto}
.wb-pop-note{margin:0;max-width:280px;font-size:12px;color:var(--muted)}
.wb-slot{min-width:0;max-width:100%}
.wb-conflict{display:grid;gap:10px;padding:14px;border-radius:var(--r-card);background:var(--surface-soft);box-shadow:inset 0 0 0 1px var(--line)}
.wb-conflict__title{margin:0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:var(--weight-control,560)}
.wb-conflict__title svg{width:16px;height:16px;color:var(--tone-attention)}
.wb-conflict__pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wb-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.wb-actions--end{justify-content:flex-end;width:100%}
.wb-edit{display:grid;gap:8px;max-width:60ch}
.wb-att{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.wb-att>li{display:grid;gap:6px;padding:12px;border-radius:var(--r-card);background:var(--surface-soft)}
.wb-att__why{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
.wb-change{flex-wrap:wrap}
.wb-next{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:12px;align-items:start}
.wb-step__why{margin:0;font-size:13px;line-height:1.6;color:var(--ink-soft)}
.wb-step__target{margin:6px 0 0;font-size:12px;color:var(--muted)}
.wb-step .mw-card__panel{display:grid;gap:6px}
.wb-personal .mw-item{align-items:center}
.wb-toasts{position:absolute;inset-inline:0;bottom:20px;display:grid;justify-items:center;pointer-events:none;z-index:40}
.wb-toasts>*{pointer-events:auto}
@media (max-width:640px){
.wb{padding:12px 12px 72px}
.wb-conflict__pair{grid-template-columns:1fr}
.wb-head-actions{justify-content:flex-start}
.wb-frame .mw-frame__header{flex-wrap:wrap}
.wb-frame .mw-frame__header>:first-child{flex:1 1 100%}
}
`;
