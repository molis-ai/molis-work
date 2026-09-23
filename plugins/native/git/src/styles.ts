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
`;
