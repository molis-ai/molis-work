/**
 * Screen polish, first round (specs/screen-polish/spec.md §6.1–6.6): the directory column lets the name speak, what a round
 * was prepared with folds to one line, an ended round is one line, the header and the results panel are in reading order.
 * Part of CODING_STYLES, at its end: these rules replace the earlier look of the same parts. Values are semantic variables only.
 */
export const CODING_POLISH_STYLES = `
/* 6.1 Directory column. The tab on show carries its name; the others are their icon, named on hover. */
.coding-faces .coding-face { flex:0 0 32px; display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:0; padding:0; }
.coding-faces .coding-face[aria-pressed=true] { flex:1 1 auto; justify-content:flex-start; padding:0 8px; }
.coding-face svg { flex:none; }
.coding-face-name { display:none; min-width:0; overflow:hidden; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.coding-face[aria-pressed=true] .coding-face-name { display:block; }
.coding-directory .mw-dir__tools [data-coding-new] svg { width:16px; height:16px; }
.coding-directory:not([data-coding-current-face=sessions]) :is([data-coding-archived],[data-coding-archived-more]) { display:none; }
/* A session's row: the name takes the line. A state that asks nothing of the person is its ring alone; one that waits on
   them, or failed, says so in a word. The time shows when the row is pointed at, or under the name where there is no pointer. */
.mw-dir-row.coding-session-row .coding-session-state { display:inline-flex; align-items:center; gap:4px; max-width:9em; }
.mw-dir-row.coding-session-row .coding-session-state[data-quiet=true] { --ring-size:13px; gap:0; padding:0 3px; background:transparent; }
.coding-session-state[data-word]::after { content:attr(data-word); }
.coding-session-state[data-word]::after, .coding-session-pre { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-session-pre { color:var(--muted); }
@media (hover:hover) and (pointer:fine) {
  .mw-dir-row.coding-session-row .coding-session-time { display:none; }
  .mw-dir-row.coding-session-row:is(:hover,:focus-visible) .coding-session-time { display:block; }
}
@media not ((hover:hover) and (pointer:fine)) {
  .mw-dir-row.coding-session-row .mw-dir-row__copy { grid-template-columns:minmax(min(4em,40%),1fr) minmax(0,auto); grid-template-rows:auto auto; row-gap:0; }
  .mw-dir-row.coding-session-row .coding-session-title { grid-area:1 / 1; }
  .mw-dir-row.coding-session-row .coding-session-time { grid-area:2 / 1; justify-self:start; color:var(--faint); font-size:11px; line-height:14px; }
  .mw-dir-row.coding-session-row .coding-session-state { grid-area:1 / 2 / 3 / 3; align-self:center; }
}
/* 「已归档」 is a filter at the foot of the column. */
.coding-archived-row { flex:none; display:flex; align-items:center; gap:8px; width:100%; height:32px; margin-top:4px; padding:0 8px; border:0; border-radius:var(--radius-item); background:transparent; color:var(--muted); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
.coding-archived-row:hover { background:var(--nav-hover); color:var(--ink); }
.coding-archived-row[aria-pressed=true] { background:var(--nav-active); color:var(--ink); }
.coding-archived-row svg { flex:none; width:14px; height:14px; }
.coding-archived-row svg:last-child { margin-left:auto; color:var(--faint); }
@media not ((hover:hover) and (pointer:fine)) { .coding-archived-row { height:44px; } }

/* 6.2, 6.3 What a round was prepared with: one line above the answer, the cards inside it. Amber only when it asks for something. */
.coding-prep { box-sizing:border-box; width:min(100%,var(--coding-reading)); min-width:0; margin:0 auto 12px; }
.coding-prep-line { list-style:none; display:flex; align-items:center; gap:8px; min-height:32px; padding:0 12px; border-radius:8px; background:var(--surface-soft,var(--rail)); color:var(--muted); font-size:12px; cursor:pointer; }
.coding-prep-line::-webkit-details-marker { display:none; }
.coding-prep-line:hover { color:var(--ink); }
.coding-prep-line::after { content:""; flex:none; width:6px; height:6px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); transition:transform var(--dur-hover,130ms) var(--ease-quint); }
.coding-prep[open] > .coding-prep-line::after { transform:rotate(45deg); }
.coding-prep[open] > .coding-prep-line { margin-bottom:8px; }
.coding-prep-mark { --ring-size:13px; flex:none; display:inline-flex; align-items:center; }
.coding-prep-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-prep[data-attention=true] > .coding-prep-line { background:color-mix(in srgb,var(--amber) 12%,transparent); color:var(--ink); }
.coding-prep > :is(.coding-env-checklist,.coding-round-materials) { width:100%; margin:0 0 8px; }
@media (prefers-reduced-motion:reduce) { .coding-prep-line::after, .coding-run-more-toggle svg { transition:none; } }

/* 6.3 An ended round is one line: how it ended, what it changed, and the one thing to do next. */
.coding-run-card { padding:8px 12px; }
.coding-run-card header { flex-wrap:wrap; row-gap:8px; min-width:0; min-height:28px; }
.coding-run-card header strong { flex:none; }
.coding-run-card header .coding-run-facts { flex:1 1 12ch; min-width:0; margin:0; overflow:hidden; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.coding-run-card header .coding-run-actions { flex:none; flex-wrap:nowrap; margin:0 0 0 auto; }
.coding-run-facts .coding-change-counts { gap:4px; margin-left:2px; vertical-align:baseline; }
.coding-run-card > .coding-run-reason { margin-left:28px; }
.coding-run-more { margin:8px 0 0 28px; }
.coding-run-more[hidden] { display:none; }
.coding-run-actions .coding-run-more-toggle { width:28px; min-width:28px; padding:0; justify-content:center; color:var(--muted); }
.coding-run-more-toggle svg { transition:transform var(--dur-hover,130ms) var(--ease-quint); }
.coding-run-more-toggle[aria-expanded=true] svg { transform:rotate(180deg); }
.coding-run-more :is(.coding-run-files,.coding-run-reason) { margin-left:0; }
.coding-run-more-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.coding-run-more-actions .mw-btn { height:28px; min-height:28px; font-size:12px; gap:8px; }

/* 6.4 Header: the title on one line, the place it works in under it, and one outlined key. */
.coding-identity-copy h2 { font-size:17px; font-weight:600; line-height:24px; }
.coding-workspace-chip { margin-top:0; }
.coding-workspace-branch { display:inline-flex; align-items:center; gap:4px; min-width:0; }
.coding-head-more { position:relative; flex:none; }
.coding-head-more[hidden] { display:none; }
.coding-head-more > summary { list-style:none; width:32px; height:32px; min-height:32px; padding:0; justify-content:center; color:var(--muted); cursor:pointer; }
.coding-head-more > summary::-webkit-details-marker { display:none; }
.coding-head-more > summary svg { width:16px; height:16px; }
.coding-head-more > .mw-menu { position:absolute; top:calc(100% + 4px); right:0; z-index:30; min-width:11rem; }
.coding-results-count { display:inline-flex; align-items:center; justify-content:center; min-width:16px; height:16px; padding:0 4px; border-radius:999px; background:color-mix(in srgb,var(--ink) 8%,transparent); color:var(--ink); font-size:11px; font-variant-numeric:tabular-nums; }
.coding-results-count[hidden] { display:none; }

/* 6.5 Results: what changed comes first; the sections are the design system's segments; the run's own details fold at the foot. */
.coding-results-index { display:flex; flex-wrap:nowrap; gap:2px; width:fit-content; max-width:calc(100% - 32px); margin:8px 12px 0 20px; padding:2px; overflow-x:auto; scrollbar-width:none; }
.coding-results-index[hidden] { display:none; }
.coding-results-index .mw-toggle { flex:none; min-height:24px; padding:0 8px; white-space:nowrap; }
.coding-changed-head { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.coding-result .coding-changed-head h3 { margin:0; }
.coding-changed-head span { color:var(--faint); font-size:11px; }
.coding-changed-list { display:grid; gap:1px; }
.coding-changed-file { display:flex; align-items:center; gap:8px; width:100%; min-height:28px; padding:0 8px; border:0; border-radius:6px; background:transparent; color:var(--ink); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
.coding-changed-file:hover { background:var(--nav-hover); }
.coding-changed-file .coding-change-path { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-changed-file .coding-change-dir { color:var(--muted); }
.coding-changed-file b { font-weight:500; }
.coding-run-details > summary { list-style:none; margin-bottom:0; cursor:pointer; }
.coding-run-details > summary::-webkit-details-marker { display:none; }
.coding-run-details > summary::after { content:""; flex:none; width:6px; height:6px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); }
.coding-run-details[open] > summary::after { transform:rotate(45deg); }
.coding-run-details[open] > summary { margin-bottom:12px; }
.coding-result .coding-run-details > summary h3 { color:var(--muted); font-size:12px; }

/* 6.6 Task graph: nothing yet is the shared empty state, without the column heads of a table that has no rows. */
.coding-board-empty.mw-empty { padding:32px 8px; }
.coding-board:has(.coding-board-empty) :is(.coding-board-columns,.coding-board-note) { display:none; }
@media not ((hover:hover) and (pointer:fine)) { .coding-changed-file { min-height:44px; } .coding-head-more > summary { width:44px; height:44px; } }
`;
