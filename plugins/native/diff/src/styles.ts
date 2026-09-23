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
`;
