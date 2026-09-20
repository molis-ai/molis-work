/** Layout only; controls, colors, and focus behavior use the shared system. */
export const CODING_STYLES = `
[data-coding-workbench] { container: molis-coding / inline-size; }
.coding-directory { height:100%; min-height:0; display:flex; flex-direction:column; }
.coding-faces { display:flex; height:34px; border-bottom:1px solid var(--line); }
.coding-face { flex:1; border:0; background:transparent; color:var(--muted); cursor:pointer; }
.coding-face[aria-selected=true], .coding-filter[aria-selected=true] { background:var(--nav-active); color:var(--ink); }
.coding-face svg { width:16px; height:16px; }
.coding-directory-head { display:flex; align-items:center; justify-content:space-between; padding:4px 8px; }
.coding-directory-head h2 { font-size:13px; font-weight:400; margin:0; }
.coding-search { padding:0 8px 6px; }.coding-search span { display:none; }.coding-search input { width:100%; }
.coding-filters { display:flex; padding:4px 8px; gap:2px; }
.coding-filter { flex:1; border:0; border-radius:var(--radius-control); background:transparent; color:var(--muted); min-height:28px; font-size:12px; cursor:pointer; }
.coding-session-list { overflow:auto; flex:1; min-height:0; padding:4px 8px; }
.coding-session-group h3 { display:flex; align-items:center; gap:5px; margin:10px 0 4px; font-size:12px; font-weight:400; color:var(--muted); }
.coding-session-group h3 svg { width:12px; height:12px; }
.coding-session-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1px 8px; min-height:36px; padding:4px 8px; border-radius:var(--radius-control); color:var(--ink); text-decoration:none; }
.coding-session-row:hover { background:var(--nav-hover); }.coding-session-row[aria-current=true] { background:var(--nav-active); }
.coding-session-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
.coding-session-time,.coding-session-row .mw-status { font-size:11px; color:var(--muted); }
.coding-stage { height:100%; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,32%); background:var(--paper); }
.coding-dialogue { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; }
.coding-dialogue-head { display:flex; align-items:center; gap:8px; flex:none; padding:6px 12px; border-bottom:1px solid var(--line); }
.coding-dialogue-head>div { flex:1; min-width:0; font-size:13px; }
.coding-dialogue-head [data-coding-title] { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-dialogue-head small { display:block; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
.coding-workspace svg { width:12px; height:12px; margin-right:4px; }
.coding-turns { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; overflow-anchor:none; padding:24px clamp(16px,4vw,48px); }
.coding-turn { max-width:76ch; margin:0 auto 24px; font-size:14px; line-height:1.7; overflow-wrap:anywhere; }
.coding-turn[data-kind=user] { background:var(--rail); border-radius:var(--radius-control); padding:10px 14px; }
.coding-turn pre { position:relative; max-width:100%; overflow:auto; background:var(--rail); padding:44px 14px 14px; border:1px solid var(--line); border-radius:var(--radius-control); }
.coding-turn pre code { font-size:12px; }.coding-turn table { display:block; overflow:auto; border-collapse:collapse; }.coding-turn td,.coding-turn th { padding:5px 8px; border:1px solid var(--line); font-weight:400; }
.coding-turn h1,.coding-turn h2,.coding-turn h3 { font-weight:400; line-height:1.4; }.coding-turn h1 {font-size:22px}.coding-turn h2 {font-size:19px}.coding-turn h3 {font-size:16px}
.coding-turn .coding-code-copy { position:absolute; right:4px; top:4px; }.coding-activity { max-width:76ch; margin:0 auto 20px; color:var(--muted); font-size:12px; }.coding-activity pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:260px; overflow:auto; }.coding-activity summary { cursor:pointer; }
.coding-status { flex:none; min-height:18px; margin:0; padding:4px 14px; font-size:12px; color:var(--muted); }
.coding-status[data-error=true] { color:var(--tone-blocked,var(--ink)); }
.coding-composer { flex:none; padding:8px 14px 12px; border-top:1px solid var(--line); display:grid; gap:6px; }
.coding-task-label { font-size:12px; color:var(--muted); }.coding-composer textarea { resize:vertical; width:100%; min-height:64px; max-height:220px; line-height:1.6; }
.coding-composer-actions { display:flex; gap:6px; align-items:center; }.coding-composer-actions [data-coding-intent] { width:auto; flex:none; max-width:45%; }.coding-composer-actions [data-coding-model] { flex:1; min-width:0; }.coding-composer small { font-size:11px; color:var(--muted); }
.coding-tools { overflow-y:auto; overscroll-behavior:contain; min-width:0; min-height:0; display:flex; flex-direction:column; border-left:1px solid var(--line); background:var(--paper); }
.coding-tool-tabs { min-height:34px; display:flex; align-items:center; gap:10px; padding:0 12px; border-bottom:1px solid var(--line); font-size:12px; }
.coding-result { flex:none; overflow:visible; padding:16px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }.coding-result dt { margin-top:12px; }.coding-result dd { margin:3px 0; color:var(--ink); white-space:pre-wrap; }
.coding-command { padding:8px 0; border-top:1px solid var(--line); }.coding-command summary { cursor:pointer; color:var(--ink); }.coding-command pre { max-height:320px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; background:var(--rail); padding:10px; }
.coding-dialogue .coding-jump { position:absolute; bottom:210px; right:18px; }
@container molis-coding (max-width:720px) {
  .coding-stage { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr) auto; }
  .coding-tools { max-height:180px; border-left:0; border-top:1px solid var(--line); }
  .coding-tools:has([data-agent-review-item]) { max-height:45vh; }
  .coding-tool-tabs { flex:none; }.coding-result { min-height:0; padding:8px 12px; }
  .coding-result dl { display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:12px; margin:0; }
  .coding-result dt,.coding-result dd { margin:3px 0; }
  .coding-turns { padding:16px; }.coding-composer-actions { flex-wrap:wrap; }
  .coding-composer-actions [data-coding-model] { min-width:120px; }.coding-composer textarea { max-height:140px; }
}
`;
