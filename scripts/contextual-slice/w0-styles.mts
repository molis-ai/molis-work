/** Prototype-only layout. Product tokens and controls come from the actual workbench stylesheet. */
export const W0_STYLES = `
body.w0-slice { margin:0; height:100dvh; overflow:hidden; background:var(--desk); color:var(--ink); font-size:13px; }
.w0-slice *, .w0-slice *::before, .w0-slice *::after { box-sizing:border-box; }
.w0-slice [hidden] { display:none; }
.w0-slice button { cursor:pointer; }
.w0-slice button:disabled { cursor:not-allowed; }
.w0-slice button:focus-visible, .w0-slice summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.w0-slice .icon { width:16px; height:16px; flex:none; }
.w0-top { height:48px; display:flex; align-items:center; gap:12px; padding:0 22px; color:var(--ink-soft); }
.w0-project { display:flex; align-items:center; gap:8px; font-weight:500; }
.w0-top-divider { color:var(--faint); }
.w0-prototype { margin-left:auto; font-size:11px; color:var(--muted); }
.w0-workspace { position:absolute; inset:48px 14px 132px; display:grid; grid-template-columns:minmax(0,1fr) 352px; overflow:hidden; border-radius:var(--r-sheet,14px); background:var(--paper); box-shadow:var(--surface-shadow); }
.w0-paper { min-width:0; display:flex; flex-direction:column; overflow:hidden; }
.w0-page-bar { min-height:58px; display:flex; align-items:center; gap:12px; padding:10px 24px; border-bottom:1px solid var(--line); }
.w0-page-bar > [data-w0-new] { margin-left:auto; }
.w0-document-menu { position:relative; }
.w0-document-menu summary { list-style:none; display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:500; }
.w0-document-menu summary::-webkit-details-marker { display:none; }
.w0-document-menu nav { position:absolute; top:32px; left:0; width:270px; padding:6px; z-index:15; background:var(--popover); box-shadow:var(--shadow-raised); border-radius:var(--r-card,12px); }
.w0-document-menu nav button { width:100%; text-align:left; justify-content:flex-start; }
.w0-save { font-size:11px; color:var(--muted); }
.w0-reading { overflow:auto; flex:1; padding:38px clamp(24px,5vw,80px) 100px; scroll-padding-top:80px; }
.w0-page-heading, .w0-editor-wrap { max-width:720px; margin:0 auto; }
.w0-eyebrow { margin:0 0 14px; font-size:11px; color:var(--muted); }
.w0-page-heading h1 { margin:0; font-size:30px; line-height:1.3; letter-spacing:-.03em; font-weight:600; }
.w0-help { font-size:12px; color:var(--muted); line-height:1.6; margin:14px 0 28px; }
.w0-editor-wrap { min-height:200px; }
.w0-editor-wrap .ProseMirror { padding:0; min-height:200px; outline:none; }
.w0-editor-wrap .ProseMirror > h1:first-child { display:none; }
.w0-editor-wrap .ProseMirror p { line-height:1.9; }
.w0-reading-end { max-width:720px; margin:48px auto 0; padding-top:20px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); }
.w0-shelf { min-width:0; display:flex; flex-direction:column; background:var(--surface-soft); border-left:1px solid var(--line); }
.w0-tabs { display:flex; align-items:center; gap:2px; min-height:58px; padding:10px 12px; border-bottom:1px solid var(--line); overflow-x:auto; }
.w0-tabs button { flex:1; white-space:nowrap; min-height:32px; padding:0 6px; border:0; border-radius:var(--r-control,8px); background:transparent; color:var(--ink-soft); font:inherit; font-size:12px; }
.w0-tabs [aria-selected=true] { background:var(--paper); color:var(--ink); box-shadow:var(--shadow-soft); font-weight:500; }
.w0-side-body { flex:1; overflow:auto; padding:26px 18px; }
.w0-shelf-head { display:flex; gap:12px; align-items:center; justify-content:space-between; }
.w0-shelf-head h2 { margin:0; font-size:17px; font-weight:600; }
.w0-shelf-head p { margin:7px 0 0; font-size:12px; color:var(--muted); }
.w0-section-label { margin:30px 0 10px; font-size:11px; color:var(--muted); }
.w0-material { width:100%; display:grid; grid-template-columns:28px minmax(0,1fr); gap:10px; padding:14px 10px; border:0; border-radius:var(--r-row,10px); background:transparent; text-align:left; font:inherit; color:var(--ink); }
.w0-material + .w0-material { margin-top:4px; }
.w0-material:hover { background:var(--nav-hover); }
.w0-material[aria-pressed=true] { background:var(--nav-active); }
.w0-material-icon { width:26px; height:30px; display:grid; place-items:center; background:var(--paper); border-radius:6px; color:var(--ink-soft); }
.w0-material strong { font-size:13px; font-weight:500; }
.w0-material p { margin:6px 0 0; color:var(--muted); line-height:1.7; font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.w0-shelf-note { display:flex; align-items:flex-start; gap:9px; margin:28px 10px; font-size:11px; line-height:1.8; color:var(--muted); }
.w0-shelf-footer { display:flex; align-items:center; justify-content:space-between; min-height:44px; padding:8px 20px; font-size:11px; color:var(--muted); }
.w0-created { border-top:1px solid var(--line); margin-top:28px; padding-top:20px; }
.w0-created h3 { font-size:12px; font-weight:500; margin:0 0 12px; }
.w0-created-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:8px 0; }
.w0-created-row > span { flex:1 1 150px; overflow-wrap:anywhere; }
.w0-created-row small { display:block; color:var(--muted); font-size:11px; }
.w0-unavailable { padding:40px 12px; color:var(--ink-soft); line-height:1.8; }
.w0-unavailable h2 { font-size:17px; color:var(--ink); }
.w0-dock { position:fixed; inset:auto 20px 12px; min-height:108px; display:grid; grid-template-columns:minmax(140px,1fr) minmax(300px,600px) minmax(140px,1fr); gap:22px; align-items:end; }
.w0-dock-left,.w0-dock-right { display:flex; gap:12px; align-items:center; padding-bottom:24px; }
.w0-dock-right { justify-content:flex-end; }
.w0-dock-current { display:flex; align-items:center; gap:7px; height:40px; padding:0 12px; border-radius:11px; background:var(--paper); box-shadow:var(--shadow-soft); font-weight:500; }
.w0-shortcut { font-size:11px; color:var(--muted); }
.w0-avatar { width:36px; height:36px; display:grid; place-items:center; border-radius:50%; font-size:11px; background:var(--paper); }
.w0-conversation { min-width:0; }
.w0-context { display:flex; flex-wrap:wrap; gap:6px; min-height:29px; padding:0 6px 6px; }
.w0-context-chip { display:flex; align-items:center; gap:5px; max-width:47%; color:var(--ink-soft); font-size:11px; }
.w0-context-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w0-context-chip button { border:0; background:transparent; padding:2px 4px; color:var(--muted); font:inherit; }
.w0-composer { display:flex; align-items:center; gap:10px; min-height:50px; padding:6px 8px 6px 16px; background:var(--paper); border-radius:var(--r-composer,15px); box-shadow:var(--shadow-raised); }
.w0-composer .mw-input { min-width:0; flex:1; border:0; background:transparent; box-shadow:none; padding:0; }
.w0-assistant-mark { color:var(--muted); }
.w0-composer-note { display:block; text-align:center; padding-top:7px; font-size:11px; color:var(--muted); }
.w0-float { position:fixed; z-index:50; max-width:calc(100vw - 16px); display:flex; gap:3px; align-items:center; padding:5px; background:var(--popover); box-shadow:var(--shadow-raised); border:0; border-radius:var(--r-card,12px); }
.w0-float button { min-height:32px; font-size:12px; white-space:nowrap; padding:0 9px; }
.w0-tools { display:flex; gap:2px; padding-right:5px; margin-right:3px; border-right:1px solid var(--line); }
.w0-tools button { min-width:30px; padding:0 6px; }
.w0-tools [aria-pressed=true] { background:var(--nav-active); }
.w0-target { font-size:11px; color:var(--muted); padding:0 8px; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.w0-float-menu { position:fixed; z-index:52; min-width:180px; max-width:calc(100vw - 16px); max-height:45dvh; overflow:auto; padding:6px; border-radius:var(--r-card,12px); background:var(--popover); box-shadow:var(--shadow-raised); }
.w0-float-menu button { display:flex; width:100%; justify-content:flex-start; }
.w0-popover { position:fixed; z-index:55; width:min(420px,calc(100vw - 24px)); max-height:calc(100dvh - 168px); overflow:auto; padding:20px; border-radius:var(--r-dialog,16px); background:var(--popover); box-shadow:var(--shadow-raised); }
.w0-popover header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.w0-popover h2 { font-size:15px; font-weight:600; margin:0; }
.w0-popover p { font-size:12px; color:var(--ink-soft); line-height:1.7; }
.w0-popover label { display:grid; gap:6px; margin:14px 0; font-size:12px; color:var(--ink-soft); }
.w0-popover .mw-input { width:100%; }
.w0-popover textarea { min-height:95px; resize:vertical; line-height:1.7; }
.w0-popover .w0-preview-text { white-space:pre-wrap; overflow-wrap:anywhere; padding:12px 0; color:var(--ink); }
.w0-popover .w0-simulated { font-size:11px; color:var(--muted); margin-top:8px; }
.w0-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
.w0-error { color:var(--red); font-size:12px; line-height:1.7; }
.w0-mark { position:fixed; pointer-events:none; z-index:42; min-width:3px; background:var(--accent-soft); border-left:2px solid var(--accent); border-radius:2px; }
.pages-focus-frozen { background:var(--accent-soft); }
.w0-toast { position:fixed; z-index:60; left:50%; transform:translateX(-50%); bottom:138px; width:max-content; max-width:calc(100vw - 24px); display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 14px; border-radius:12px; background:var(--popover); color:var(--ink); box-shadow:var(--shadow-raised); }
.w0-toast small { color:var(--muted); }
.w0-about { position:fixed; right:20px; top:54px; z-index:65; width:min(380px,calc(100vw - 24px)); max-height:calc(100dvh - 160px); overflow:auto; padding:22px; background:var(--popover); border-radius:16px; box-shadow:var(--shadow-raised); }
.w0-about header { display:flex; align-items:center; justify-content:space-between; }
.w0-about h2 { font-size:15px; margin:0; }
.w0-about p { font-size:12px; line-height:1.8; color:var(--ink-soft); }
.w0-live { position:fixed; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
.w0-mobile-only { display:none; }
.w0-slice[data-side-hidden=true] .w0-workspace { grid-template-columns:1fr; }
.w0-slice[data-side-hidden=true] .w0-shelf { display:none; }
@media (prefers-reduced-motion:no-preference) { .w0-float,.w0-popover,.w0-float-menu { animation:w0-appear var(--dur-hover) var(--ease-quint); } @keyframes w0-appear { from { opacity:0; } } }
@media(max-width:1100px) { .w0-workspace { grid-template-columns:minmax(0,1fr) 320px; } .w0-reading { padding:30px 28px 80px; } .w0-shortcut { display:none; } .w0-dock { grid-template-columns:100px minmax(250px,1fr) 100px; gap:12px; } .w0-avatar { display:none; } .w0-target { max-width:115px; } }
@media(max-width:700px) {
 .w0-top { padding:0 14px; gap:8px; } .w0-top-divider,.w0-top > span:nth-child(3),.w0-top [data-w0-theme] { display:none; }
 .w0-prototype { font-size:11px; } .w0-workspace { inset:48px 8px 142px; grid-template-columns:1fr; }
 .w0-mobile-only { display:inline-flex; } .w0-slice[data-mobile-view=document] .w0-shelf { display:none; }
 .w0-slice[data-mobile-view=shelf] .w0-paper { display:none; } .w0-slice[data-mobile-view=shelf] .w0-shelf { display:flex; border:0; }
 .w0-page-bar { padding:8px 14px; gap:6px; } .w0-save { display:none; } .w0-page-bar [data-w0-new] span { display:none; }
 .w0-reading { padding:24px 20px 80px; } .w0-page-heading h1 { font-size:24px; } .w0-help { margin-bottom:22px; }
 .w0-dock { inset:auto 12px 10px; display:block; } .w0-dock-left,.w0-dock-right { display:none; }
 .w0-context-chip { max-width:48%; } .w0-context-chip button { min-width:28px; min-height:28px; }
 .w0-composer { min-height:50px; } .w0-composer-note { padding-top:6px; }
 .w0-float { gap:0; padding:4px; } .w0-float button { padding:0 7px; min-height:38px; }
 .w0-target { display:none; } .w0-tools { padding-right:2px; margin-right:2px; } .w0-popover { padding:16px; }
 .w0-toast { bottom:144px; } .w0-shelf-head { margin-top:4px; }
}
@media(pointer:coarse) { .w0-tabs button,.w0-float button,.w0-popover button { min-height:44px; } }
`;
