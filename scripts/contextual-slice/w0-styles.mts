/** Prototype-only layout. Tokens and `mw-*` controls come from the actual workbench stylesheet; numbers follow DESIGN.md. */
const SHELL = `
body.w0-slice { margin:0; height:100dvh; overflow:hidden; background:var(--desk); color:var(--ink); font-size:13px; }
.w0-slice *, .w0-slice *::before, .w0-slice *::after { box-sizing:border-box; }
.w0-slice [hidden] { display:none; }
.w0-slice button { cursor:pointer; }
.w0-slice button:disabled { cursor:not-allowed; }
.w0-slice button:focus-visible, .w0-slice summary:focus-visible { outline:var(--focus-stroke); outline-offset:var(--focus-stroke-inset,1px); }
.w0-slice svg[aria-hidden] { width:16px; height:16px; flex:none; }
.w0-top { height:48px; display:flex; align-items:center; gap:8px; padding:0 18px 0 22px; color:var(--ink-soft); }
.w0-project { display:flex; align-items:center; gap:8px; font-weight:500; color:var(--ink); }
.w0-top-divider { color:var(--faint); }
.w0-prototype { margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); }
.w0-prototype svg[aria-hidden] { width:14px; height:14px; }
.w0-count { min-width:18px; height:18px; padding:0 5px; border-radius:9px; display:inline-grid; place-items:center; font-size:11px; background:var(--nav-active); color:var(--ink); }
.w0-workspace { position:absolute; inset:48px 14px 132px; display:grid; grid-template-columns:minmax(0,1fr) 8px 360px; background:transparent; }
.w0-paper, .w0-shelf { min-width:0; display:flex; flex-direction:column; overflow:hidden; border-radius:var(--r-sheet,14px); background:var(--paper); box-shadow:var(--sheet-shadow, var(--surface-shadow)); }
.w0-shelf { grid-column:3; }
.w0-page-bar { min-height:52px; display:flex; align-items:center; gap:8px; padding:8px 16px 8px 20px; }
.w0-page-bar > [data-w0-new] { margin-left:auto; }
.w0-document-menu { position:relative; }
.w0-document-menu summary { list-style:none; display:flex; align-items:center; gap:6px; height:32px; padding:0 8px; border-radius:var(--r-control,8px); cursor:pointer; font-weight:500; }
.w0-document-menu summary:hover { background:var(--nav-hover); }
.w0-document-menu summary::-webkit-details-marker { display:none; }
.w0-document-menu nav { position:absolute; top:36px; left:0; width:280px; padding:8px; z-index:45; background:var(--popover); box-shadow:var(--shadow); border-radius:var(--r-card,12px); }
.w0-document-menu nav button { width:100%; min-height:34px; justify-content:flex-start; }
.w0-document-menu nav button[aria-current=page] { background:var(--nav-active); }
.w0-save { font-size:12px; color:var(--muted); }
.w0-reading { overflow:auto; flex:1; padding:28px clamp(24px,5vw,72px) 96px; scroll-padding-top:80px; }
.w0-page-heading, .w0-editor-wrap, .w0-reading-end { max-width:720px; margin:0 auto; }
.w0-eyebrow { margin:0 0 10px; font-size:12px; color:var(--muted); }
.w0-page-heading h1 { margin:0 0 24px; font-size:30px; line-height:1.25; letter-spacing:-.03em; font-weight:600; }
.w0-editor-wrap { min-height:200px; }
.w0-editor-wrap .ProseMirror { padding:0; min-height:200px; outline:none; }
.w0-editor-wrap .ProseMirror > h1:first-child { display:none; }
.w0-editor-wrap .ProseMirror p { line-height:1.85; }
.w0-reading-end { display:flex; gap:8px; align-items:flex-start; margin-top:48px; padding-top:16px; border-top:1px solid var(--line); font-size:12px; line-height:1.7; color:var(--muted); }
.w0-reading-end svg[aria-hidden] { width:14px; height:14px; margin-top:3px; }
.w0-dock { position:fixed; inset:auto 20px 14px; min-height:104px; display:grid; grid-template-columns:minmax(140px,1fr) minmax(300px,600px) minmax(140px,1fr); gap:22px; align-items:end; }
.w0-dock-left,.w0-dock-right { display:flex; gap:12px; align-items:center; padding-bottom:6px; }
.w0-dock-right { justify-content:flex-end; }
.w0-dock-current { display:flex; align-items:center; gap:8px; height:38px; padding:0 12px; border-radius:11px; background:var(--paper); box-shadow:var(--shadow-soft); font-weight:500; }
.w0-shortcut { font-size:12px; color:var(--muted); display:inline-flex; gap:3px; align-items:center; }
.w0-shortcut kbd { font:inherit; font-size:11px; min-width:18px; height:18px; display:inline-grid; place-items:center; border-radius:4px; background:var(--nav-active); color:var(--ink-soft); }
.w0-avatar { width:40px; height:40px; display:grid; place-items:center; border-radius:50%; font-size:12px; font-weight:500; color:var(--on-accent,#fff); background:var(--accent); }
.w0-conversation { min-width:0; }
.w0-composer { display:flex; align-items:center; gap:10px; min-height:50px; padding:6px 8px 6px 16px; background:var(--paper); border-radius:var(--r-composer,15px); box-shadow:var(--shadow-raised); }
.w0-composer .mw-input { min-width:0; flex:1; border:0; background:transparent; box-shadow:none; padding:0; }
.w0-assistant-mark { color:var(--muted); display:inline-flex; }
.w0-mobile-only { display:none; }
.w0-slice[data-side-hidden=true] .w0-workspace { grid-template-columns:minmax(0,1fr); }
.w0-slice[data-side-hidden=true] .w0-shelf { display:none; }
.w0-live { position:fixed; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
`;

