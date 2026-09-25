/** Source-first Feed workbench. Shared shell, form and theme tokens stay authoritative. */
export const FEED_STYLES = `
body.immersive-workbench .feed-workbench.plugin-stage-shell {
  display: grid; grid-template-columns: 236px minmax(0,1fr); grid-template-rows: auto auto minmax(0,1fr);
  container: feed-workbench / inline-size; height:100%; padding:0; gap:0; background:var(--paper);
}
.feed-workbench [hidden] { display:none !important; }
.feed-workbench :is(button,input,textarea,select):focus-visible { outline:var(--focus-stroke); outline-offset:var(--focus-stroke-inset); }
.feed-source-rail { grid-column:1; grid-row:1/-1; min-height:0; padding:16px 10px; display:flex; flex-direction:column; gap:4px; border-right:1px solid var(--line); background:var(--nav-bg); overflow:auto; }
.feed-source-rail > header { display:flex; align-items:center; justify-content:space-between; padding:0 8px 16px; }
.feed-source-rail h1 { margin:0; font-size:18px; font-weight:400; }
.feed-source-rail > nav { display:flex; flex-direction:column; gap:4px; }
.feed-source-nav { display:grid; grid-template-columns:24px minmax(0,1fr) auto; align-items:center; gap:8px; min-height:58px; padding:10px 9px; border:0; border-radius:8px; color:var(--ink-soft); background:transparent; text-align:left; cursor:pointer; width:100%; font:inherit; }
.feed-source-nav:hover { background:var(--nav-hover); }
.feed-source-nav.is-selected { background:var(--nav-active); color:var(--ink); }
.feed-source-nav-icon { align-self:start; padding-top:2px; color:var(--muted); }
.feed-source-nav-icon svg { width:18px; height:18px; }
.feed-source-nav strong { display:block; font-size:13px; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.feed-source-nav small { display:block; margin-top:4px; color:var(--muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.feed-source-nav[data-feed-source-state="attention"] small { color:var(--tone-attention,var(--amber)); }
.feed-source-nav em { align-self:start; padding-top:2px; font-style:normal; color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
.feed-rail-label { color:var(--muted); font-size:11px; padding:22px 10px 8px; }
.feed-source-rail footer { margin-top:auto; padding:24px 6px 4px; }
.feed-source-rail footer p { margin:12px 6px 0; font-size:11px; line-height:1.6; color:var(--muted); }
.feed-source-header { grid-column:2; grid-row:1; min-width:0; padding:24px 28px 0; border-bottom:1px solid var(--line); }
.feed-source-heading { display:flex; align-items:center; gap:12px; min-width:0; }
.feed-source-heading > div { flex:1; min-width:0; }
.feed-source-heading h2 { margin:0; font-size:20px; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.feed-source-heading p { margin:6px 0 0; font-size:12px; color:var(--muted); }
.feed-source-tabs { display:flex; gap:24px; margin-top:20px; }
.feed-source-tabs button { border:0; border-bottom:2px solid transparent; background:none; padding:10px 0 11px; font:inherit; font-size:12px; color:var(--muted); cursor:pointer; }
.feed-source-tabs button[aria-current] { color:var(--ink); border-bottom-color:var(--ink); }
.feed-mobile-sources { display:none; }
body.immersive-workbench .feed-workbench > .feed-stage-toolbar { grid-column:2; grid-row:2; position:relative; inset:auto; width:auto; max-width:none; padding:12px 28px; border:0; margin:0; justify-content:flex-start; }
body.immersive-workbench .feed-workbench.plugin-stage-shell .feed-stage-search { display:flex; height:32px; max-width:280px; flex:1; border-color:transparent; padding-left:0; }
.feed-workbench .feed-stage-count { margin-left:auto; font-size:11px; color:var(--muted); }
body.immersive-workbench .feed-workbench > .feed-stage-list { grid-column:2; grid-row:3; position:relative; inset:auto; width:auto; height:auto; max-width:none; margin:0; padding:0 20px 32px; }
.feed-workbench[data-selected-source]:not([data-selected-source="all"]) .goal-collection-fold > summary { display:none; }
body.immersive-workbench .feed-workbench .feed-stage-entry,
body.immersive-workbench .feed-workbench .plugin-stage-list .goal-collection-fold .feed-stage-entry { display:grid; grid-template-columns:minmax(0,1fr) 108px 78px; align-items:center; gap:12px; min-height:78px; height:auto; padding:14px 10px; border-radius:6px; border-bottom:1px solid var(--line); }
.feed-workbench .feed-stage-leading { display:flex; gap:10px; min-width:0; align-items:start; }
.feed-workbench .feed-entry-copy { display:block; min-width:0; }
body.immersive-workbench .feed-workbench .feed-entry-copy strong { display:block; white-space:normal; font-size:13px; font-weight:400; line-height:1.55; }
.feed-workbench .feed-entry-preview { display:block; margin-top:5px; font-size:12px; line-height:1.6; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.feed-workbench .feed-stage-entry .feed-entry-source { display:none; }
.feed-workbench .feed-stage-entry time { font-size:11px; color:var(--muted); }
body.immersive-workbench .feed-workbench > .feed-stage-workspace { grid-column:2; grid-row:2/-1; position:relative; inset:auto; width:auto; border:0; height:100%; }
body.immersive-workbench .feed-workbench[data-expanded="true"] > :is(.feed-stage-list,.feed-stage-toolbar) { display:none; }
.feed-workbench .plugin-stage-detail-bar { padding:8px 22px; border-bottom:1px solid var(--line); }
body.immersive-workbench .feed-workbench .feed-stage-item-detail { padding:24px 32px 40px; overflow:auto; flex:1; }
body.immersive-workbench .feed-workbench .feed-stage-item-detail .feed-detail { max-width:76ch; margin-inline:auto; }
body.immersive-workbench .feed-workbench .feed-stage-item-detail .feed-detail-header h1 { display:block; font-size:23px; font-weight:400; line-height:1.45; margin:0 0 16px; }
body.immersive-workbench .feed-workbench .feed-stage-item-detail .feed-detail-body { max-height:none; overflow:visible; }
.feed-workbench > .feed-setup-panel { grid-column:2; grid-row:2/-1; position:relative; inset:auto; width:100%; height:100%; min-height:0; padding:0; background:var(--paper); overflow:hidden; }
.feed-workbench[data-feed-view="settings"] > :is(.feed-stage-toolbar,.feed-stage-list,.feed-stage-workspace),
.feed-workbench[data-feed-view="rules"] > :is(.feed-stage-toolbar,.feed-stage-list,.feed-stage-workspace),
.feed-workbench[data-feed-view="add"] > :is(.feed-stage-toolbar,.feed-stage-list,.feed-stage-workspace) { display:none; }
.feed-setup-panel .feed-task-dialog-shell { width:100%; height:100%; display:flex; flex-direction:column; min-height:0; }
.feed-setup-panel .mw-form__header { padding:22px 28px 10px; border:0; display:flex; justify-content:space-between; flex:none; }
.feed-setup-panel .mw-form__header h2 { margin:0; font-weight:400; font-size:17px; }
.feed-setup-panel .mw-form__header p { margin:6px 0 0; font-size:12px; line-height:1.6; color:var(--muted); }
.feed-setup-panel .mw-form__body { padding:12px 28px 28px; flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
.feed-setup-panel :is([data-feed-task-config],[data-feed-source-setup],[data-feed-source-choices]) { max-width:700px; width:100%; margin-inline:auto; }
.feed-setup-panel .mw-form__footer { flex:none; display:flex; justify-content:flex-end; gap:8px; padding:12px 28px; border-top:1px solid var(--line); background:var(--paper); }
.feed-setup-panel label { display:flex; flex-direction:column; gap:7px; margin:16px 0; font-size:12px; color:var(--ink-soft); }
.feed-setup-panel :is(input:not([type=checkbox]),textarea) { box-sizing:border-box; width:100%; min-height:36px; padding:9px 11px; background:var(--paper); border:1px solid var(--line-strong); border-radius:6px; color:var(--ink); font:inherit; font-size:13px; }
.feed-setup-panel input[readonly] { background:var(--nav-bg); color:var(--muted); }
.feed-setup-panel textarea { resize:vertical; line-height:1.65; }
.feed-setup-panel :is(label small,p) { color:var(--muted); line-height:1.65; font-size:12px; }
.feed-setup-panel .check-row { flex-direction:row; align-items:center; }
.feed-setup-panel .feed-task-health { display:flex; justify-content:space-between; gap:12px; font-size:12px; padding:10px 0; color:var(--muted); }
.feed-setup-panel .feed-task-health strong { color:var(--ink-soft); font-weight:400; }
.feed-setup-panel .feed-task-extra { padding:16px 0; border-top:1px solid var(--line); margin:16px 0 0; }
.feed-setup-panel .feed-task-extra summary { cursor:pointer; font-size:13px; color:var(--ink); padding:4px 0; }
.feed-setup-panel :is(.feed-plan-actions,.feed-task-controls,.feed-config-actions,.feed-rule-actions) { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.feed-setup-panel .feed-source-choice { display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:12px; width:100%; padding:18px 8px; border:0; border-bottom:1px solid var(--line); border-radius:0; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
.feed-setup-panel .feed-source-choice:hover { background:var(--nav-hover); }
.feed-setup-panel .feed-source-choice strong { font-size:14px; font-weight:400; }
.feed-setup-panel .feed-source-choice small { font-size:12px; color:var(--muted); }
.feed-setup-panel .feed-source-choice svg { width:20px; height:20px; color:var(--muted); }
.feed-setup-panel .feed-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.feed-setup-panel h3 { margin:0; font-size:14px; font-weight:400; color:var(--ink); }
.feed-section-heading > span { font-size:11px; color:var(--muted); }
body.immersive-workbench .feed-workbench .feed-setup-panel .feed-capture-rule { display:flex; gap:12px; align-items:center; padding:16px 0; border-bottom:1px solid var(--line); }
body.immersive-workbench .feed-workbench .feed-capture-rule-copy { display:block; width:auto; flex:1; min-width:0; }
.feed-setup-panel .feed-capture-rule-copy strong { font-size:13px; font-weight:400; }
.feed-setup-panel .feed-capture-rule-copy :is(p,small) { margin:5px 0; font-size:12px; line-height:1.6; color:var(--muted); }
body.immersive-workbench .feed-workbench .feed-capture-rule-actions { display:flex; width:auto; flex:none; gap:6px; }
body.immersive-workbench .feed-workbench .feed-capture-rule-actions .mw-btn { width:auto; min-width:0; }
body.immersive-workbench .feed-workbench .feed-capture-rule-copy :is(strong,p,small) { white-space:normal; overflow-wrap:anywhere; }
.feed-rule-composer { border-top:1px solid var(--line); margin-top:24px; padding-top:24px; }
.feed-rule-modes { display:flex; flex-wrap:wrap; gap:4px; padding:3px; width:fit-content; background:var(--nav-bg); border-radius:7px; margin:18px 0; }
.feed-rule-modes button { font:inherit; font-size:12px; color:var(--muted); background:transparent; border:0; border-radius:5px; min-height:30px; padding:5px 12px; cursor:pointer; }
.feed-rule-modes button[aria-pressed=true] { color:var(--ink); background:var(--nav-active); }
.feed-rule-preview { padding:16px 0; border-block:1px solid var(--line); margin-top:20px; }
.feed-rule-preview > strong { font-size:12px; font-weight:400; }
.feed-rule-preview-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; padding:10px 0; font-size:12px; line-height:1.6; }
.feed-rule-preview-outcome { color:var(--muted); }
.feed-rule-preview-outcome[data-match=true] { color:var(--tone-done,var(--green)); }
.feed-rule-note { font-size:11px !important; }
[data-feed-rule-status][data-error=true] { color:var(--tone-attention,var(--amber)); }
@container feed-workbench (max-width:700px) {
  .feed-source-rail { position:absolute; inset:0 auto 0 0; width:min(260px,85%); z-index:40; box-shadow:var(--shadow-lg); display:none; }
  .feed-workbench[data-rail-open=true] .feed-source-rail { display:flex; }
  .feed-source-header { grid-column:1/-1; padding:18px 16px 0; }
  .feed-mobile-sources { display:inline-flex; }
  .feed-source-heading h2 { font-size:18px; }
  .feed-source-tabs { margin-top:12px; }
  .feed-setup-panel .mw-form__body { padding:12px 18px 24px; }
  .feed-setup-panel .mw-form__header { padding:18px 18px 8px; }
  .feed-setup-panel .mw-form__footer { padding:12px 18px; }
  .feed-setup-panel .feed-source-choice { grid-template-columns:24px minmax(0,1fr); }
  .feed-setup-panel .feed-source-choice small { grid-column:2; }
  body.immersive-workbench .feed-workbench .feed-setup-panel .feed-capture-rule { align-items:stretch; flex-direction:column; gap:10px; }
  .feed-source-nav { min-height:60px; }
  .feed-setup-panel .feed-capture-rule-actions .mw-btn { min-height:44px; }
}
@media (max-width:760px) {
  .feed-source-tabs button, .feed-rule-modes button { min-height:44px; }
}
body.immersive-workbench .feed-workbench[data-expanded=true] { grid-template-columns:236px minmax(0,1fr); }
body.immersive-workbench .feed-workbench .feed-mobile-sources { width:32px; height:32px; }
@container feed-workbench (max-width:700px) {
  body.immersive-workbench .feed-workbench > :is(.feed-stage-toolbar,.feed-stage-list,.feed-stage-workspace,.feed-setup-panel) { grid-column:1/-1; }
  body.immersive-workbench .feed-workbench > .feed-stage-toolbar { padding:10px 16px; }
  body.immersive-workbench .feed-workbench > .feed-stage-list { padding:0 8px 20px; }
  body.immersive-workbench .feed-workbench .feed-stage-entry,
  body.immersive-workbench .feed-workbench .plugin-stage-list .goal-collection-fold .feed-stage-entry { grid-template-columns:minmax(0,1fr) 62px; gap:8px; padding:14px 8px; }
  .feed-workbench .feed-stage-entry time { display:none; }
  body.immersive-workbench .feed-workbench .feed-stage-item-detail { padding:20px 18px; }
}
`;
