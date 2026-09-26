export const DIFF_STYLES = `
.diff .diff-sides { display:grid; gap:6px; padding:12px 0; font-size:12px; overflow-wrap:anywhere; }
.diff .diff-source { display:block; color:var(--muted); overflow-wrap:anywhere; }
.diff .diff-rows { padding:8px 0; list-style:none; overflow:auto; border:1px solid var(--line); border-radius:var(--radius-panel,12px); background:var(--nav-bg); font:12px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace; }
.diff .diff-rows li { display:grid; grid-template-columns:4ch 4ch minmax(max-content,1fr); gap:8px; padding-inline:8px; }
.diff .diff-rows code { white-space:pre; }
.diff .diff-rows [data-kind=insert] { background:color-mix(in srgb,var(--green) 9%,transparent); }
.diff .diff-rows [data-kind=delete] { background:color-mix(in srgb,var(--red) 9%,transparent); }
.diff .diff-notices { padding:0; list-style:none; font-size:12px; line-height:1.65; color:var(--muted); }
.diff .diff-sign { display:inline-block; width:2ch; }
.diff .diff-before,.diff .diff-after { color:var(--muted); text-align:right; }
.diff .diff-rows li[hidden] { display:none; }
.diff .diff-rows li.diff-fold { display:block; padding:0; }
.diff .diff-fold button { display:flex; align-items:center; gap:6px; width:100%; min-height:26px; padding:2px 12px; border:0; background:color-mix(in srgb,var(--ink) 4%,transparent); color:var(--muted); font:inherit; font-size:11.5px; cursor:pointer; }
.diff .diff-fold button:hover { background:color-mix(in srgb,var(--ink) 8%,transparent); color:var(--ink); }
.diff .diff-fold svg { width:12px; height:12px; }
`;
