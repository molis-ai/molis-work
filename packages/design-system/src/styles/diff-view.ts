// The SDK's diff view (packages/plugin-sdk/src/diff-view.ts) is markup every page may place; its rules are the host page's,
// under the SDK's own `mw-` namespace, so a plugin that draws a comparison needs no sheet of its own (PG-070). One row
// geometry for every comparison (specs/visual-ui-experience §code-diff, VUX-33): the number columns are as wide as the longest
// number in the list (`--diff-digits`, written by the renderer), the rows are one grid as wide as the longest line so their
// tint reaches the end of a horizontal scroll, and the numbers stay put while the code scrolls under them. Side by side has a
// number and a code column per side and wraps instead of scrolling, so both halves stay level.
export const DIFF_VIEW_STYLES = `
/* What is compared sits in one box: the earlier side marked in the removal colour, the later in the addition colour, and where
   the content is held as a tag under them. */
.mw-diff {
  .mw-diff-sides {
    display:grid; gap:4px; margin:0 0 12px; padding:10px 12px; border-radius:var(--radius-item); background:var(--paper); box-shadow:0 0 0 1px var(--line); font-size:12px; overflow-wrap:anywhere;
    > span { position:relative; padding-left:14px; }
    > span:nth-child(-n+2)::before { content:""; position:absolute; left:2px; top:.55em; width:6px; height:6px; border-radius:50%; background:var(--red); }
    > span:nth-child(2)::before { background:var(--green); }
    .mw-diff-path { color:var(--ink); }
    > span:nth-child(3) { justify-self:start; margin-top:2px; padding:0 8px; border-radius:6px; background:var(--rail); line-height:20px; }
  }
  .mw-diff-source { display:block; color:var(--muted); overflow-wrap:anywhere; }
  .mw-diff-rows {
    --diff-num:calc(var(--diff-digits,3) * 1ch + 16px); --diff-bg:var(--surface-soft); display:grid; grid-template-columns:minmax(max-content,1fr); align-content:start; padding:8px 0; list-style:none; overflow:auto; border:1px solid var(--line); border-radius:var(--r-card,12px); background:var(--diff-bg); font:12px/1.75 var(--font-mono); font-variant-numeric:tabular-nums; tab-size:var(--code-tab);
    li { --diff-tint:transparent; display:grid; grid-template-columns:var(--diff-num) var(--diff-num) minmax(max-content,1fr); background:var(--diff-tint); }
    &:not(.mw-diff-split) > li { contain-intrinsic-size:auto none auto 1lh; }
    &[data-diff-sized] { display:block; > li { min-width:var(--diff-width); &:not([data-diff-measure]) { content-visibility:auto; } } }
    code { padding:0 16px 0 8px; font:inherit; white-space:pre; }
    [data-kind=insert] { --diff-tint:color-mix(in srgb,var(--green) 9%,transparent); }
    [data-kind=delete] { --diff-tint:color-mix(in srgb,var(--red) 9%,transparent); }
    [data-kind=blank] { --diff-tint:color-mix(in srgb,var(--ink) 3%,transparent); }
    &:not(.mw-diff-split) .mw-diff-after { left:var(--diff-num); }
    li[hidden] { display:none; }
    li.mw-diff-fold { display:block; padding:0; }
  }
  [data-diff-measure] > code { justify-self:start; }
  .mw-diff-files {
    display:grid; gap:6px; margin:0 0 12px; padding:0; list-style:none;
    li {
      --diff-file:var(--accent); position:relative; display:flex; align-items:center; gap:8px; min-width:0; padding:0 8px 0 14px; border-radius:var(--radius-item); background:var(--paper); box-shadow:0 0 0 1px var(--line),0 1px 3px color-mix(in srgb,var(--shadow-color) 7%,transparent); transition:background-color var(--dur-hover) var(--ease-quint);
      &::before { content:""; position:absolute; left:6px; top:9px; bottom:9px; width:3px; border-radius:2px; background:var(--diff-file); }
      &:hover { background:var(--surface-soft); }
    }
    [data-kind=added] { --diff-file:var(--green); }
    [data-kind=deleted] { --diff-file:var(--red); }
    button {
      display:flex; flex:1; align-items:center; gap:6px; min-width:0; min-height:34px; padding:0; border:0; background:none; color:var(--ink); font:inherit; font-size:13px; text-align:left; cursor:pointer;
      &:focus-visible { outline:var(--focus-stroke); outline-offset:2px; border-radius:6px; }
    }
    .mw-diff-path { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:rtl; text-align:left; font-family:var(--font-mono); font-size:12px; }
  }
  .mw-diff-file-n { flex:none; color:var(--faint); font-variant-numeric:tabular-nums; }
  .mw-diff-counts {
    display:flex; flex:none; gap:4px; font:11px/18px var(--font-mono); font-variant-numeric:tabular-nums;
    span { padding:0 6px; border-radius:6px; }
    [data-sign=insert] { background:color-mix(in srgb,var(--green) 12%,transparent); color:var(--green); }
    [data-sign=delete] { background:color-mix(in srgb,var(--red) 10%,transparent); color:var(--red); }
  }
  .mw-diff-notices {
    display:flex; flex-wrap:wrap; gap:6px; margin:0 0 10px; padding:0; list-style:none; font-size:12px; line-height:1.65; color:var(--ink-soft);
    li { padding:1px 8px; border-radius:6px; background:color-mix(in srgb,var(--amber) 11%,transparent); }
  }
  .mw-diff-sign { display:inline-block; width:2ch; user-select:none; }
  .mw-diff-before,.mw-diff-after { position:sticky; left:0; z-index:1; padding:0 8px; background:linear-gradient(var(--diff-tint),var(--diff-tint)) var(--diff-bg); color:var(--muted); text-align:right; white-space:nowrap; user-select:none; }
  .mw-diff-split {
    grid-template-columns:minmax(0,1fr);
    li { grid-template-columns:var(--diff-num) minmax(0,1fr) var(--diff-num) minmax(0,1fr); }
    code { min-width:0; background:var(--diff-tint); white-space:pre-wrap; overflow-wrap:anywhere; }
    .mw-diff-before,.mw-diff-after { position:static; }
    .mw-diff-after { border-left:1px solid var(--line); }
  }
  .mw-diff-fold {
    button {
      display:flex; align-items:center; gap:8px; width:100%; min-height:26px; padding:4px 12px; border:0; background:var(--control-fill); color:var(--muted); font:inherit; font-size:12px; cursor:pointer;
      &:hover { background:var(--nav-hover); color:var(--ink); }
    }
    svg { width:12px; height:12px; }
  }
}
`;