/** The context strip above the composer: what goes to the Assistant, each removable (context-program §6). */
const STRIP = `
.w0-context { display:flex; flex-wrap:wrap; gap:6px; padding:0 4px 8px; }
.w0-context-chip { display:inline-flex; align-items:center; gap:6px; max-width:min(48%, 280px); height:28px; padding:0 2px 0 10px; border-radius:var(--r-control,8px); background:var(--paper); box-shadow:var(--shadow-soft); color:var(--ink-soft); font-size:12px; }
.w0-context-chip > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-context-chip svg[aria-hidden] { width:14px; height:14px; color:var(--muted); }
.w0-chip-remove { width:24px; height:24px; display:grid; place-items:center; flex:none; border:0; border-radius:6px; background:transparent; color:var(--muted); }
.w0-chip-remove:hover { background:var(--nav-hover); color:var(--ink); }
.w0-chip-remove svg[aria-hidden] { width:12px; height:12px; }
`;

/** The bar takes Pages' format bar's look (context-toolbar §4); menus and panels are popovers (DESIGN.md: --lift-3, 12px). */
const LAYERS = `
.w0-float { position:fixed; z-index:50; max-width:calc(100vw - 16px); display:flex; gap:2px; align-items:center; padding:4px; background:var(--popover); box-shadow:var(--shadow-raised); border:0; border-radius:8px; }
.w0-float .mw-btn { min-height:28px; height:28px; padding:0 8px; gap:4px; font-size:12px; white-space:nowrap; border-radius:6px; }
.w0-float .mw-btn svg[aria-hidden] { width:14px; height:14px; }
.w0-float .mw-btn > svg:last-child:not(:first-child) { width:12px; height:12px; color:var(--muted); }
.w0-tools { display:flex; gap:2px; padding-right:4px; margin-right:2px; border-right:1px solid var(--line); }
.w0-tools [data-w0-tool] { min-width:28px; padding:0 6px; }
.w0-glyph { font-weight:500; } .w0-glyph[data-glyph=B] { font-weight:600; } .w0-glyph[data-glyph=I] { font-style:italic; } .w0-glyph[data-glyph=U] { text-decoration:underline; text-underline-offset:2px; }
.w0-slice [aria-pressed=true][data-w0-tool] { background:var(--nav-active); }
.w0-target { display:inline-flex; align-items:center; gap:4px; height:28px; max-width:180px; padding:0 8px; margin-right:2px; border-radius:6px; background:var(--accent-soft); color:var(--accent-strong); font-size:12px; }
.w0-target span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-target svg[aria-hidden] { width:12px; height:12px; }
.w0-float-menu { position:fixed; z-index:52; min-width:200px; max-width:calc(100vw - 16px); max-height:45dvh; overflow:auto; padding:8px; border-radius:var(--r-card,12px); background:var(--popover); box-shadow:var(--shadow); }
.w0-float-menu > .mw-btn { display:flex; width:100%; min-height:34px; justify-content:flex-start; gap:8px; border-radius:var(--r-control,8px); }
.w0-float-menu > .mw-btn svg[aria-hidden] { color:var(--ink-soft); }
.w0-menu-label { margin:6px 8px 4px; font-size:11px; font-weight:500; color:var(--faint); }
.w0-menu-gap { height:1px; margin:6px 4px; background:var(--line); }
.w0-popover { position:fixed; z-index:55; width:min(400px,calc(100vw - 24px)); max-height:calc(100dvh - 168px); overflow:auto; border-radius:var(--r-card,12px); background:var(--popover); box-shadow:var(--shadow); }
.w0-panel-head { display:flex; align-items:center; gap:8px; padding:12px 8px 0 16px; }
.w0-panel-head h2 { flex:1; min-width:0; font-size:15px; font-weight:600; margin:0; }
.w0-tag { display:inline-flex; align-items:center; height:20px; padding:0 6px; border-radius:var(--r-tag,6px); background:var(--nav-active); color:var(--ink-soft); font-size:11px; white-space:nowrap; }
.w0-panel-body { padding:4px 16px 0; }
.w0-panel-meta { display:flex; flex-wrap:wrap; gap:4px 8px; margin:6px 0 10px; font-size:12px; color:var(--ink-soft); }
.w0-panel-detail { color:var(--muted); }
.w0-original { display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:baseline; margin:0 0 4px; font-size:12px; }
.w0-original > span { color:var(--faint); }
.w0-original del { color:var(--muted); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-decoration-color:color-mix(in srgb, var(--muted) 70%, transparent); }
.w0-popover label { display:grid; gap:6px; margin:10px 0; font-size:12px; color:var(--ink-soft); }
.w0-popover .mw-input { width:100%; }
.w0-popover textarea { min-height:96px; resize:vertical; line-height:1.7; }
.w0-popover .w0-preview-text { white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0; line-height:1.7; color:var(--ink); }
.w0-panel-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:12px 16px 14px; }
.w0-panel-note { margin:0; flex:1 1 140px; font-size:12px; color:var(--muted); }
.w0-actions { display:flex; gap:8px; margin-left:auto; }
.w0-actions:empty { display:none; }
.w0-error { margin:4px 16px 0; color:var(--red); font-size:12px; line-height:1.7; }
.w0-oneline { display:flex; align-items:center; gap:8px; margin:10px 0 4px; }
.w0-oneline > svg[aria-hidden] { color:var(--muted); }
.w0-oneline .mw-input { flex:1; }
.w0-draft { margin-top:6px; }
.w0-carried { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 4px; }
.w0-carried-chip { display:inline-flex; align-items:center; gap:6px; max-width:100%; height:24px; padding:0 8px; border-radius:var(--r-tag,6px); background:var(--nav-hover); color:var(--ink-soft); font-size:12px; }
.w0-carried-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-carried-chip svg[aria-hidden] { width:12px; height:12px; }
.w0-said { margin:10px 0; padding:2px 0 2px 10px; border-left:2px solid var(--line-strong); color:var(--ink); line-height:1.6; }
.w0-handoff .w0-card-row { display:grid; grid-template-columns:16px minmax(0,1fr) auto; width:100%; min-height:36px; justify-content:stretch; text-align:left; gap:8px; }
.w0-card-row small { color:var(--faint); font-size:11px; }
.w0-mark { position:fixed; pointer-events:none; z-index:42; border-radius:1px; }
.w0-mark[data-shape=caret] { background:var(--accent); }
.w0-mark[data-shape=range] { background:color-mix(in srgb, var(--accent) 16%, transparent); box-shadow:inset 0 -2px 0 var(--accent); }
.pages-focus-frozen { background:color-mix(in srgb, var(--accent) 16%, transparent); }
.w0-toast { position:fixed; z-index:60; left:50%; transform:translateX(-50%); bottom:128px; width:max-content; max-width:calc(100vw - 24px); display:flex; flex-wrap:wrap; align-items:center; gap:2px; min-height:40px; padding:4px 4px 4px 14px; border-radius:var(--r-card,12px); background:var(--action); color:var(--action-ink); box-shadow:var(--shadow); font-size:13px; }
.w0-toast > svg[aria-hidden] { width:16px; height:16px; margin-right:6px; }
.w0-toast-text { margin-right:8px; max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-toast .mw-btn { min-height:32px; color:var(--action-ink); background:transparent; }
.w0-toast .mw-btn:hover { background:color-mix(in srgb, var(--action-ink) 14%, transparent); }
.w0-toast .mw-btn svg[aria-hidden] { width:12px; height:12px; }
.w0-records { min-width:300px; }
.w0-record { display:flex; align-items:center; gap:8px; padding:4px 4px 4px 8px; border-radius:var(--r-control,8px); }
.w0-record > span { flex:1; min-width:0; display:grid; }
.w0-record strong { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-record small { color:var(--faint); font-size:11px; }
.w0-about { position:fixed; right:18px; top:52px; z-index:65; width:min(400px,calc(100vw - 24px)); max-height:calc(100dvh - 160px); overflow:auto; padding:16px 16px 18px; background:var(--popover); border-radius:var(--r-card,12px); box-shadow:var(--shadow); }
.w0-about header { display:flex; align-items:center; justify-content:space-between; }
.w0-about h2 { font-size:15px; margin:0; }
.w0-about p { font-size:13px; line-height:1.7; color:var(--ink-soft); margin:10px 0; }
.w0-about strong { color:var(--ink); }
.w0-about-actions { margin-top:12px; padding-top:8px; border-top:1px solid var(--line); }
.w0-about-actions .w0-menu-label { margin-left:0; }
`;

