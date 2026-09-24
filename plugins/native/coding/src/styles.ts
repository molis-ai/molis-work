/** Layout only; controls, colors, and focus behavior use the shared system. */
export const CODING_STYLES = `
.coding-material { min-width:0; padding:12px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
[data-coding-subagents] > details { padding:8px 0; border-top:1px solid var(--line); }
[data-coding-subagents] summary { cursor:pointer; color:var(--ink); }
[data-coding-subagents] .coding-turn { font-size:13px; margin-top:12px; color:var(--ink); }
[data-coding-subagents] .mw-field { display:grid; gap:4px; margin:12px 0 8px; }
[data-coding-subagents] textarea { width:100%; resize:vertical; }
.coding-material pre { max-height:14rem; max-width:100%; overflow:auto; white-space:pre; font-size:12px; }
[data-coding-workbench] { container: molis-coding / inline-size; }
.coding-layout { display:grid; grid-template-columns:240px minmax(0,1fr); height:100%; min-height:0; }
.coding-layout .coding-stage { min-width:0; }
.coding-directory-back { display:none; }
.coding-directory { height:100%; min-height:0; }
.coding-directory .mw-dir__body { min-height:0; }
.coding-directory .mw-dir__add { flex:none; margin-top:8px; }
[data-coding-workbench]:not([data-coding-detail=true]) .coding-dialogue,
[data-coding-workbench]:not([data-coding-detail=true]) .coding-tools { display:none; }
[data-coding-detail=true] .coding-start { display:none; }
.coding-directory[data-coding-current-face=files] .coding-search,.coding-directory[data-coding-current-face=files] .coding-filters,.coding-directory[data-coding-current-face=files] [data-coding-sessions],.coding-directory[data-coding-current-face=files] [data-coding-new] { display:none; }
[data-coding-tools][data-companion-open=true]>:not([data-files-results]):not([data-git-results]):not(.coding-tool-tabs) { display:none; }
.coding-directory[data-coding-current-face=artifacts] .coding-search,.coding-directory[data-coding-current-face=artifacts] .coding-filters,.coding-directory[data-coding-current-face=artifacts] [data-coding-sessions],.coding-directory[data-coding-current-face=artifacts] [data-coding-new] { display:none; }
[data-coding-artifact-directory] { min-height:0; overflow:auto; }
.coding-directory[data-coding-current-face=taskboard] .coding-search,.coding-directory[data-coding-current-face=taskboard] .coding-filters,.coding-directory[data-coding-current-face=taskboard] [data-coding-sessions],.coding-directory[data-coding-current-face=taskboard] [data-coding-new] { display:none; }
[data-coding-taskboard] { min-height:0; overflow:auto; padding:4px 8px; font-size:12px; }
[data-coding-taskboard] .mw-field { display:grid; gap:4px; }
[data-coding-taskboard-status],.coding-board-meta { color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
.coding-board-branch { border-bottom:1px solid var(--line); padding:8px 0; }
.coding-board-branch summary { cursor:pointer; overflow-wrap:anywhere; color:var(--ink); }
.coding-board-branch ol { margin:8px 0; padding-left:22px; }
.coding-board-branch li { padding:4px 0; overflow-wrap:anywhere; }
[data-coding-taskboard] .coding-board-node { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; height:auto; min-height:28px; width:100%; white-space:normal; text-align:left; overflow-wrap:anywhere; gap:4px; }
[data-coding-taskboard] .coding-board-node > span { max-width:100%; white-space:normal; }
.coding-board-node .mw-status { white-space:normal; font-size:11px; }
.coding-board-children { margin:8px 0 0 8px; padding-left:8px; border-left:1px solid var(--line); }
[data-coding-artifact-list] .coding-session-row { display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; height:auto; text-align:left; white-space:normal; overflow-wrap:anywhere; }
[data-coding-artifact-list] strong { font-weight:400; }
[data-coding-artifact-list] .coding-session-row > span { color:var(--muted); font-size:11px; }
.coding-faces { display:flex; gap:2px; padding:0 4px 8px; }
.coding-faces .coding-face { flex:1; background:transparent; border:0; border-radius:var(--radius-item); box-shadow:none; }
.coding-faces .coding-face[aria-pressed=true] { color:var(--plugin-tint,var(--ink)); background:var(--nav-active); }
.coding-face svg { width:15px; height:15px; }
.coding-query { padding:0 4px 8px; }
.coding-search { display:block; }.coding-search input { width:100%; }
.coding-filters { display:flex; margin-top:8px; }
.coding-filter { flex:1; min-width:0; }
.coding-session-list { min-height:0; }
.coding-session-row { margin-bottom:1px; }
.coding-session-time { font-variant-numeric:tabular-nums; }
.coding-stage { height:100%; min-height:0; display:grid; grid-template-columns:minmax(0,1fr); background:var(--paper); }
[data-coding-results=true] .coding-stage { grid-template-columns:minmax(0,1fr) 320px; }
.coding-dialogue { position:relative; min-width:0; }
.mw-layout-primitives .coding-dialogue-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.coding-identity { display:flex; align-items:flex-start; gap:8px; min-width:0; }
.coding-identity-copy { flex:1; min-width:0; }
.coding-identity-copy h2,.coding-identity-copy p { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-identity-copy p { max-width:60ch; }
.coding-context { flex-wrap:wrap; gap:4px; margin:0; padding:0; }
[data-coding-goal-dialog] [data-coding-goal-list] {
  display:flex; flex-direction:column; gap:1px; max-height:280px; overflow:auto; margin:0; padding:2px 0;
}
[data-coding-goal-dialog] [data-coding-goal-list]:not(:has(.mw-dir-row)) {
  font-size:12px; line-height:1.5; color:var(--muted);
}
[data-coding-goal-dialog] [data-coding-goal-list] .mw-dir-row.is-selected::before { content:none; }
.coding-workspace svg { width:12px; height:12px; margin-right:4px; }
.coding-turns { overflow-anchor:none; overscroll-behavior:contain; }
.coding-start .mw-empty { padding:24px 0; }
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
.coding-composer { flex:none; display:flex; flex-direction:column; align-items:center; gap:8px; border:0; background:transparent; }
.coding-composer > .coding-context,
.coding-composer-shell,
.coding-composer-footnote,
.coding-composer .coding-model-setup { width:min(100%, 76ch); }
.coding-composer > .coding-context { justify-content:flex-start; }
.coding-composer-shell {
  display:flex; flex-direction:column; min-width:0;
  padding:2px 6px 6px; border:1px solid var(--control-input); border-radius:12px; background:var(--paper);
}
.coding-composer-shell:has(textarea:focus-visible) {
  border-color:var(--ink);
  outline:var(--focus-stroke, 1px solid var(--ink)); outline-offset:var(--focus-stroke-inset, -1px);
}
.coding-composer-shell textarea {
  resize:vertical; width:100%; min-height:72px; max-height:220px; line-height:1.65;
  margin:0; padding:10px 8px 4px; border:0; border-radius:8px; background:transparent; box-shadow:none;
  caret-color:var(--ink);
}
.coding-composer-shell textarea:is(:hover, :focus, :focus-visible, :disabled) {
  border:0; outline:none; box-shadow:none; background:transparent;
}
.coding-composer-bar { display:flex; flex-wrap:wrap; align-items:center; gap:2px 4px; min-width:0; padding:2px 2px 0 2px; }
.coding-composer-leading { display:flex; flex:1; flex-wrap:wrap; align-items:center; gap:2px; min-width:0; }
.coding-composer-sep { width:1px; height:16px; margin:0 4px; background:var(--line); flex:none; }
.coding-composer-context { display:flex; align-items:center; gap:0; min-width:0; }
.coding-composer-context [data-slot=button-label] { display:none; }
.coding-composer-context .mw-btn { position:relative; width:28px; min-width:28px; padding:0; color:var(--muted); }
.coding-composer-bar .mw-select-picker { width:auto; flex:none; }
.coding-composer-bar .mw-select-picker:has([data-coding-intent]) { max-width:7.5rem; }
.coding-composer-bar .mw-select-picker:has([data-coding-model]) { max-width:14rem; }
.coding-composer-bar .mw-select-picker__trigger {
  width:auto; max-width:100%; height:28px; min-height:28px; padding:0 20px 0 8px;
  border:0; border-radius:8px; background-color:transparent; box-shadow:none;
  color:var(--ink-soft); font-size:12px;
}
.coding-composer-bar .mw-select-picker__trigger:hover:not(:disabled) { background-color:var(--nav-hover); color:var(--ink); }
.coding-composer-bar .mw-select-picker__trigger:disabled { background-color:transparent; color:var(--faint); }
.coding-composer-bar .mw-select-picker__trigger:focus-visible {
  border:0; box-shadow:none;
  outline:var(--focus-stroke, 1px solid var(--ink)); outline-offset:var(--focus-stroke-inset, -1px);
}
.coding-composer-bar .coding-results-toggle { height:28px; min-height:28px; padding:0 8px; color:var(--muted); font-size:12px; }
.coding-composer-bar [data-coding-stop] { height:28px; min-height:28px; padding:0 8px; font-size:12px; }
.coding-composer-bar [data-coding-send] { margin-left:auto; flex:none; height:28px; min-height:28px; padding-inline:12px; }
.coding-composer small { font-size:11px; color:var(--muted); overflow-wrap:anywhere; }
.coding-composer-footnote { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.coding-composer-footnote kbd { font-size:10px; flex:none; }
.coding-composer .coding-model-setup { align-self:center; justify-content:flex-start; padding:0; height:auto; min-height:20px; font-size:12px; }
.coding-status { padding:4px 28px; min-height:0; }
.coding-status:empty { display:none; }
.coding-dialogue > .coding-status { width:min(100%, 76ch); margin-inline:auto; padding-inline:0; }
.coding-tools { display:none; overflow-y:auto; overscroll-behavior:contain; min-width:0; min-height:0; border-left:1px solid var(--line); background:var(--paper); }
[data-coding-results=true] .coding-tools { display:block; }
.coding-tool-tabs { display:flex; align-items:center; padding:16px; gap:8px; }
.coding-result { padding:12px 20px; font-size:13px; color:var(--muted); overflow-wrap:anywhere; }
.coding-result h3 { margin:0 0 12px; font-size:13px; font-weight:500; color:var(--ink); }
.coding-result dt { margin-top:12px; }.coding-result dd { margin:4px 0; color:var(--ink); white-space:pre-wrap; }
.coding-command { padding:8px 0; }.coding-command summary { cursor:pointer; color:var(--ink); }.coding-command pre { max-height:320px; overflow:auto; white-space:pre-wrap; font-size:12px; background:var(--rail); padding:12px; }
.coding-dialogue .coding-jump { position:absolute; bottom:240px; right:28px; }
.coding-stage:has([data-companion-open=true]),.coding-stage:has([data-coding-change-reader]:not([hidden])) { grid-template-columns:minmax(0,1fr); }
.coding-stage:has([data-companion-open=true]) .coding-dialogue,.coding-stage:has([data-coding-change-reader]:not([hidden])) .coding-dialogue { display:none; }
.coding-stage:has([data-companion-open=true]) .coding-tools,.coding-stage:has([data-coding-change-reader]:not([hidden])) .coding-tools { display:block; }
@container molis-coding (max-width:1100px) {
  [data-coding-results=true] .coding-stage { grid-template-columns:minmax(0,1fr); }
  [data-coding-results=true] .coding-dialogue { display:none; }
  .coding-composer-context .mw-btn { width:32px; min-width:32px; }
  .coding-composer-context .mw-btn[data-count]:not([data-count=""])::after { content:attr(data-count); position:absolute; right:0; top:0; font-size:9px; }
}
@container molis-coding (max-width:760px) {
  .coding-layout { grid-template-columns:minmax(0,1fr); }
  [data-coding-workbench]:not([data-coding-detail=true]) .coding-stage { display:none; }
  [data-coding-detail=true] .coding-directory { display:none; }
  .coding-directory-back { display:inline-flex; }
  .mw-layout-primitives .coding-directory { width:100%; }
  .mw-layout-primitives .coding-dialogue-head { padding:16px 16px 8px; }
  .mw-layout-primitives .coding-dialogue > .mw-frame__panel { padding:8px 16px 16px; }
  .mw-layout-primitives .coding-composer { padding:8px 16px 16px; }
  .coding-identity-copy p { max-width:38vw; }
  .coding-welcome { padding:16px 0; }
  .coding-starters { display:grid; }
  .coding-tools { border:0; }
  .coding-turns { flex:1 1 160px; min-height:80px; }
  .coding-dialogue { overflow-y:auto; }
  .coding-composer-context .mw-btn { width:44px; min-width:44px; }
  .coding-composer-shell textarea { font-size:16px; max-height:120px; }
  .coding-composer-bar .mw-select-picker__trigger { padding-inline:8px; }
  .coding-composer-footnote { display:none; }
  .coding-status { padding-inline:16px; }
  [data-coding-workbench] :is(.mw-btn,.mw-toggle,.mw-dir-row,.mw-dir__add,.mw-select-picker__trigger) { min-height:44px; }
}
@media (prefers-reduced-motion:no-preference) {
  [data-coding-results=true] .coding-tools { animation:creative-arrive var(--motion-normal,190ms) var(--ease-out) both; }
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

/* Timeline: tool calls read as rows, a round closes with what happened. */
.coding-activity { max-width:76ch; margin:-12px auto 20px; color:var(--muted); font-size:12.5px; }
.coding-activity > summary { list-style:none; display:flex; align-items:center; gap:8px; width:fit-content; max-width:100%; padding:4px 10px 4px 8px; border-radius:999px; cursor:pointer; color:var(--muted); transition:background-color .15s ease, color .15s ease; }
.coding-activity > summary::-webkit-details-marker { display:none; }
.coding-activity > summary:hover { background:var(--nav-hover); color:var(--ink); }
.coding-activity[open] > summary { color:var(--ink); }
.coding-tools-summary { display:inline-flex; align-items:center; gap:7px; min-width:0; }
.coding-tools-summary > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-tools-summary svg, .coding-tool svg, .coding-run-card svg, .coding-live svg { width:14px; height:14px; flex:none; }
.coding-tools-summary.is-live > span:last-child { background:linear-gradient(90deg, var(--muted) 0%, var(--ink) 50%, var(--muted) 100%); background-size:200% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation:coding-shimmer 1.8s linear infinite; }
.coding-tools-count { font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums; }
.coding-tool-list { margin:6px 0 0 11px; padding-left:14px; border-left:1px solid var(--line); display:grid; gap:1px; animation:coding-rise .18s ease-out; }
.coding-tool > summary, .coding-tool-head { list-style:none; display:flex; align-items:center; gap:8px; min-width:0; padding:3px 6px; border-radius:6px; color:var(--muted); }
.coding-tool > summary::-webkit-details-marker { display:none; }
.coding-tool > summary { cursor:pointer; }
.coding-tool > summary:hover { background:var(--nav-hover); color:var(--ink); }
.coding-tool code { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--ink); background:none; padding:0; }
.coding-tool-icon { display:inline-flex; color:var(--faint); }
.coding-tool-verb { flex:none; }
.coding-tool-state { display:inline-flex; align-items:center; gap:4px; margin-left:auto; flex:none; font-size:11px; font-variant-numeric:tabular-nums; }
.coding-tool-state[data-tone=ok] { color:var(--green); }
.coding-tool-state[data-tone=failed] { color:var(--red); }
.coding-tool-state[data-tone=unknown] { color:var(--amber); }
.coding-tool-output { margin:4px 0 8px 28px; max-height:280px; overflow:auto; padding:8px 10px; border-radius:8px; background:var(--rail); color:var(--ink); font-size:11.5px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
.coding-spinner { width:12px; height:12px; flex:none; border-radius:50%; border:1.5px solid color-mix(in srgb, var(--muted) 30%, transparent); border-top-color:var(--ink); animation:coding-spin .8s linear infinite; }
.coding-inline-review { max-width:76ch; margin:0 auto 18px; animation:coding-rise .22s ease-out; }
.coding-inline-review .agent-review { padding:0; border:0; }
.coding-inline-review [data-agent-review-item]:not([data-agent-review-phase=pending]) { display:none; }
.coding-inline-review [data-agent-review-phase=pending] { border-color:color-mix(in srgb, var(--amber) 45%, var(--line)); box-shadow:0 1px 2px rgb(0 0 0 / .04), 0 0 0 3px color-mix(in srgb, var(--amber) 10%, transparent); }
.coding-inline-review .agent-review-actions .mw-btn--primary { min-width:96px; }
.coding-run-footer { max-width:76ch; margin:0 auto 28px; }
.coding-live { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; }
.coding-live-text { color:var(--ink); }
.coding-run-footer[data-state=live] .coding-live-text { background:linear-gradient(90deg, var(--muted) 0%, var(--ink) 50%, var(--muted) 100%); background-size:200% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation:coding-shimmer 1.8s linear infinite; }
.coding-run-footer[data-state=waiting] .coding-live { color:var(--amber); }
.coding-live-time { font-variant-numeric:tabular-nums; color:var(--faint); }
.coding-pulse { width:8px; height:8px; border-radius:50%; background:var(--blue); box-shadow:0 0 0 0 color-mix(in srgb, var(--blue) 45%, transparent); animation:coding-pulse 1.4s ease-out infinite; }
.coding-run-card { padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--paper); animation:coding-rise .24s ease-out; }
.coding-run-card header { display:flex; align-items:center; gap:8px; }
.coding-run-card header strong { font-weight:500; font-size:13.5px; color:var(--ink); }
.coding-run-mark { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; background:var(--green-soft); color:var(--green); }
.coding-run-card[data-tone=failed] .coding-run-mark { background:var(--red-soft); color:var(--red); }
.coding-run-card[data-tone=stopped] .coding-run-mark { background:var(--rail); color:var(--muted); }
.coding-run-round { margin-left:auto; font-size:11px; color:var(--faint); }
.coding-run-facts { margin:6px 0 0 28px; font-size:12.5px; color:var(--muted); }
.coding-run-reason { margin:6px 0 0 28px; font-size:12.5px; color:var(--ink); }
.coding-run-files { list-style:none; margin:8px 0 0 28px; padding:0; display:grid; gap:2px; font-size:12px; }
.coding-run-files li { display:flex; align-items:center; gap:6px; color:var(--muted); }
.coding-run-files code { color:var(--ink); background:none; padding:0; }
.coding-run-actions { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0 28px; }
.coding-run-actions .mw-btn { height:28px; min-height:28px; font-size:12px; gap:6px; }
@keyframes coding-spin { to { transform:rotate(360deg); } }
@keyframes coding-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
@keyframes coding-pulse { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--blue) 45%, transparent); } 100% { box-shadow:0 0 0 8px transparent; } }
@keyframes coding-rise { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .coding-spinner, .coding-pulse, .coding-tools-summary.is-live > span:last-child, .coding-run-footer[data-state=live] .coding-live-text, .coding-tool-list, .coding-inline-review, .coding-run-card { animation:none; } }

/* A new session opens like a blank page: the question, the composer, and a few ways in. */
.coding-dialogue:has([data-coding-welcome]) .coding-turns { display:flex; flex-direction:column; justify-content:flex-end; }
.coding-dialogue:has([data-coding-welcome]) > .coding-composer { margin-bottom:clamp(24px, 18vh, 180px); }
.coding-dialogue:has([data-coding-welcome]) > .coding-status:empty { display:none; }
.coding-welcome { width:min(100%, 76ch); margin:0 auto; padding:0 0 18px; text-align:left; animation:coding-rise .3s ease-out; }
.coding-welcome h2 { margin:6px 0 6px; font-size:24px; font-weight:500; letter-spacing:-.01em; color:var(--ink); }
.coding-welcome > p { margin:0; color:var(--muted); font-size:13.5px; line-height:1.6; }
.coding-welcome-kicker { display:inline-flex; align-items:center; gap:6px; margin:0 !important; padding:2px 10px 2px 8px; border-radius:999px; background:var(--rail); color:var(--muted) !important; font-size:12px !important; }
.coding-welcome-kicker svg { width:13px; height:13px; }
.coding-starters { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; margin-top:18px; }
.coding-starter { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; min-height:44px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:var(--paper); color:var(--ink); text-align:left; font:inherit; cursor:pointer; transition:border-color .15s ease, background-color .15s ease, transform .15s ease; }
.coding-starter:hover:not(:disabled) { border-color:var(--line-strong); background:var(--nav-hover); transform:translateY(-1px); }
.coding-starter:disabled { opacity:.5; cursor:default; }
.coding-starter svg { width:16px; height:16px; color:var(--muted); }
.coding-starter strong { font-weight:500; font-size:13px; }
.coding-starter small { font-size:11px; color:var(--faint); }
@media (max-width: 640px) { .coding-starters { grid-template-columns:minmax(0,1fr); } .coding-dialogue:has([data-coding-welcome]) > .coding-composer { margin-bottom:12px; } }

.coding-start { display:grid; place-items:center; min-height:0; height:100%; padding:24px; }
.coding-start-hero { display:grid; justify-items:center; gap:10px; max-width:420px; text-align:center; animation:coding-rise .3s ease-out; }
.coding-start-mark { display:grid; place-items:center; width:44px; height:44px; border-radius:12px; background:var(--rail); color:var(--ink); }
.coding-start-mark svg { width:22px; height:22px; }
.coding-start-hero h2 { margin:6px 0 0; font-size:22px; font-weight:500; color:var(--ink); }
.coding-start-hero p { margin:0 0 6px; color:var(--muted); font-size:13.5px; line-height:1.6; }
.coding-start-hero small { color:var(--faint); font-size:12px; }

.coding-identity { align-items:center; }
.coding-identity-copy h2 { font-size:15px; font-weight:500; line-height:1.35; color:var(--ink); }
.coding-workspace-chip { display:inline-flex; align-items:center; gap:5px; max-width:100%; margin-top:3px; color:var(--muted); font-size:12px; }
.coding-workspace-chip svg { width:12px; height:12px; flex:none; opacity:.75; }
.coding-workspace-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-head-actions { display:flex; align-items:center; gap:8px; flex:none; }
.coding-head-actions .coding-results-toggle { height:28px; min-height:28px; padding:0 10px; gap:6px; font-size:12px; color:var(--muted); }
.coding-head-actions .coding-results-toggle svg { width:15px; height:15px; }
.coding-phase { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px; border-radius:999px; font-size:12px; background:color-mix(in srgb, var(--blue) 10%, transparent); color:var(--blue-dark, var(--blue)); }
.coding-phase::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; animation:coding-pulse 1.4s ease-out infinite; }
.coding-phase[data-phase=awaiting-review], .coding-phase[data-phase=awaiting-input] { background:color-mix(in srgb, var(--amber) 14%, transparent); color:var(--amber); }
.coding-phase[data-phase=awaiting-review]::before, .coding-phase[data-phase=awaiting-input]::before { animation:none; }

/* Composer: the task first, then mode, model and send; context lives behind "+". */
.coding-composer-shell { border-radius:16px !important; transition:border-color .15s ease, box-shadow .15s ease; }
.coding-composer-shell:focus-within { box-shadow:0 0 0 3px color-mix(in srgb, var(--focus, var(--blue)) 14%, transparent); }
.coding-attach { position:relative; }
.coding-attach-toggle { width:28px !important; min-width:28px !important; height:28px; min-height:28px; padding:0 !important; border-radius:999px !important; color:var(--muted); }
.coding-attach-toggle[aria-expanded=true] { background:var(--nav-active); color:var(--ink); }
.coding-attach-toggle[aria-expanded=true] svg { transform:rotate(45deg); }
.coding-attach-toggle svg { transition:transform .15s ease; }
.coding-attach-menu { position:absolute; left:0; bottom:calc(100% + 8px); z-index:20; display:grid; gap:2px; min-width:196px; padding:6px; border:1px solid var(--line); border-radius:12px; background:var(--paper); box-shadow:0 10px 30px rgb(0 0 0 / .12), 0 2px 6px rgb(0 0 0 / .06); animation:coding-rise .14s ease-out; }
.coding-attach-menu .coding-composer-context { display:grid; gap:2px; }
.coding-attach-menu .mw-btn { justify-content:flex-start; width:100% !important; min-width:0 !important; height:32px; padding:0 10px !important; gap:8px; color:var(--ink) !important; }
.coding-attach-menu .coding-composer-context [data-slot=button-label] { display:inline; }
.coding-composer-bar [data-coding-send] { border-radius:999px; }
`;
