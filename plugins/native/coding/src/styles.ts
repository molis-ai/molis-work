/** Layout only; controls, colors, and focus behavior use the shared system. */
export const CODING_STYLES = `
.coding-material { min-width:0; padding:12px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
.coding-material pre { max-height:14rem; max-width:100%; overflow:auto; white-space:pre; font-size:12px; }
[data-coding-workbench] { container: molis-coding / inline-size; }
.coding-directory { height:100%; min-height:0; display:flex; flex-direction:column; }
.coding-directory[data-coding-current-face=files] .coding-search,.coding-directory[data-coding-current-face=files] .coding-filters,.coding-directory[data-coding-current-face=files] [data-coding-sessions],.coding-directory[data-coding-current-face=files] [data-coding-new] { display:none; }
[data-coding-tools][data-companion-open=true]>:not([data-files-results]):not([data-git-results]):not(.coding-tool-tabs) { display:none; }
.coding-directory[data-coding-current-face=artifacts] > .coding-search,.coding-directory[data-coding-current-face=artifacts] > .coding-filters,.coding-directory[data-coding-current-face=artifacts] [data-coding-sessions],.coding-directory[data-coding-current-face=artifacts] [data-coding-new] { display:none; }
[data-coding-artifact-directory] { min-height:0; overflow:auto; }
[data-coding-artifact-list] .coding-session-row { display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; height:auto; text-align:left; white-space:normal; overflow-wrap:anywhere; }
[data-coding-artifact-list] strong { font-weight:400; }
[data-coding-artifact-list] .coding-session-row > span { color:var(--muted); font-size:11px; }
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
.coding-dialogue:has([data-coding-report-reader]:not([hidden])) > .coding-composer,
.coding-dialogue:has([data-coding-report-reader]:not([hidden])) > .coding-status { display:none; }
[data-coding-report-reader] > header { display:flex; flex-wrap:wrap; gap:8px; }
.coding-report { max-width:76ch; margin:16px auto; overflow-wrap:anywhere; color:var(--ink); font-size:13px; line-height:1.7; }
.coding-report h1,.coding-report h2,.coding-report h3 { font-weight:400; line-height:1.4; }
.coding-report h1 { font-size:22px; }.coding-report h2 { font-size:18px; }
.coding-report pre { position:relative; overflow:auto; padding:40px 12px 12px; background:var(--rail); border:1px solid var(--line); border-radius:var(--radius-control); }
.coding-report .coding-code-copy { position:absolute; top:4px; right:4px; }
.coding-report-source,[data-coding-report-status] { font-size:12px; color:var(--muted); }
[data-coding-report-list] { display:grid; gap:8px; }
.coding-turn { max-width:76ch; margin:0 auto 24px; font-size:14px; line-height:1.7; overflow-wrap:anywhere; }
.coding-turn[data-kind=user] { background:var(--rail); border-radius:var(--radius-control); padding:10px 14px; }
.coding-turn-receipt { display:block; margin-top:6px; color:var(--muted); font-size:12px; }
.coding-turn pre { position:relative; max-width:100%; overflow:auto; background:var(--rail); padding:44px 14px 14px; border:1px solid var(--line); border-radius:var(--radius-control); }
.coding-turn pre code { font-size:12px; }.coding-turn table { display:block; overflow:auto; border-collapse:collapse; }.coding-turn td,.coding-turn th { padding:5px 8px; border:1px solid var(--line); font-weight:400; }
.coding-turn h1,.coding-turn h2,.coding-turn h3 { font-weight:400; line-height:1.4; }.coding-turn h1 {font-size:22px}.coding-turn h2 {font-size:19px}.coding-turn h3 {font-size:16px}
.coding-turn .coding-code-copy { position:absolute; right:4px; top:4px; }.coding-activity { max-width:76ch; margin:0 auto 20px; color:var(--muted); font-size:12px; }.coding-activity pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:260px; overflow:auto; }.coding-activity summary { cursor:pointer; }
.coding-status { flex:none; min-height:18px; margin:0; padding:4px 14px; font-size:12px; color:var(--muted); }
.coding-status[data-error=true] { color:var(--tone-blocked,var(--ink)); }
.coding-question-card { max-width:76ch; margin:16px auto 24px; padding:16px; border:1px solid var(--line); border-radius:var(--radius-control); display:grid; gap:12px; }
.coding-question-prompt,.coding-question-options legend { font-size:14px; line-height:1.6; overflow-wrap:anywhere; }
.coding-question-options { min-width:0; margin:0; padding:0; border:0; display:grid; gap:8px; }
.coding-question-option { display:flex; align-items:baseline; gap:8px; font-size:13px; line-height:1.6; cursor:pointer; }
.coding-question-text { display:grid; gap:6px; font-size:12px; }.coding-question-text textarea { width:100%; resize:vertical; }
.coding-question-hint,[data-question-status] { margin:0; font-size:12px; line-height:1.6; color:var(--muted); }
.coding-question-card [data-coding-answer-submit] { justify-self:start; }
.coding-composer { flex:none; padding:8px 14px 12px; border-top:1px solid var(--line); display:grid; gap:6px; }
.coding-task-label { font-size:12px; color:var(--muted); }.coding-composer textarea { resize:vertical; width:100%; min-height:64px; max-height:220px; line-height:1.6; }
.coding-composer-actions { display:flex; gap:6px; align-items:center; }.coding-composer-actions [data-coding-intent] { width:auto; flex:none; max-width:45%; }.coding-composer-actions [data-coding-model] { flex:1; min-width:0; }.coding-composer small { font-size:11px; color:var(--muted); }
.coding-tools { overflow-y:auto; overscroll-behavior:contain; min-width:0; min-height:0; display:flex; flex-direction:column; border-left:1px solid var(--line); background:var(--paper); }
.coding-tools > * { flex-shrink:0; }
.coding-tool-tabs { min-height:34px; display:flex; align-items:center; gap:10px; padding:0 12px; border-bottom:1px solid var(--line); font-size:12px; }
.coding-result { flex:none; overflow:visible; padding:16px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }.coding-result dt { margin-top:12px; }.coding-result dd { margin:3px 0; color:var(--ink); white-space:pre-wrap; }
.coding-command { padding:8px 0; border-top:1px solid var(--line); }.coding-command summary { cursor:pointer; color:var(--ink); }.coding-command pre { max-height:320px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; background:var(--rail); padding:10px; }
.coding-dialogue .coding-jump { position:absolute; bottom:210px; right:18px; }
@container molis-coding (max-width:720px) {
  .coding-stage { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr) auto; }
  .coding-tools { max-height:180px; border-left:0; border-top:1px solid var(--line); }
  .coding-tools:has([data-agent-review-phase=pending],[data-agent-review-phase=approved],[data-agent-review-phase=reconcile]) { max-height:min(240px,30vh); }
  .coding-stage:has([data-coding-change-reader]:not([hidden])) { grid-template-rows:minmax(0,1fr); }
  .coding-stage:has([data-coding-change-reader]:not([hidden])) > .coding-dialogue { display:none; }
  .coding-tools:has([data-coding-change-reader]:not([hidden])) { max-height:none; }
  .coding-tool-tabs { flex:none; }.coding-result { min-height:0; padding:8px 12px; }
  .coding-result dl { display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:12px; margin:0; }
  .coding-result dt,.coding-result dd { margin:3px 0; }
  .coding-dialogue { overflow-y:auto; overscroll-behavior:contain; }
  .coding-turns { flex:1 0 120px; padding:16px; }.coding-composer-actions { flex-wrap:wrap; }
  .coding-composer-actions [data-coding-model] { min-width:120px; }.coding-composer textarea { max-height:140px; }
}
  .coding-method-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); }
  [data-coding-method-list] { display:grid; gap:var(--space-4); }
  [data-coding-change-files] { display:grid; gap:4px; }
  [data-coding-change-files] button { white-space:normal; text-align:left; }
  [data-coding-change-reader] header { display:flex; gap:4px; flex-wrap:wrap; }
  [data-coding-change-reader] .diff .diff-rows li { grid-template-columns:44px 44px minmax(max-content,1fr); }
  [data-coding-change-reader] [data-coding-line] { min-width:40px; min-height:40px; padding:4px; font:inherit; }
  [data-coding-feedback-list] { display:grid; gap:12px; }
  [data-coding-feedback-list] label { display:grid; gap:4px; }
  [data-coding-feedback-list] textarea { width:100%; resize:vertical; }
  [data-coding-tools]:has([data-coding-change-reader]:not([hidden])) > :not([data-coding-change-reader]):not(.coding-tool-tabs) { display:none; }
  [data-coding-change-files] [aria-pressed=true] { background:var(--nav-active); }
`;
