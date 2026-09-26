export const GIT_STYLES = `
.git-browser { min-height:0; flex:0 1 auto; overflow:auto; padding:8px; }
.git-browser[hidden],.git-results[hidden] { display:none; }
.git-directory-toolbar { padding:4px 0; }
.git-directory-toolbar .mw-dir__label { padding-left:4px; }
.git-browser h4 { font-size:11px; font-weight:400; color:var(--faint); margin:16px 8px 4px; }
.git-browser p,.git-results p { font-size:12px; line-height:1.65; color:var(--muted); overflow-wrap:anywhere; }
[data-git-list] .mw-dir-row { min-height:30px; }
.git-results { min-width:0; padding:0; height:100%; }
.git-reader-head { display:flex; align-items:center; gap:12px; position:sticky; top:0; padding:12px 0; background:var(--paper); z-index:1; }
.git-reader-head > div { flex:1; min-width:0; }
.git-reader-kind { color:var(--faint); font-size:11px; }
.git-results h2 { margin:2px 0 0; min-width:0; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.git-results [data-git-scope] { color:var(--ink-soft); }
.git-results [data-git-diff] { margin-top:20px; }
.git-results [data-git-notice]:empty { display:none; }
.git-results[aria-busy=true] [data-git-diff] { opacity:.65; }
.git-sc { display:grid; gap:8px; margin:4px 0 10px; padding:10px; border:1px solid var(--line); border-radius:10px; min-width:0; }
.git-sc-branch { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; min-width:0; font-size:13px; }
.git-sc-branch strong { overflow-wrap:anywhere; }
.git-sc-sync { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.git-sc-branch .mw-btn { margin-left:auto; min-height:26px; padding:0 8px; }
.git-sc-message { width:100%; box-sizing:border-box; font-size:13px; resize:vertical; }
.git-sc-actions { display:flex; flex-wrap:wrap; gap:6px; }
.git-sc-actions .mw-btn { flex:1 1 auto; min-height:30px; }
.git-sc-form { display:grid; gap:6px; padding:8px; border-radius:8px; background:color-mix(in srgb,var(--ink) 4%,transparent); }
.git-sc-form .mw-btn { justify-self:start; }
.git-sc-note { margin:0; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.git-sc-note:empty { display:none; }
.git-sc-log { display:grid; gap:2px; margin:0; padding:0; list-style:none; font-size:12px; color:var(--muted); }
.git-sc-log li { overflow-wrap:anywhere; }
.git-sc-conflicts { display:grid; gap:8px; padding:8px 0; border-top:1px solid var(--line); }
.git-sc-conflict-list { display:grid; gap:2px; margin:0; padding:0; list-style:none; }
.git-sc-conflict-editor { display:grid; gap:6px; }
.git-sc-conflict-text { width:100%; min-height:12rem; font-family:var(--font-mono, ui-monospace, monospace); font-size:12px; line-height:1.5; white-space:pre; overflow:auto; }
.git-sc-picks { display:grid; gap:4px; }
.git-sc-pick { display:flex; flex-wrap:wrap; align-items:center; gap:4px; font-size:12px; color:var(--muted); }
.git-sc-log li[data-outcome=succeeded] { color:var(--green); }
.git-sc-log li[data-outcome=failed], .git-sc-log li[data-outcome=unknown] { color:var(--amber); }
`;
