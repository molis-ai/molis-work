export const FILES_STYLES = `
.files-browser { min-height:0; overflow:auto; padding:8px; }
.files-browser[hidden],.files-results[hidden] { display:none; }
.files-browser select { width:100%; }
.files-notice,[data-files-status],[data-files-notice],[data-files-capture-status] { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
[data-files-tree] ul { margin:0; padding-left:12px; list-style:none; }
[data-files-tree]>ul { padding-left:0; }
[data-files-tree] button { justify-content:flex-start; width:100%; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-files-tree] button[aria-current=true] { background:var(--nav-active); }
[data-files-tree] button svg { width:13px; height:13px; flex:none; }
[data-files-tree] button span { overflow:hidden; text-overflow:ellipsis; }
.files-results { min-width:0; padding:12px; }
.files-results header { display:flex; align-items:center; gap:8px; }
.files-results h3 { flex:1; min-width:0; overflow-wrap:anywhere; font-size:13px; font-weight:400; }
.files-preview { width:100%; min-height:280px; height:40vh; resize:vertical; white-space:pre; overflow:auto; font:12px/1.6 monospace; }
.files-actions { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
.files-results details { margin:16px 0; font-size:12px; }
.files-results summary { cursor:pointer; }
.files-results .stats-counts { display:grid; grid-template-columns:1fr auto; gap:4px; }
.files-results .stats-counts dd { margin:0; }
.files-results .stats-origin,.files-results .diff-source { display:block; color:var(--muted); overflow-wrap:anywhere; }
.files-results .diff-rows { padding:0; list-style:none; overflow:auto; font:12px/1.5 monospace; }
.files-results .diff-rows li { display:grid; grid-template-columns:3ch 3ch minmax(max-content,1fr); gap:5px; }
.files-results .diff-rows code { white-space:pre; }
.files-results .diff-rows [data-kind=insert] { background:color-mix(in srgb,var(--green) 9%,transparent); }
.files-results .diff-rows [data-kind=delete] { background:color-mix(in srgb,var(--red) 9%,transparent); }
.files-results .diff-sign { display:inline-block; width:2ch; }
.files-results .diff-before,.files-results .diff-after { color:var(--muted); text-align:right; }
`;
