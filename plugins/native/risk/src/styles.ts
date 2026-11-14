/** The risk page's style sheet; the client bundle carries it minified (tooling/minify-styles.mjs). Only the design system's semantic variables. */
export const RISK_STYLES = `
[data-risk=workbench] [hidden]{display:none!important}
.rk{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;padding:12px 16px 72px;background:var(--paper);color:var(--ink)}
.rk>*{max-width:960px;margin-inline:auto}
[data-risk-side] .rk{padding:8px 10px 48px}
.rk-back{margin-bottom:4px}
.rk .mw-frame{height:auto;background:transparent}
.rk .mw-frame__header{padding:8px 0 12px;align-items:center}
.rk .mw-frame__panel{overflow:visible;padding:4px 0 0}
[data-risk-side] .rk .mw-frame__header{padding:4px 0 8px;gap:8px}
.rk-muted{color:var(--muted);font-size:var(--type-body-size,13px);margin:4px 0}
.rk-label{display:block;color:var(--muted);font-size:var(--type-note-size,12px);font-weight:var(--weight-control);margin:0 0 4px}
.rk-h{display:flex;align-items:center;gap:8px;margin:0;font-size:var(--type-body-size,13px);font-weight:var(--weight-control)}
.rk-count{color:var(--muted);font-size:var(--type-note-size,12px);font-weight:var(--weight-body)}
.rk-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:12px}
.rk-filter{display:inline-flex;align-items:center;gap:6px;font-size:var(--type-note-size,12px);color:var(--muted);white-space:nowrap}
.rk-filters .rk-count{margin-left:auto}
.rk-group+.rk-group,.rk-closed{margin-top:16px}
.rk .mw-items{width:100%}
.rk-group .mw-items{margin-top:6px}
.rk-row{cursor:pointer}
.rk-row:focus-visible{outline:var(--focus-stroke);outline-offset:-2px}
.rk-row__text{flex:1;min-width:0}
.rk-row strong{display:block;font-weight:var(--weight-control);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rk-row small{display:block;color:var(--muted);font-size:var(--type-note-size,12px)}
.rk-mark{flex:none}
.rk-owner{display:inline-flex;align-items:center;gap:4px;color:var(--ink-soft);font-size:var(--type-note-size,12px);white-space:nowrap}
.rk-owner svg{width:14px;height:14px}
.rk-more{display:flex;justify-content:center;margin-top:8px}
.rk-two{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:start}
.rk-col{display:flex;flex-direction:column;gap:20px;min-width:0}
.rk-compact{display:flex;flex-direction:column;gap:16px}
.rk-chead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rk-kv{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:-8px}
@media (max-width:720px){.rk-two{grid-template-columns:minmax(0,1fr)}}
.rk-sec{display:flex;flex-direction:column;gap:8px}
.rk-sec__head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
.rk-prose{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
.rk-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.rk-actions--end{justify-content:flex-end}
.rk-anchor{position:relative;display:inline-flex}
.rk-pop{position:absolute;top:calc(100% + 4px);left:0;z-index:5;min-width:220px}
.rk-side .rk-pop,.rk-compact .rk-pop{left:auto;right:0}
.rk-pop--form{width:min(320px,80vw)}
.rk-pop--form form{display:flex;flex-direction:column;gap:6px}
.rk-status-btn{gap:4px}
.rk-status-btn svg{width:14px;height:14px}
.rk-dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 12px;margin:0;align-items:center}
.rk-dl dt{color:var(--muted);font-size:var(--type-note-size,12px)}
.rk-dl dd{margin:0;min-width:0}
.rk-gridrow{display:flex;align-items:center;gap:10px}
.rk-badges{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.rk-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}
.rk-note{display:flex;gap:6px}
.rk-note input{flex:1;min-width:0}
.rk-log{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.rk-log>li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:10px;align-items:start;font-size:var(--type-body-size,13px)}
.rk-log .mw-source__icon{display:flex;color:var(--muted);padding-top:2px}
.rk-log .mw-source__icon svg{width:14px;height:14px}
.rk-log .mw-source__meta{display:block;color:var(--muted);font-size:var(--type-note-size,12px)}
.rk-quote{display:block;margin-top:2px;padding-left:8px;border-left:2px solid var(--line);color:var(--ink-soft);white-space:pre-wrap;overflow-wrap:anywhere}
.rk-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rk-link{display:flex;align-items:center;gap:4px}
.rk-link__slot{flex:1;min-width:0;display:block;min-height:40px}
.rk-found{list-style:none;margin:4px 0 0;padding:0;max-height:240px;overflow:auto}
.rk-found:empty{display:none}
.rk-found__item{cursor:pointer}
.rk-found__item[aria-disabled=true]{opacity:.5;cursor:default}
.rk-found__item strong{display:block;font-weight:var(--weight-control)}
.rk-found__item small{display:block;color:var(--muted);font-size:var(--type-note-size,12px)}
.rk-form{display:flex;flex-direction:column;gap:12px}
.rk-form__row{display:grid;grid-template-columns:auto auto minmax(160px,1fr);gap:12px;align-items:start}
[data-risk-side] .rk-form__row{grid-template-columns:minmax(0,1fr)}
@media (max-width:600px){.rk-form__row{grid-template-columns:minmax(0,1fr)}}
.rk-review{display:flex;flex-direction:column;gap:8px}
.rk-review__line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rk-review-at{font-size:var(--type-body-size,13px);color:var(--ink-soft)}
.rk-review-focus{margin:0;font-size:var(--type-body-size,13px)}
.rk-review-focus .rk-label{display:inline;margin-right:6px}
.rk-result{border:1px solid var(--line);border-radius:var(--radius-item,10px);padding:10px 12px;background:var(--surface-soft)}
.rk-result__head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.rk-result__head .rk-label{margin:0}
.rk-toasts{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:10;pointer-events:none}
.rk-toasts>*{pointer-events:auto}
`;
