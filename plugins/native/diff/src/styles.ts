export const DIFF_STYLES = `
.diff .diff-sides { display:grid; gap:4px; font-size:12px; overflow-wrap:anywhere; }
.diff .diff-source { display:block; color:var(--muted); overflow-wrap:anywhere; }
.diff .diff-rows { padding:0; list-style:none; overflow:auto; font:12px/1.5 monospace; }
.diff .diff-rows li { display:grid; grid-template-columns:3ch 3ch minmax(max-content,1fr); gap:5px; }
.diff .diff-rows code { white-space:pre; }
.diff .diff-rows [data-kind=insert] { background:color-mix(in srgb,var(--green) 9%,transparent); }
.diff .diff-rows [data-kind=delete] { background:color-mix(in srgb,var(--red) 9%,transparent); }
.diff .diff-sign { display:inline-block; width:2ch; }
.diff .diff-before,.diff .diff-after { color:var(--muted); text-align:right; }
`;
