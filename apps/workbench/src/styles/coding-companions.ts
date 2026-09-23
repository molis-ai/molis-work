/** Layout shared by the workspace tools; controls inherit the component board. */
export const CODING_COMPANION_STYLES = `
[data-companion] { container: coding-companion / inline-size; }
.companion-surface { height:100%; min-height:0; }
.companion-layout { display:grid; grid-template-columns:240px minmax(0,1fr); height:100%; min-height:0; }
.companion-directory { min-height:0; min-width:0; overflow:hidden; padding:0; }
.companion-directory > .mw-field { display:grid; gap:6px; padding:8px; }
.companion-manage { display:flex; width:100%; justify-content:flex-start; margin-bottom:8px; }
.companion-manage > span { flex:1; text-align:left; }
.companion-manage > svg:last-child { color:var(--faint); }
.companion-directory .git-browser { border:0; overflow:visible; }
.companion-result { min-width:0; min-height:0; overflow:auto; }
.companion-empty { height:100%; max-width:400px; margin:auto; padding:32px; align-content:center; }
.companion-empty h2 { font-size:20px; font-weight:500; }
.companion-empty p { font-size:13px; line-height:1.7; }
.companion-result:has(>section:not([hidden])) > .companion-empty { display:none; }
.workspace-manager,.companion-reader { height:100%; box-sizing:border-box; }
.workspace-manager { margin:0; }
.workspace-manager .mw-frame__panel > * { max-width:640px; }
.workspace-manager .mw-frame__header > .mw-frame__heading,.companion-reader .mw-frame__header > .mw-frame__heading { flex:1; }
.workspace-manager form h2 { font-size:14px; font-weight:400; margin:0; }
.workspace-manager p,.companion-reader > p { color:var(--muted); font-size:13px; line-height:1.7; overflow-wrap:anywhere; max-width:70ch; }
.workspace-list { margin:24px 0; gap:4px; }
.workspace-choice.mw-dir-row { min-height:52px; height:auto; padding:8px 12px; }
.workspace-manager form { display:grid; height:auto; align-content:start; gap:16px; margin-top:32px; padding:0; border:0; }
.workspace-manager .mw-field { display:grid; gap:8px; }
.workspace-manager .workspace-pick { justify-self:start; }
.workspace-manager p[data-workspace-picked] { margin:0; }
.workspace-manager p[data-workspace-picked].is-picked { color:var(--ink); }
.workspace-manager form > button { justify-self:start; }
[data-companion-content] { margin-top:28px; }
[data-companion-content] .stats-counts { display:grid; grid-template-columns:minmax(0,1fr) auto; max-width:480px; gap:20px; margin:24px 0; padding:20px 0; font-size:14px; }
[data-companion-content] .stats-counts dt { color:var(--muted); }
[data-companion-content] .stats-counts dd { margin:0; font-size:20px; font-variant-numeric:tabular-nums; }
[data-companion-content] .stats-origin { display:block; margin-top:4px; color:var(--muted); font-size:12px; }
[data-companion-content] :is(.stats-notice,.diff-notice) { padding:24px 0; color:var(--muted); }
@container coding-companion (max-width:600px) {
  .companion-surface { height:100%; min-height:0; }
.companion-layout { grid-template-columns:minmax(0,1fr); }
  [data-companion]:not([data-companion-detail=true]) .companion-result { display:none; }
  [data-companion][data-companion-detail=true] .companion-directory { display:none; }
  .mw-layout-primitives :is(.workspace-manager,.companion-reader) > .mw-frame__header { padding:16px 16px 8px; }
  .mw-layout-primitives :is(.workspace-manager,.companion-reader) > .mw-frame__panel { padding:8px 16px 16px; }
  .mw-layout-primitives .companion-directory { width:100%; }
  .workspace-manager form { padding:0; margin-top:24px; }
  [data-companion] :is(.mw-btn,.mw-dir-row,.mw-select-picker__trigger) { min-height:44px; }
  [data-companion] .mw-dir-row--compact { height:44px; }
  [data-companion] :is(input,select,textarea) { font-size:16px; }
  .git-reader-head { flex-wrap:wrap; }
  .git-reader-head > div { flex-basis:100%; }
}
`;
