/**
 * Styles for Batch 37-2 mainline switcher (Option A inline create + Decision 66 Personal Space top),
 * organize dialog, Option A reading-flow lightweight item first page, right-sidebar 「这件事的东西」,
 * 「放进事项」 dialog, bottom-helm scope toggle, neutral task item tag, and composer 「在：事项名 ×」 pill.
 * Uses only semantic design tokens (zero literal colours, fonts, or curves).
 */
const HOVER = "var(--dur-hover) var(--ease-quint)";
const ELLIPSIS = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

const SHEET = `
/* Decision 66: Personal Space pinned at top of left column in top-corner switcher. */
.top-corner-personal{flex:none;display:flex;align-items:center;gap:8px;width:100%;min-height:32px;box-sizing:border-box;padding:0 8px;margin-bottom:6px;border-radius:8px;color:var(--ink);font-size:13px;font-weight:500;text-decoration:none;transition:background-color ${HOVER}}
.top-corner-personal:hover{background:var(--nav-hover)}
.top-corner-personal[aria-current="page"]{background:var(--nav-active)}
.top-corner-personal>svg{flex:none;width:14px;height:14px;color:var(--accent)}
.top-corner-personal>span{flex:1;min-width:0;${ELLIPSIS}}
.top-corner-sep{flex:none;height:1px;margin:0 4px 6px;background:var(--line)}
.top-corner-item-ring{flex:none;display:inline-flex;align-items:center}
.top-corner-item-ring[hidden]{display:none}
.top-corner-item-dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.top-corner-item-dot[data-waiting="true"]{background:var(--amber)}
.top-corner-item-dot[data-state="missing"],.top-corner-item-dot[data-state="denied"]{background:var(--muted)}

/* Keep 480px total width matching top-strip.ts (200+280) so open popover never covers project-home h1 (POLISH-62),
   fixed desktop height so 「项目主页」, 「项目设置」, and 「全部项目」 never jump on async refresh, and >=32px desktop floor. */
html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-list{grid-template-columns:192px 288px;height:min(460px,calc(100dvh - 80px));max-height:min(580px,calc(100dvh - 80px))}
html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-list :is(button,a[href],input){min-height:32px;min-width:32px;box-sizing:border-box}
html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-right{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:8px}
.top-corner-pages{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
.top-corner-pages[hidden]{display:none}
.top-corner-mainline{display:flex;flex-direction:column;gap:6px;min-height:0;flex:1 1 auto}
.ml-search-wrap{flex:none;position:relative;display:flex;align-items:center}
.ml-search-wrap>svg{position:absolute;left:9px;width:13px;height:13px;color:var(--muted);pointer-events:none;z-index:1}
.ml-search-input{width:100%;height:32px;min-height:32px;padding:0 10px 0 28px;font-size:12px;box-sizing:border-box}
.ml-scroll{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px}
.ml-section-label{margin:6px 8px 2px;color:var(--muted);font-size:11px;font-weight:500;letter-spacing:.02em}
.ml-group{display:flex;flex-direction:column;gap:1px}
.ml-group-head{display:flex;align-items:center;gap:6px;width:100%;min-height:32px;padding:0 6px;border:0;border-radius:7px;background:transparent;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;text-align:left;transition:background-color ${HOVER},color ${HOVER}}
.ml-group-head:hover{background:var(--nav-hover);color:var(--ink)}
.ml-group-head>svg{flex:none;width:12px;height:12px;transition:transform ${HOVER}}
.ml-group-head[aria-expanded="true"]>svg{transform:rotate(90deg)}
.ml-group-name{flex:1 1 auto;min-width:0;${ELLIPSIS};font-weight:500;color:var(--ink-soft)}
.ml-group-count{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.ml-badge-wait{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:var(--r-tag,6px);background:var(--amber-soft);color:var(--amber);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.ml-group-items{display:flex;flex-direction:column;gap:1px;padding-left:6px}
.ml-group-items[hidden]{display:none}
.ml-item-row{display:flex;align-items:center;gap:4px;border-radius:8px;transition:background-color ${HOVER}}
.ml-item-row:hover,.ml-item-row:focus-within{background:var(--nav-hover)}
.ml-item-row[data-current="true"]{background:var(--nav-active)}
.ml-item-pick{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:7px;min-height:32px;padding:4px 8px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.ml-item-pick[data-state="missing"],.ml-item-pick[data-state="denied"]{color:var(--muted)}
.ml-item-title{flex:1 1 auto;min-width:0;${ELLIPSIS}}
.ml-item-sub{flex:none;font-size:11px;color:var(--muted)}
.ml-item-pin{flex:none;width:12px;height:12px;color:var(--accent)}
.ml-item-acts{flex:none;display:inline-flex;align-items:center;gap:2px;padding-right:4px;opacity:0;transition:opacity ${HOVER}}
.ml-item-row:hover .ml-item-acts,.ml-item-row:focus-within .ml-item-acts,.ml-item-row[data-state="missing"] .ml-item-acts,.ml-item-row[data-state="denied"] .ml-item-acts{opacity:1}
@media (hover:none),(pointer:coarse){.ml-item-acts{opacity:1}}
.ml-icon-btn{display:inline-grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.ml-icon-btn:hover{background:var(--control-fill);color:var(--ink)}
.ml-icon-btn>svg{width:13px;height:13px}
.ml-empty{display:flex;flex-direction:column;gap:8px;padding:12px 10px;border-radius:10px;background:var(--desk);border:1px solid var(--line)}
.ml-empty>strong{font-size:13px;color:var(--ink);font-weight:600}
.ml-empty>p{margin:0;font-size:12px;line-height:1.5;color:var(--muted)}
.ml-empty-actions{display:flex;flex-wrap:wrap;gap:6px}
.ml-example-card{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:8px;border:1px dashed var(--line-strong);background:var(--paper)}
.ml-example-head{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink)}
.ml-example-tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:var(--r-tag,6px);background:var(--control-fill);color:var(--muted);font-size:11px}
.ml-example-acts{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ml-create-box{flex:none;display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--line)}
.ml-create-form{display:flex;gap:6px;align-items:center}
.ml-create-input{flex:1 1 auto;min-width:0;height:32px;min-height:32px;padding:0 10px;font-size:12px;box-sizing:border-box}
body.immersive-workbench :is(.top-corner-mainline,.ml-organize-dialog,.ml-hold-dialog,.ml-item-page) .mw-btn--secondary:not(:disabled){background:var(--control-fill);border-color:var(--line)}
body.immersive-workbench :is(.top-corner-mainline,.ml-organize-dialog,.ml-hold-dialog,.ml-item-page) .mw-btn--secondary:hover:not(:disabled){background:var(--nav-hover);border-color:var(--line-strong)}
.ml-source-chips{display:flex;flex-wrap:wrap;gap:4px}
.ml-source-chips[hidden]{display:none}
.ml-source-chip{display:inline-flex;align-items:center;gap:4px;min-height:32px;min-width:32px;padding:0 8px;border:1px solid var(--line);border-radius:var(--r-tag,6px);background:var(--paper);color:var(--ink-soft);font:inherit;font-size:11px;cursor:pointer;transition:background-color ${HOVER},border-color ${HOVER},color ${HOVER}}
.ml-source-chip:hover{background:var(--nav-hover);color:var(--ink);border-color:var(--line-strong)}
.ml-source-chip[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.ml-foot-links{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;padding-top:6px;border-top:1px solid var(--line)}
.ml-foot-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;min-width:32px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:12px;text-decoration:none;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.ml-foot-btn:hover{background:var(--nav-hover);color:var(--ink)}
.ml-foot-btn>svg{width:13px;height:13px}
.ml-no-match{margin:8px;font-size:12px;color:var(--muted)}

/* Organize Mainline modal/cover dialog (higher specificity than dialog.mw-dialog's 420px default) */
dialog.mw-dialog.ml-organize-dialog{width:min(920px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:min(82dvh,680px);padding:0;border:0;border-radius:16px;background:var(--paper);color:var(--ink);box-shadow:var(--lift-3)}
dialog.mw-dialog.ml-organize-dialog::backdrop{background:var(--scrim)}
.ml-organize-shell{display:flex;flex-direction:column;max-height:min(82dvh,680px)}
.ml-organize-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)}
.ml-organize-head h2{margin:0;font-size:17px;font-weight:600}
.ml-organize-head p{margin:2px 0 0;font-size:12px;color:var(--muted)}
.ml-organize-toolbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 20px;border-bottom:1px solid var(--line);background:var(--desk)}
.ml-organize-add{display:flex;align-items:center;gap:6px}
.ml-organize-batch{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;color:var(--ink)}
.ml-organize-batch[hidden]{display:none}
.ml-organize-cols{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-content:start;gap:12px;padding:16px 20px;overflow:auto}
.ml-org-col{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:var(--desk);border:1px solid var(--line);min-height:140px;align-self:start}
.ml-org-col.is-drop-over{border-color:var(--accent);background:var(--accent-soft)}
.ml-org-col-head{display:flex;align-items:center;gap:6px}
.ml-org-col-head strong{flex:1 1 auto;min-width:0;${ELLIPSIS};font-size:13px;font-weight:600}
.ml-org-list{display:flex;flex-direction:column;gap:6px;min-height:40px}
.ml-org-card{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:10px;background:var(--paper);border:1px solid var(--line);font-size:13px;cursor:grab}
.ml-org-card.is-dragging{opacity:.5}
.ml-org-card-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ml-org-card-title{${ELLIPSIS};font-weight:500;color:var(--ink)}
.ml-org-card-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.ml-org-card-acts{display:inline-flex;align-items:center;gap:1px}
.ml-org-card-acts .ml-icon-btn{width:24px;height:24px}

/* Lightweight Item First Page (Option A reading flow, aligned with 36A First Page) */
.ml-item-page{max-width:760px;margin:0 auto;padding:32px 28px 64px;display:flex;flex-direction:column;gap:24px;color:var(--ink)}
.ml-item-page-head{display:flex;flex-direction:column;gap:10px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.ml-item-kicker{margin:0;font-size:12px;font-weight:500;color:var(--muted)}
.ml-item-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ml-item-title-row h1{margin:0;font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.01em}
.ml-item-rename-form{display:flex;align-items:center;gap:6px;flex:1 1 240px}
.ml-item-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ml-item-remove-btn.mw-btn--ghost:not(:disabled){border-color:transparent;color:var(--muted)}
.ml-item-remove-btn.mw-btn--ghost:hover:not(:disabled){color:var(--red);background:color-mix(in srgb,var(--red) 8%,transparent);border-color:color-mix(in srgb,var(--red) 20%,transparent)}
.ml-item-convert-wrap{position:relative;display:inline-flex;gap:6px;flex-wrap:wrap}
.ml-item-sections{display:flex;flex-direction:column;gap:18px}
.ml-item-section{display:flex;flex-direction:column;gap:8px}
.ml-item-section-head{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:600;color:var(--ink-soft)}
.ml-item-section-head em{font-style:normal;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.ml-item-section-list{display:flex;flex-direction:column;gap:4px}
.ml-item-event-row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background-color ${HOVER},border-color ${HOVER}}
.ml-item-event-row:hover{background:var(--desk);border-color:var(--line-strong)}
.ml-item-event-row[data-waiting="true"]{border-color:color-mix(in srgb,var(--amber) 45%,var(--line))}
.ml-item-event-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ml-item-event-body strong{${ELLIPSIS};font-weight:500}
.ml-item-event-body small{${ELLIPSIS};color:var(--muted);font-size:12px}
.ml-item-empty{display:flex;flex-direction:column;gap:10px;padding:24px 20px;border-radius:12px;background:var(--desk);border:1px solid var(--line)}
.ml-item-empty h2{margin:0;font-size:15px;font-weight:600}
.ml-item-empty p{margin:0;font-size:13px;color:var(--muted);line-height:1.55}
.ml-item-empty-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.ml-item-contents-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:10px;background:var(--desk);border:1px solid var(--line);font-size:13px}
.ml-item-contents-strip[hidden]{display:none}

/* Right sidebar 「这件事的东西」 */
.side-item-contents{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden}
.side-ic-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)}
.side-ic-head strong{font-size:13px;font-weight:600;color:var(--ink);${ELLIPSIS}}
.side-ic-body{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:12px}
.side-ic-group{display:flex;flex-direction:column;gap:4px}
.side-ic-group-title{margin:0 4px 2px;font-size:11px;font-weight:500;color:var(--muted)}
.side-ic-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;border:1px solid var(--line);background:var(--paper);transition:background-color ${HOVER}}
.side-ic-row:hover{background:var(--desk)}
.side-ic-row[data-state="missing"],.side-ic-row[data-state="denied"]{background:var(--desk);border-style:dashed;color:var(--muted)}
.side-ic-open{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.side-ic-open strong{font-size:13px;font-weight:500;${ELLIPSIS}}
.side-ic-open small{font-size:11px;color:var(--muted);${ELLIPSIS}}
.side-ic-acts{flex:none;display:inline-flex;align-items:center;gap:2px}
.side-ic-empty{margin:12px 4px;font-size:13px;line-height:1.55;color:var(--muted)}

/* 「放进事项」 picker dialog */
dialog.mw-dialog.ml-hold-dialog{width:min(440px,calc(100vw - 32px));padding:0;border:0;border-radius:16px;background:var(--paper);color:var(--ink);box-shadow:var(--lift-3)}
dialog.mw-dialog.ml-hold-dialog::backdrop{background:var(--scrim)}
.ml-hold-shell{display:flex;flex-direction:column;gap:12px;padding:18px 20px}
.ml-hold-shell h2{margin:0;font-size:15px;font-weight:600}
.ml-hold-shell p{margin:0;font-size:12px;color:var(--muted)}
.ml-hold-list{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
.ml-hold-choice{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid var(--line);cursor:pointer;font-size:13px}
.ml-hold-choice:hover{background:var(--desk)}
.ml-hold-create{display:flex;gap:6px;padding-top:8px;border-top:1px solid var(--line)}
.ml-hold-foot{display:flex;justify-content:flex-end;gap:8px}

/* Bottom helm 13th edition additions: list header scope toggle, neutral task item tag, composer 「在：事项名 ×」 pill */
.work-lists-head-right{display:inline-flex;align-items:center;gap:6px}
.work-lists-scope{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--control-fill);box-shadow:inset 0 0 0 1px var(--line)}
.work-lists-scope[hidden]{display:none}
.work-lists-scope>button{height:22px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--muted);font:inherit;font-size:11px;font-weight:500;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.work-lists-scope>button[aria-pressed="true"]{background:var(--paper);color:var(--ink);box-shadow:var(--lift-1)}
.work-task-row-item{flex:none;max-width:110px;${ELLIPSIS};padding:1px 6px;border-radius:var(--r-tag,6px);background:var(--control-fill);color:var(--muted);font-size:11px;font-weight:400}
.work-item-pill{display:inline-flex;align-items:center;gap:4px;max-width:170px;height:24px;padding:0 4px 0 8px;border-radius:var(--r-tag,6px);background:var(--control-fill);color:var(--ink-soft);font-size:12px;white-space:nowrap;flex:0 1 auto}
.mw-composer[data-rest] .work-item-pill{grid-area:2/3;justify-self:start;align-self:center;margin-left:4px}
.work-item-pill[hidden]{display:none}
.work-item-pill-label{min-width:0;${ELLIPSIS}}
.work-item-pill>button{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--muted);cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.work-item-pill>button:hover{background:var(--nav-hover);color:var(--ink)}
.work-item-pill>button>svg{width:11px;height:11px}

/* Mobile 390px bottom sheet & >=44px touch targets (MLN-19, touch-targets) */
@media (max-width:760px),(pointer:coarse){
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-list :is(button,a[href],input){min-height:44px;min-width:44px;box-sizing:border-box}
  .ml-icon-btn,.ml-org-card-acts .ml-icon-btn{width:44px;height:44px}
  .ml-item-acts{opacity:1}
}
@media (max-width:760px){
  html body .workbench-header[data-dock][data-dock][data-dock][data-corner-open]{z-index:80}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-list{position:fixed;inset:auto 0 0 0;width:100vw;max-width:100vw;height:auto;max-height:84dvh;border-radius:16px 16px 0 0;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);z-index:140}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-projects{max-height:30dvh;overflow:auto;border-right:0;border-bottom:1px solid var(--line)}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-rows{overflow:visible;flex:none}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-foot{flex-direction:row;flex-wrap:wrap;gap:4px;margin-top:6px}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-projects :is(.top-corner-personal,.top-corner-project,.top-corner-manage){flex:none}
  .ml-item-page{padding:20px 16px 48px}
}
@media (max-width:540px){
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-cell[data-has-work-item] .top-corner-project-name,
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-cell[data-has-work-item]>svg:nth-of-type(2){display:none}
  html body .workbench-header[data-dock][data-dock][data-dock] .top-corner-cell[data-has-work-item] .top-corner-page-name{display:inline;max-width:150px;${ELLIPSIS}}
}
@media (prefers-reduced-motion:reduce){
  .ml-group-head>svg,.ml-item-row,.ml-icon-btn{transition:none!important}
}
`;

export const MAINLINE_WORKBENCH_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*/g, "");
