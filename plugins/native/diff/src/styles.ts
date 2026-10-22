// One row geometry for every comparison (specs/visual-ui-experience §code-diff, VUX-33): the number columns are as wide as
// the longest number in the list (`--diff-digits`, written by the renderer), the rows are one grid as wide as the longest
// line so their tint reaches the end of a horizontal scroll, and the numbers stay put while the code scrolls under them.
// Side by side has a number and a code column per side and wraps instead of scrolling, so both halves stay level.
export const DIFF_STYLES = `
.diff .diff-sides { display:grid; gap:8px; padding:12px 0; font-size:12px; overflow-wrap:anywhere; }
.diff .diff-source { display:block; color:var(--muted); overflow-wrap:anywhere; }
.diff .diff-rows { --diff-num:calc(var(--diff-digits,3) * 1ch + 16px); --diff-bg:var(--surface-soft); display:grid; grid-template-columns:minmax(max-content,1fr); align-content:start; padding:8px 0; list-style:none; overflow:auto; border:1px solid var(--line); border-radius:var(--radius-panel,12px); background:var(--diff-bg); font:12px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace; font-variant-numeric:tabular-nums; tab-size:var(--code-tab,4); }
.diff .diff-rows li { --diff-tint:transparent; display:grid; grid-template-columns:var(--diff-num) var(--diff-num) minmax(max-content,1fr); background:var(--diff-tint); }
.diff .diff-rows:not(.diff-split) > li { contain-intrinsic-size:auto none auto 1lh; }
.diff .diff-rows[data-diff-sized] { display:block; }
.diff .diff-rows[data-diff-sized] > li { min-width:var(--diff-width); }
.diff .diff-rows[data-diff-sized] > li:not([data-diff-measure]) { content-visibility:auto; }
.diff [data-diff-measure] > code { justify-self:start; }
.diff .diff-rows code { padding:0 16px 0 8px; font:inherit; white-space:pre; }
.diff .diff-rows [data-kind=insert] { --diff-tint:color-mix(in srgb,var(--green) 9%,transparent); }
.diff .diff-rows [data-kind=delete] { --diff-tint:color-mix(in srgb,var(--red) 9%,transparent); }
.diff .diff-rows [data-kind=blank] { --diff-tint:color-mix(in srgb,var(--ink) 3%,transparent); }
.diff .diff-notices { padding:0; list-style:none; font-size:12px; line-height:1.65; color:var(--muted); }
.diff .diff-sign { display:inline-block; width:2ch; user-select:none; }
.diff .diff-before,.diff .diff-after { position:sticky; left:0; z-index:1; padding:0 8px; background:linear-gradient(var(--diff-tint),var(--diff-tint)) var(--diff-bg); color:var(--muted); text-align:right; white-space:nowrap; user-select:none; }
.diff .diff-rows:not(.diff-split) .diff-after { left:var(--diff-num); }
.diff .diff-split { grid-template-columns:minmax(0,1fr); }
.diff .diff-split li { grid-template-columns:var(--diff-num) minmax(0,1fr) var(--diff-num) minmax(0,1fr); }
.diff .diff-split code { min-width:0; background:var(--diff-tint); white-space:pre-wrap; overflow-wrap:anywhere; }
.diff .diff-split .diff-before,.diff .diff-split .diff-after { position:static; }
.diff .diff-split .diff-after { border-left:1px solid var(--line); }
.diff .diff-rows li[hidden] { display:none; }
.diff .diff-rows li.diff-fold { display:block; padding:0; }
.diff .diff-fold button { display:flex; align-items:center; gap:8px; width:100%; min-height:26px; padding:4px 12px; border:0; background:color-mix(in srgb,var(--ink) 4%,transparent); color:var(--muted); font:inherit; font-size:12px; cursor:pointer; }
.diff .diff-fold button:hover { background:var(--nav-hover); color:var(--ink); }
.diff .diff-fold svg { width:12px; height:12px; }
`;
