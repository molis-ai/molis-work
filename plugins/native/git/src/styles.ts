export const GIT_STYLES = `
.git-browser { min-height:0; flex:0 1 45%; overflow:auto; padding:8px; border-top:1px solid var(--line); }
.git-browser[hidden],.git-results[hidden] { display:none; }
.git-browser summary { cursor:pointer; margin-bottom:8px; }
.git-browser h4 { font-size:12px; font-weight:400; color:var(--muted); margin:12px 0 4px; }
.git-browser p,.git-results p { font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
[data-git-list] button { width:100%; justify-content:flex-start; text-align:left; white-space:normal; overflow-wrap:anywhere; }
.git-results { min-width:0; padding:12px; }
.git-results > header { display:flex; align-items:center; gap:8px; }
.git-results h3 { flex:1; min-width:0; font-size:13px; font-weight:400; overflow-wrap:anywhere; }
`;
