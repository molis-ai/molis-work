export const ALCHEMIST_STYLES = `
[data-alchemist=workbench] { color:var(--ink); font-size:13px; }
[data-alchemist=workbench] button,[data-alchemist=workbench] input,[data-alchemist=workbench] textarea { font:inherit; }
.alc-list { padding-top:58px; }
.alc-collections { display:flex; flex-wrap:wrap; gap:2px; margin:0 0 14px; }
.alc-collections [aria-pressed=true],.alc-tabs [aria-pressed=true] { background:var(--nav-active); color:var(--ink); }
.alc-search { display:flex; align-items:center; gap:8px; margin:0 4px 12px; color:var(--muted); }
.alc-search svg { width:14px; height:14px; flex:none; }
.alc-search input { width:100%; min-width:0; }
.alc-list-actions { display:flex; align-items:center; gap:8px; margin:0 4px 8px; flex-wrap:wrap; }
.alc-row { width:100%; text-align:left; display:flex; align-items:center; gap:12px; min-height:58px; padding:10px 8px; border:0; border-radius:6px; background:transparent; color:var(--ink); cursor:pointer; }
.alc-row:hover { background:var(--nav-hover); }
.alc-row[aria-current=true] { background:var(--nav-active); }
.alc-row-copy { display:flex; flex:1; flex-direction:column; gap:4px; min-width:0; }
.alc-row-copy strong { font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.alc-row-copy small { font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.alc-state { font-size:11px; color:var(--muted); white-space:nowrap; flex:none; }
.alc-state[data-state=running],.alc-state[data-state=queued] { color:var(--tone-progress); }
.alc-state[data-state=failed] { color:var(--tone-blocked); }
.alc-state[data-state=completed] { color:var(--tone-done); }
.alc-empty { color:var(--muted); line-height:1.7; padding:28px 12px; }
.alc-empty h2 { font-size:15px; color:var(--ink); font-weight:400; }
.alc-workspace { overflow:hidden; }
.alc-detail-layout { flex:1; display:flex; min-height:0; }
.alc-document { flex:1; display:flex; flex-direction:column; min-height:0; min-width:0; }
.alc-content { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:20px 28px 36px; scrollbar-width:thin; }
.alc-content > * { max-width:760px; }
.alc-content h2 { font-size:18px; font-weight:400; margin:0 0 16px; overflow-wrap:anywhere; }
.alc-content h3 { font-size:13px; font-weight:400; margin:24px 0 8px; }
.alc-content p { line-height:1.75; white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0; }
.alc-content ul { padding-left:20px; line-height:1.8; }
.alc-muted { color:var(--muted); font-size:12px; }
.alc-tabs { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 24px; padding-bottom:12px; border-bottom:1px solid var(--line); }
.alc-footer { padding:12px 20px; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--paper); }
.alc-footer:empty { display:none; }
.alc-candidates { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:20px; margin-top:24px; }
.alc-candidate { padding-top:12px; border-top:1px solid var(--line); min-width:0; }
.alc-candidate h3 { margin:0 0 8px; font-size:15px; }
.alc-candidate p { font-size:12px; color:var(--ink-soft); }
.alc-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }
.alc-claim { padding:4px 0 20px; border-bottom:1px solid var(--line); }
.alc-claim h3 { display:flex; gap:12px; align-items:center; }
.alc-evidence { margin:12px 0; padding:0; font-size:12px; }
.alc-evidence p { color:var(--muted); }
.alc-evidence a { color:var(--accent); text-underline-offset:3px; }
.alc-progress { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 0; color:var(--muted); border-bottom:1px solid var(--line); margin-bottom:16px; }
.alc-progress [aria-current=step] { color:var(--tone-progress); }
.alc-warning { background:var(--rail); color:var(--ink-soft); padding:12px; margin:12px 0; border-radius:6px; line-height:1.6; }
.alc-field { display:flex; flex-direction:column; gap:8px; margin:16px 0; color:var(--ink-soft); }
.alc-field input,.alc-field textarea { width:100%; box-sizing:border-box; }
.alc-field textarea { resize:vertical; min-height:80px; }
.alc-radios { display:flex; flex-direction:column; gap:10px; margin:12px 0; padding:0; border:0; }
.alc-radios label { display:flex; align-items:flex-start; gap:8px; line-height:1.6; }
.alc-radios legend { margin-bottom:8px; }
.alc-dialog { width:min(600px,calc(100vw - 32px)); max-height:calc(100dvh - 48px); padding:0; }
.alc-dialog form { display:flex; flex-direction:column; max-height:calc(100dvh - 48px); }
.alc-dialog header,.alc-dialog footer { display:flex; gap:8px; align-items:center; padding:16px 20px; flex:none; }
.alc-dialog header h2 { flex:1; font-size:15px; font-weight:400; margin:0; }
.alc-dialog footer { justify-content:flex-end; border-top:1px solid var(--line); }
.alc-dialog-body { padding:0 20px 16px; overflow:auto; min-height:0; }
.alc-error { color:var(--tone-blocked); padding:0 20px; }
.alc-notice { position:absolute; bottom:12px; left:20px; right:20px; z-index:30; padding:10px 12px; background:var(--paper); border:1px solid var(--line-strong); border-radius:6px; display:flex; gap:12px; align-items:center; }
.alc-notice span { flex:1; }
.alc-context-panel { width:min(340px,42%); min-width:240px; border-left:1px solid var(--line); display:flex; flex-direction:column; background:var(--paper); }
.alc-context-panel > header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:1px solid var(--line); }
[data-alc-side-body] { padding:14px; overflow:auto; min-height:0; }
.alc-message,.alc-comment { padding:12px 0; border-bottom:1px solid var(--line); white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.7; }
.alc-message small { display:block; color:var(--muted); margin-bottom:6px; }
.alc-comment blockquote { margin:6px 0; padding:8px; background:var(--rail); color:var(--muted); }
.alc-settings-section { margin-bottom:28px; padding-bottom:24px; border-bottom:1px solid var(--line); }
.alc-settings-section h3 { margin-top:0; }
.alc-detail-layout:has(.alc-context-panel:not([hidden])) .alc-content { padding:20px; }
@media(max-width:760px) {
 .alc-content { padding:16px; }
 .alc-context-panel { width:100%; min-width:0; border-left:0; }
 .alc-detail-layout:has(.alc-context-panel:not([hidden])) .alc-document { display:none; }
 .alc-collections .mw-btn,.alc-actions .mw-btn,.alc-footer .mw-btn { min-height:40px; }
 .alc-dialog { width:calc(100vw - 24px); }
 .alc-candidates { grid-template-columns:1fr; }
}
`;