/** The right panel: six places in one sheet, a segmented switch on top (side-shelf §3.1). */
const SIDE = `
.w0-tabs { display:flex; gap:2px; margin:12px 12px 0; padding:3px; border-radius:var(--r-control,8px); background:var(--control-fill, color-mix(in srgb, var(--ink) 4%, transparent)); }
.w0-tabs button { flex:1; min-width:0; white-space:nowrap; height:28px; padding:0 4px; border:0; border-radius:6px; background:transparent; color:var(--ink-soft); font:inherit; font-size:12px; font-weight:500; }
.w0-tabs button:hover { color:var(--ink); }
.w0-tabs [aria-selected=true] { background:var(--paper); color:var(--ink); box-shadow:var(--shadow-soft); }
.w0-side-body { flex:1; overflow:auto; padding:18px 12px 24px; }
.w0-side-head { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; padding:0 6px; }
.w0-side-head h2 { margin:0; font-size:15px; font-weight:600; }
.w0-side-head p { margin:4px 0 0; font-size:12px; color:var(--muted); }
.w0-sample-note { display:flex; align-items:center; gap:6px; margin:14px 6px 8px; font-size:11px; color:var(--faint); }
.w0-sample-note svg[aria-hidden] { width:12px; height:12px; }
.w0-group-label { margin:20px 6px 6px; font-size:11px; font-weight:500; color:var(--faint); }
.w0-rows { display:grid; gap:2px; }
.w0-row { width:100%; display:grid; grid-template-columns:28px minmax(0,1fr); gap:10px; padding:10px 8px; border:0; border-radius:var(--r-row,10px); background:transparent; text-align:left; font:inherit; color:var(--ink); }
.w0-row:hover { background:var(--nav-hover); }
.w0-row[aria-pressed=true] { background:var(--nav-active); }
.w0-row.is-dragging { opacity:.45; }
.w0-row-icon { width:28px; height:28px; display:grid; place-items:center; border-radius:var(--r-control,8px); background:var(--surface-soft); color:var(--ink-soft); }
.w0-row-icon svg[aria-hidden] { width:14px; height:14px; }
.w0-row-copy { display:grid; gap:2px; min-width:0; }
.w0-row-copy strong { font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-row-copy small { font-size:11px; color:var(--faint); }
.w0-row-text { margin-top:2px; color:var(--muted); line-height:1.6; font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.w0-side-hint { display:flex; gap:8px; align-items:flex-start; margin:20px 8px 0; font-size:12px; line-height:1.6; color:var(--faint); }
.w0-side-hint svg[aria-hidden] { width:14px; height:14px; margin-top:2px; }
.w0-address { display:flex; align-items:center; gap:8px; height:32px; padding:0 6px 0 10px; border-radius:var(--r-control,8px); background:var(--surface-soft); color:var(--muted); font-size:12px; }
.w0-address > span:not(.w0-tag) { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-address svg[aria-hidden] { width:14px; height:14px; }
.w0-web { padding:4px 6px; }
.w0-web h3 { margin:6px 0 10px; font-size:15px; font-weight:600; line-height:1.4; }
.w0-web p { margin:0 0 10px; line-height:1.8; color:var(--ink); }
.w0-discussion-input { display:flex; align-items:center; height:40px; margin:16px 6px 0; padding:0 12px; border-radius:var(--r-control,8px); background:var(--surface-soft); color:var(--faint); font-size:12px; }
.w0-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:48px 18px; color:var(--ink-soft); }
.w0-empty-mark { width:44px; height:44px; display:grid; place-items:center; border-radius:var(--r-card,12px); background:var(--surface-soft); color:var(--ink-soft); }
.w0-empty h2 { margin:4px 0 0; font-size:15px; font-weight:600; color:var(--ink); }
.w0-empty p { margin:0; max-width:30em; line-height:1.7; }
.w0-shelf-footer { display:none; align-items:center; padding:8px 12px; }
`;

const MOTION = `
@keyframes w0-appear { from { opacity:0; transform:translateY(4px); } }
@keyframes w0-land { from { background-color:var(--accent-soft); } to { background-color:transparent; } }
@keyframes w0-pulse { 0% { opacity:0; transform:scaleY(.6); } 40% { opacity:1; transform:none; } 100% { opacity:1; } }
@keyframes w0-nudge { 0%,100% { translate:0; } 30% { translate:-4px; } 60% { translate:3px; } }
@media (prefers-reduced-motion:no-preference) {
  .w0-float,.w0-popover,.w0-float-menu { animation:w0-appear var(--dur-hover,130ms) var(--ease-quint); }
  .w0-landed { animation:w0-land 1200ms var(--ease-quint); border-radius:6px; }
  .w0-mark.is-pulsing { animation:w0-pulse var(--dur-move,250ms) var(--ease-quint); }
  .w0-toast.is-nudging { animation:w0-nudge 420ms var(--ease-quint) 130ms; }
}
`;

const RESPONSIVE = `
@media(max-width:1100px) { .w0-workspace { grid-template-columns:minmax(0,1fr) 8px 328px; } .w0-reading { padding:24px 28px 80px; } .w0-shortcut { display:none; } .w0-dock { grid-template-columns:96px minmax(250px,1fr) 96px; gap:12px; } .w0-target { max-width:116px; } .w0-prototype > span { display:none; } }
@media(max-width:700px) {
 .w0-top { padding:0 10px 0 14px; gap:4px; } .w0-top-divider,.w0-top-place { display:none; } .w0-top [data-w0-records] > span:not(.w0-count) { display:none; }
 .w0-workspace { inset:48px 0 120px; grid-template-columns:1fr; }
 .w0-paper,.w0-shelf { border-radius:0; box-shadow:none; }
 .w0-mobile-only { display:inline-flex; } .w0-shelf-footer { display:flex; }
 .w0-slice[data-mobile-view=document] .w0-shelf { display:none; }
 .w0-slice[data-mobile-view=side] .w0-paper { display:none; } .w0-slice[data-mobile-view=side] .w0-shelf { display:flex; grid-column:1; }
 .w0-slice[data-mobile-view=side] .pages-block-handle { display:none; }
 .w0-page-bar { padding:6px 10px 6px 12px; gap:4px; } .w0-save { display:none; } .w0-page-bar [data-w0-new] span { display:none; }
 .w0-reading { padding:20px 20px 72px; } .w0-page-heading h1 { font-size:24px; }
 .w0-dock { inset:auto 12px 10px; display:block; min-height:0; } .w0-dock-left,.w0-dock-right { display:none; }
 .w0-composer { min-height:50px; }
 .w0-context { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; } .w0-context-chip { flex:none; max-width:70%; }
 .w0-float .mw-btn { min-height:38px; height:38px; padding:0 8px; } .w0-target { max-width:96px; padding:0 6px; }
 .w0-toast { bottom:118px; } .w0-toast-text { white-space:normal; }
}
@media(pointer:coarse) {
 .w0-tabs button,.w0-float .mw-btn,.w0-float-menu > .mw-btn,.w0-popover .mw-btn,.w0-toast .mw-btn,.w0-page-bar .mw-btn,.w0-document-menu summary { min-height:44px; height:auto; }
 .w0-chip-remove { width:44px; height:44px; margin:-8px -4px; } .w0-context-chip { height:36px; }
 .w0-row { min-height:56px; }
}
`;

export const W0_STYLES = SHELL + STRIP + LAYERS + SIDE + MOTION + RESPONSIVE;
