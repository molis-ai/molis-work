/** Layout only; controls, colors, and focus behavior use the shared system. */
export const CODING_STYLES = `
.coding-material { min-width:0; padding:12px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
[data-coding-subagents] > details { padding:8px 0; border-top:1px solid var(--line); }
[data-coding-subagents] summary { cursor:pointer; color:var(--ink); }
[data-coding-subagents] .coding-turn { font-size:13px; margin-top:12px; color:var(--ink); }
[data-coding-subagents] .mw-field { display:grid; gap:4px; margin:12px 0 8px; }
[data-coding-subagents] textarea { width:100%; resize:vertical; }
.coding-material pre { max-height:14rem; max-width:100%; overflow:auto; white-space:pre; font-size:12px; }
[data-coding-workbench] { container: molis-coding / inline-size; }
.coding-layout { display:grid; grid-template-columns:240px minmax(0,1fr); height:100%; min-height:0; }
.coding-layout .coding-stage { min-width:0; }
.coding-directory-back { display:none; }
.coding-directory { height:100%; min-height:0; }
.coding-directory .mw-dir__body { min-height:0; }
.coding-directory .mw-dir__add { flex:none; margin-top:8px; }
[data-coding-workbench]:not([data-coding-detail=true]) .coding-dialogue,
[data-coding-workbench]:not([data-coding-detail=true]) .coding-tools { display:none; }
[data-coding-detail=true] .coding-start { display:none; }
.coding-directory[data-coding-current-face=files] .coding-search,.coding-directory[data-coding-current-face=files] .coding-filters,.coding-directory[data-coding-current-face=files] [data-coding-sessions],.coding-directory[data-coding-current-face=files] [data-coding-new] { display:none; }
[data-coding-tools][data-companion-open=true]>:not([data-files-results]):not([data-git-results]):not(.coding-tool-tabs) { display:none; }
.coding-directory[data-coding-current-face=artifacts] .coding-search,.coding-directory[data-coding-current-face=artifacts] .coding-filters,.coding-directory[data-coding-current-face=artifacts] [data-coding-sessions],.coding-directory[data-coding-current-face=artifacts] [data-coding-new] { display:none; }
[data-coding-artifact-directory] { min-height:0; overflow:auto; }
/* TaskBoard: the Goal list's row grammar — 28px rows, indented by depth, with state, progress, prerequisites and who is working. */
[data-coding-workbench][data-coding-board-open="true"] :is([data-coding-turns],[data-coding-latest],[data-coding-report-reader]) { display:none !important; }
.coding-board { flex:1 1 auto; min-height:0; overflow:auto; padding:20px 28px 32px; outline:none; }
.coding-board-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin:0 0 14px; }
.coding-board-heading { min-width:0; }
.coding-board-head h2 { margin:0; font-size:16px; font-weight:500; line-height:22px; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-board-head p { margin:2px 0 0; font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.coding-board-columns, .coding-board-entry { display:grid; grid-template-columns:minmax(12rem,1fr) 6.75rem 4.75rem 9rem minmax(7.5rem,auto); column-gap:12px; align-items:center; }
.coding-board-columns { height:24px; padding:0 8px; border-bottom:1px solid var(--line); color:var(--faint); font-size:11px; }
.coding-board-columns > span:last-child { text-align:right; }
.coding-board-fold { margin:10px 0 0; }
.coding-board-fold > summary { display:flex; align-items:center; gap:8px; height:32px; padding:0 8px; border-radius:6px; color:var(--muted); list-style:none; cursor:pointer; }
.coding-board-fold > summary::-webkit-details-marker, .coding-board-fold > summary::marker { display:none; }
.coding-board-fold > summary:hover { color:var(--ink); background:var(--nav-hover, color-mix(in srgb, var(--ink) 5%, transparent)); }
.coding-board-fold > summary strong { font-size:12px; font-weight:400; }
.coding-board-fold > summary small { font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums; }
.coding-board-caret, .coding-board-fold-mark { display:grid; place-items:center; width:16px; height:16px; }
.coding-board-caret svg { width:12px; height:12px; transition:transform 140ms cubic-bezier(.16,1,.3,1); }
.coding-board-fold:not([open]) > summary .coding-board-caret svg { transform:rotate(-90deg); }
.coding-board-fold-mark svg { width:13px; height:13px; }
.coding-board-fold[data-board-group="attention"] .coding-board-fold-mark { color:var(--amber); }
.coding-board-tree, .coding-board-children { margin:0; padding:0; list-style:none; }
.coding-board-entry { position:relative; height:28px; padding:0 8px; border-radius:6px; }
.coding-board-entry:hover, .coding-board-entry:focus-within { background:var(--nav-hover, color-mix(in srgb, var(--ink) 5%, transparent)); }
.coding-board-lead { display:flex; align-items:center; gap:2px; min-width:0; padding-left:calc(var(--board-depth, 0) * 16px); }
.coding-board-toggle, .coding-board-guide { flex:none; display:grid; place-items:center; width:16px; height:28px; padding:0; border:0; background:transparent; color:var(--muted); }
.coding-board-toggle { cursor:pointer; border-radius:4px; }
.coding-board-toggle svg { width:11px; height:11px; transition:transform 140ms cubic-bezier(.16,1,.3,1); }
.coding-board-toggle[aria-expanded="false"] svg { transform:rotate(-90deg); }
.coding-board-toggle:hover { color:var(--ink); }
.coding-board-node { display:flex; align-items:center; gap:8px; flex:1; min-width:0; height:28px; padding:0; border:0; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
.coding-board-node strong { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:400; line-height:18px; }
.coding-board-node:focus-visible { outline:var(--focus-stroke, 2px solid var(--blue)); outline-offset:2px; border-radius:4px; }
.coding-board-key { flex:none; min-width:1.8em; color:var(--faint); font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; font-variant-numeric:tabular-nums; }
.coding-board-item[style*="--board-depth:0"] > .coding-board-entry .coding-board-node strong { font-weight:500; }
.coding-board-state { display:inline-flex; align-items:center; gap:5px; min-width:0; font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; }
.coding-board-state > span:last-child { overflow:hidden; text-overflow:ellipsis; }
.coding-board-state svg { flex:none; width:12px; height:12px; }
.coding-board-state[data-tone="done"], .coding-board-state[data-tone="accepted"] { color:var(--green); }
.coding-board-state[data-tone="blocked"] { color:var(--red); }
.coding-board-state[data-tone="attention"] { color:var(--amber); }
.coding-board-state[data-tone="progress"] { color:var(--blue); }
.coding-board-state[data-tone="ready"] { color:var(--ink-soft, var(--ink)); }
.coding-board-state[data-tone="quiet"], .coding-board-state[data-tone="idle"] { color:var(--faint); }
.coding-board-pulse { flex:none; width:8px; height:8px; margin:0 2px; border-radius:50%; background:currentColor; box-shadow:0 0 0 0 color-mix(in srgb, currentColor 40%, transparent); animation:coding-board-pulse 1.6s ease-out infinite; }
@keyframes coding-board-pulse { 0% { box-shadow:0 0 0 0 color-mix(in srgb, currentColor 45%, transparent); } 70% { box-shadow:0 0 0 5px transparent; } 100% { box-shadow:0 0 0 0 transparent; } }
.coding-board-progress { display:inline-flex; align-items:center; gap:6px; min-width:0; color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.coding-board-progress.is-empty { visibility:hidden; }
.coding-board-progress > i { flex:none; width:34px; height:2px; overflow:hidden; background:var(--line-strong, var(--line)); }
.coding-board-progress > i > b { display:block; width:var(--board-progress); height:100%; background:var(--green); }
.coding-board-deps { position:relative; min-width:0; font-size:11px; color:var(--muted); }
.coding-board-deps.is-empty { visibility:hidden; }
.coding-board-deps.is-note { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--faint); }
.coding-board-deps > summary { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; list-style:none; cursor:pointer; font-variant-numeric:tabular-nums; }
.coding-board-deps > summary::-webkit-details-marker, .coding-board-deps > summary::marker { display:none; }
.coding-board-deps.is-ready > summary { color:var(--green); }
.coding-board-deps.is-waiting > summary { color:var(--amber); }
.coding-board-deps.is-blocked > summary { color:var(--red); }
.coding-board-deps > summary:hover { color:var(--ink); }
.coding-board-dep-list { position:absolute; z-index:5; top:24px; left:-8px; width:min(22rem, 70vw); padding:6px; border:1px solid var(--line); border-radius:8px; background:var(--paper); box-shadow:0 8px 24px color-mix(in srgb, var(--shadow-color, #000) 18%, transparent); }
.coding-board-dep { display:grid; grid-template-columns:14px minmax(0,1fr); column-gap:6px; margin:0; padding:5px 6px; border-radius:6px; }
.coding-board-dep svg { width:12px; height:12px; margin-top:2px; color:var(--muted); }
.coding-board-dep strong { font-size:12px; font-weight:400; color:var(--ink); overflow-wrap:anywhere; }
.coding-board-dep em { grid-column:2; font-size:11px; font-style:normal; }
.coding-board-dep.is-ready em { color:var(--green); } .coding-board-dep.is-waiting em { color:var(--amber); } .coding-board-dep.is-blocked em { color:var(--red); }
.coding-board-meta { display:inline-flex; align-items:center; justify-content:flex-end; gap:8px; min-width:0; }
.coding-board-time { min-width:5ch; color:var(--muted); font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; font-variant-numeric:tabular-nums; text-align:right; }
.coding-board-time.is-empty { visibility:hidden; }
.coding-board-agent { max-width:6.5rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:var(--muted); }
.coding-board-avatar { flex:none; display:grid; place-items:center; width:18px; height:18px; border-radius:50%; font-size:9px; line-height:1; color:var(--ink); background:color-mix(in srgb, hsl(var(--board-avatar-hue, 210) 42% 48%) 26%, var(--paper)); }
.coding-board-avatar.is-unknown { background:color-mix(in srgb, var(--muted) 14%, var(--paper)); box-shadow:inset 0 0 0 1px var(--line); }
.coding-board-tools { position:absolute; right:8px; top:2px; display:none; gap:2px; padding:0 2px; border-radius:6px; background:var(--paper); box-shadow:0 1px 3px color-mix(in srgb, var(--shadow-color, #000) 16%, transparent); }
.coding-board-tools .mw-btn { width:24px; height:24px; min-height:24px; padding:0; }
.coding-board-tools svg { width:12px; height:12px; }
.coding-board-entry:hover .coding-board-tools, .coding-board-entry:focus-within .coding-board-tools { display:inline-flex; }
.coding-board-form { display:flex; gap:6px; align-items:center; margin:2px 8px 6px calc(var(--board-depth, 0) * 16px + 26px); }
.coding-board-form .mw-input { flex:1 1 12rem; min-width:0; height:28px; }
.coding-board-note { margin:16px 8px 0; font-size:11px; color:var(--faint); }
@media (max-width: 760px) {
  .coding-board { padding:14px 12px 24px; }
  .coding-board-columns { display:none; }
  .coding-board-entry { grid-template-columns:minmax(0,1fr) auto auto; height:auto; min-height:32px; row-gap:0; }
  .coding-board-progress, .coding-board-deps, .coding-board-agent, .coding-board-time { display:none; }
}
@media (prefers-reduced-motion: reduce) { .coding-board-pulse { animation:none; } }
[data-coding-artifact-list] .coding-session-row { display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; height:auto; text-align:left; white-space:normal; overflow-wrap:anywhere; }
[data-coding-artifact-list] strong { font-weight:400; }
[data-coding-artifact-list] .coding-session-row > span { color:var(--muted); font-size:11px; }
.coding-faces { display:flex; gap:2px; padding:0 4px 8px; }
.coding-faces .coding-face { flex:1; background:transparent; border:0; border-radius:var(--radius-item); box-shadow:none; }
.coding-faces .coding-face[aria-pressed=true] { color:var(--plugin-tint,var(--ink)); background:var(--nav-active); }
.coding-face svg { width:15px; height:15px; }
.coding-query { padding:0 4px 8px; }
.coding-search { display:block; }.coding-search input { width:100%; }
.coding-filters { display:flex; margin-top:8px; }
.coding-filter { flex:1; min-width:0; }
/* The list scrolls inside the directory; left to overflow, older sessions painted over the new-session button. */
.coding-session-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
.coding-session-row { margin-bottom:1px; }
.coding-session-time { font-variant-numeric:tabular-nums; }
.coding-stage { height:100%; min-height:0; display:grid; grid-template-columns:minmax(0,1fr); background:var(--paper); }
[data-coding-results=true] .coding-stage { grid-template-columns:minmax(0,1fr) 320px; }
.coding-dialogue { position:relative; min-width:0; }
.mw-layout-primitives .coding-dialogue-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.coding-identity { display:flex; align-items:flex-start; gap:8px; min-width:0; }
.coding-identity-copy { flex:1; min-width:0; }
.coding-identity-copy h2,.coding-identity-copy p { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-identity-copy p { max-width:60ch; }
.coding-context { flex-wrap:wrap; gap:4px; margin:0; padding:0; }
[data-coding-goal-dialog] [data-coding-goal-list] {
  display:flex; flex-direction:column; gap:1px; max-height:280px; overflow:auto; margin:0; padding:2px 0;
}
[data-coding-goal-dialog] [data-coding-goal-list]:not(:has(.mw-dir-row)) {
  font-size:12px; line-height:1.5; color:var(--muted);
}
[data-coding-goal-dialog] [data-coding-goal-list] .mw-dir-row.is-selected::before { content:none; }
.coding-workspace svg { width:12px; height:12px; margin-right:4px; }
.coding-turns { overflow-anchor:none; overscroll-behavior:contain; }
/* A long session keeps dozens of rounds in the page. Rounds out of view skip layout and paint, and remember their last
   size, so drawing earlier rounds while scrolling does not relayout every round already there. */
.coding-turns > [data-run] { content-visibility:auto; contain-intrinsic-size:auto 480px; }
/* Earlier rounds of a long session load as the reader scrolls up; the control is also a button for keyboard and screen readers. */
/* The slash menu opens above the composer; the palette is a centred list. Both keep the keyboard in the field. */
.coding-composer-shell { position:relative; }
.coding-slash { position:absolute; left:8px; right:8px; bottom:calc(100% + 6px); z-index:25; max-height:min(50vh,320px); overflow:auto; padding:4px; border:1px solid var(--line); border-radius:12px; background:var(--paper); box-shadow:0 12px 32px color-mix(in srgb,var(--ink) 14%,transparent); }
.coding-slash-item { display:grid; grid-template-columns:auto auto minmax(0,1fr); align-items:baseline; gap:8px; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:13px; }
.coding-slash-item[aria-selected=true] { background:color-mix(in srgb,var(--ink) 7%,transparent); }
.coding-slash-item code { color:var(--muted); font-size:12px; }
.coding-slash-item.is-file { grid-template-columns:auto minmax(0,1fr); }
.coding-slash-empty { margin:0; padding:8px 10px; color:var(--muted); font-size:12px; }
.coding-slash-hint { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-size:12px; }
.coding-composer-keys { display:inline-flex; gap:4px; flex-wrap:wrap; }
@media (max-width:640px) { .coding-composer-keys .mw-kbd:not(:last-child) { display:none; } }
dialog.coding-palette { position:fixed; inset:12vh auto auto 50%; translate:-50% 0; margin:0; width:min(560px,calc(100vw - 32px)); padding:0; border:1px solid var(--line); border-radius:14px; background:var(--paper); box-shadow:0 24px 64px color-mix(in srgb,var(--ink) 22%,transparent); }
dialog.coding-palette::backdrop { background:color-mix(in srgb,var(--ink) 18%,transparent); }
.coding-palette-shell { display:grid; gap:0; }
.coding-palette-shell > .mw-input { border:0; border-bottom:1px solid var(--line); border-radius:14px 14px 0 0; padding:14px 16px; font-size:15px; box-shadow:none; }
.coding-palette-list { max-height:min(52vh,420px); overflow:auto; margin:0; padding:6px; list-style:none; }
.coding-palette-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:13px; }
.coding-palette-item[aria-selected=true] { background:color-mix(in srgb,var(--ink) 7%,transparent); }
.coding-palette-kind { color:var(--faint); font-size:11px; }
.coding-palette-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-palette-detail { color:var(--muted); font-size:12px; }
.coding-palette-empty { padding:14px; color:var(--muted); font-size:13px; }
.coding-palette-foot { margin:0; padding:8px 16px; border-top:1px solid var(--line); color:var(--faint); font-size:11px; }
/* Syntax colours, from the theme's own tokens so light and dark stay legible without a second palette. */
.tok-comment { color:var(--faint); font-style:italic; }
.tok-string { color:var(--green); }
.tok-number { color:var(--amber); }
.tok-keyword { color:var(--blue-dark,var(--blue)); font-weight:500; }
.tok-type { color:color-mix(in srgb,var(--green) 55%,var(--blue)); }
.tok-function { color:var(--blue); }
.tok-property { color:color-mix(in srgb,var(--blue) 70%,var(--ink)); }
.tok-operator { color:var(--muted); }
.tok-tag { color:var(--blue-dark,var(--blue)); }
.tok-attribute { color:var(--amber); }
.tok-inserted { color:var(--green); }
.tok-deleted { color:var(--red,#c0392b); }
.tok-meta { color:var(--muted); }
/* Sessions working together: the receiving session's banner, and the asking session's cards in the results panel. */
.coding-delegation-banner { display:grid; gap:6px; margin:0 auto 4px; width:min(100%,var(--coding-reading,760px)); padding:10px 14px; border:1px solid color-mix(in srgb,var(--accent,var(--ink)) 25%,var(--line)); border-radius:12px; background:color-mix(in srgb,var(--accent,var(--ink)) 4%,var(--paper)); font-size:13px; }
.coding-coop-head { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
.coding-delegation-banner.is-ended { padding:6px 12px; gap:2px; background:transparent; }
.coding-delegation-banner.is-ended .coding-coop-head { font-size:12px; }
.coding-coop-line { display:flex; flex-wrap:wrap; align-items:center; gap:2px 4px; margin:0; min-width:0; overflow-wrap:anywhere; }
.coding-coop-line .mw-btn { min-height:24px; height:auto; padding:2px 4px; max-width:100%; white-space:normal; text-align:left; overflow-wrap:anywhere; }
.coding-coop-note { margin:0; font-size:12px; color:var(--muted); }
.coding-coop-rejected { margin:0; font-size:12px; color:var(--amber); }
.coding-coop-gone { color:var(--muted); font-style:italic; }
.coding-coop-task > summary, .coding-coop-receipts > summary { cursor:pointer; font-size:12px; color:var(--muted); }
.coding-coop-task p { margin:6px 0 0; white-space:pre-wrap; }
.coding-coop-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.coding-coop-reason { display:grid; gap:6px; width:100%; }
.coding-coop-deliver { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.coding-coop-deliver .mw-select { width:auto; }
.coding-coop-deliver .mw-input { flex:1 1 160px; min-width:0; }
.coding-coop-receipts ol { display:grid; gap:4px; margin:6px 0 0; padding:0 0 0 18px; font-size:12px; }
.coding-coop-receipts li { display:flex; flex-wrap:wrap; gap:2px 8px; }
.coding-coop-receipts time { color:var(--muted); font-variant-numeric:tabular-nums; }
.coding-coop-late { color:var(--amber); }
.coding-cooperation { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; min-width:0; }
.coding-cooperation h3, .coding-cooperation h4 { margin:0; }
.coding-coop-card { display:grid; grid-template-columns:minmax(0,1fr); gap:6px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; min-width:0; overflow-wrap:anywhere; }
.coding-coop-card > .mw-btn { justify-self:start; }
.coding-coop-delivery { display:grid; grid-template-columns:minmax(0,1fr); min-width:0; gap:6px; padding:8px 10px; border-radius:8px; background:color-mix(in srgb,var(--ink) 4%,transparent); }
.coding-coop-delivery p { margin:0; font-size:12px; overflow-wrap:anywhere; }
.coding-coop-related { display:grid; gap:4px; margin:0; padding:0; list-style:none; }
.coding-coop-related li { display:flex; flex-wrap:wrap; align-items:center; gap:2px 8px; min-width:0; }
.coding-coop-related .mw-btn { min-height:24px; height:auto; padding:2px 4px; max-width:100%; white-space:normal; text-align:left; overflow-wrap:anywhere; }
.coding-delegate-outputs { display:grid; gap:4px; border:0; padding:0; margin:0; }
.coding-earlier { display:block; margin:4px auto 20px; min-height:32px; padding:0 14px; border:1px solid var(--line); border-radius:999px; background:var(--paper); color:var(--muted); font:inherit; font-size:12px; cursor:pointer; }
.coding-earlier:hover:not(:disabled) { color:var(--ink); border-color:color-mix(in srgb,var(--ink) 30%,var(--line)); }
.coding-earlier:disabled { cursor:progress; }
.coding-digest { margin:0 0 8px; font-size:12px; color:var(--muted); }
.coding-digest > summary { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
.coding-digest > summary svg { width:14px; height:14px; }
.coding-digest > pre { max-height:18rem; overflow:auto; margin:6px 0 0; padding:10px 12px; border-radius:8px; background:color-mix(in srgb,var(--ink) 4%,var(--paper)); white-space:pre-wrap; font:12px/1.6 inherit; }
.coding-turn-own { white-space:pre-wrap; }
.coding-start .mw-empty { padding:24px 0; }
.coding-dialogue:has([data-coding-report-reader]:not([hidden])) > .coding-composer,
.coding-dialogue:has([data-coding-report-reader]:not([hidden])) > .coding-status { display:none; }
/* The report reads like a document in the same column as the conversation, with its actions kept in reach. */
[data-coding-report-reader] > header { position:sticky; top:0; z-index:2; display:flex; flex-wrap:wrap; align-items:center; gap:6px; max-width:76ch; margin:0 auto; padding:10px 0; border-bottom:1px solid var(--line); background:color-mix(in srgb,var(--paper) 94%,transparent); backdrop-filter:blur(8px); }
[data-coding-report-reader] > header .mw-btn { height:28px; min-height:28px; padding-inline:10px; font-size:12px; }
[data-coding-report-reader] > header [data-coding-report-close] { margin-right:auto; gap:4px; }
[data-coding-report-reader] > header [data-coding-report-close] svg { width:14px; height:14px; }
/* The reader is its own scroll area; without it a long report runs past the frame and cannot be reached. */
[data-coding-report-reader] { flex:1 1 0; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:0 28px 32px; }
/* 12px text measured in its own ch would sit narrower than the 13px column above and below it. */
[data-coding-report-reader] > p { max-width:calc(76ch * 13 / 12); margin:8px auto 0; }
[data-coding-report-reader] > p:empty,[data-coding-report-reader] > p[hidden] { display:none; }
.coding-report { max-width:76ch; margin:16px auto; overflow-wrap:anywhere; color:var(--ink); font-size:13px; line-height:1.7; }
.coding-report h1,.coding-report h2,.coding-report h3 { margin:1.4em 0 .5em; font-weight:600; line-height:1.4; }.coding-report > :first-child { margin-top:0; }
.coding-report h1 { font-size:19px; }.coding-report h2 { font-size:15px; }.coding-report h3 { font-size:14px; }.coding-report :not(pre) > code { padding:.12em .38em; border-radius:5px; background:color-mix(in srgb,var(--ink) 6%,transparent); font-size:.88em; }
.coding-report pre { position:relative; overflow:auto; padding:12px 14px; background:var(--rail); border:1px solid var(--line); border-radius:var(--radius-control); }
.coding-report .coding-code-copy { position:absolute; top:6px; right:6px; height:24px; min-height:24px; padding:0 8px; font-size:11.5px; opacity:0; transition:opacity .15s ease; }.coding-report pre:hover .coding-code-copy,.coding-report pre:focus-within .coding-code-copy,.coding-report .coding-code-copy:focus-visible { opacity:1; }@media (hover:none) { .coding-report .coding-code-copy { opacity:1; } }
.coding-report-source,[data-coding-report-status] { font-size:12px; color:var(--muted); }
.coding-turn { max-width:76ch; margin:0 auto 24px; font-size:14px; line-height:1.7; overflow-wrap:anywhere; }
/* The person's own words sit as a bubble on the column's right edge; the Agent's reply reads as the page. */
.coding-turn[data-kind=user] { width:fit-content; max-width:min(64ch,85%); margin-left:auto; margin-right:max(0px,calc((100% - 76ch) / 2)); padding:10px 16px; border-radius:18px 18px 6px 18px; background:var(--rail); }
.coding-turn p { margin:0 0 .8em; }.coding-turn p:last-child { margin-bottom:0; }
.coding-turn ul,.coding-turn ol { margin:.2em 0 .9em; padding-left:1.4em; }.coding-turn li + li { margin-top:.25em; }.coding-turn li > ul,.coding-turn li > ol { margin:.25em 0; }
.coding-turn :not(pre) > code { padding:.12em .38em; border-radius:5px; background:color-mix(in srgb,var(--ink) 6%,transparent); font-size:.86em; }
.coding-turn-receipt { display:block; margin-top:6px; color:var(--muted); font-size:12px; }
.coding-turn pre { position:relative; max-width:100%; margin:.4em 0 1em; overflow:auto; background:var(--rail); padding:12px 14px; border:1px solid var(--line); border-radius:10px; line-height:1.6; }
.coding-turn pre code { font-size:12px; }.coding-turn table { display:block; overflow:auto; border-collapse:collapse; }.coding-turn td,.coding-turn th { padding:5px 8px; border:1px solid var(--line); font-weight:400; }
.coding-turn h1,.coding-turn h2,.coding-turn h3,.coding-turn h4 { margin:1.3em 0 .5em; font-weight:600; line-height:1.4; }.coding-turn > :first-child { margin-top:0; }.coding-turn h1 {font-size:18px}.coding-turn h2 {font-size:16px}.coding-turn h3,.coding-turn h4 {font-size:14.5px}
.coding-turn .coding-code-copy { position:absolute; right:6px; top:6px; height:24px; min-height:24px; padding:0 8px; font-size:11.5px; opacity:0; transition:opacity .15s ease; }.coding-turn pre:hover .coding-code-copy,.coding-turn pre:focus-within .coding-code-copy,.coding-turn .coding-code-copy:focus-visible { opacity:1; }@media (hover:none) { .coding-turn .coding-code-copy { opacity:1; } }.coding-activity { max-width:76ch; margin:0 auto 20px; color:var(--muted); font-size:12px; }.coding-activity pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:260px; overflow:auto; }.coding-activity summary { cursor:pointer; }
.coding-status { flex:none; min-height:18px; margin:0; padding:4px 14px; font-size:12px; color:var(--muted); }
.coding-status[data-error=true] { color:var(--tone-blocked,var(--ink)); }
.coding-question-card { max-width:76ch; margin:16px auto 24px; padding:16px; border:1px solid var(--line); border-radius:var(--radius-control); display:grid; gap:12px; }
.coding-question-prompt,.coding-question-options legend { font-size:14px; line-height:1.6; overflow-wrap:anywhere; }
.coding-question-options { min-width:0; margin:0; padding:0; border:0; display:grid; gap:8px; }
.coding-question-option { display:flex; align-items:baseline; gap:8px; font-size:13px; line-height:1.6; cursor:pointer; }
.coding-question-text { display:grid; gap:6px; font-size:12px; }.coding-question-text textarea { width:100%; resize:vertical; }
.coding-question-hint,[data-question-status] { margin:0; font-size:12px; line-height:1.6; color:var(--muted); }
.coding-question-card [data-coding-answer-submit] { justify-self:start; }
.coding-composer { flex:none; display:flex; flex-direction:column; align-items:center; gap:8px; border:0; background:transparent; }
.coding-composer > .coding-context,
.coding-composer-shell,
.coding-composer-footnote,
.coding-composer .coding-model-setup { width:min(100%, 76ch); }
.coding-composer > .coding-context { justify-content:flex-start; }
.coding-composer-shell {
  display:flex; flex-direction:column; min-width:0;
  padding:2px 6px 6px; border:1px solid var(--control-input); border-radius:12px; background:var(--paper);
}
.coding-composer-shell:has(textarea:focus-visible) {
  border-color:var(--ink);
  outline:var(--focus-stroke, 1px solid var(--ink)); outline-offset:var(--focus-stroke-inset, -1px);
}
/* The field grows with what is written, up to a limit, instead of offering a resize grip. */
.coding-composer-shell textarea {
  resize:none; field-sizing:content; width:100%; min-height:56px; max-height:min(40vh,320px); overflow-y:auto; line-height:1.65;
  margin:0; padding:10px 8px 4px; border:0; border-radius:8px; background:transparent; box-shadow:none;
  caret-color:var(--ink);
}
.coding-composer-shell textarea:is(:hover, :focus, :focus-visible, :disabled) {
  border:0; outline:none; box-shadow:none; background:transparent;
}
.coding-composer-bar { display:flex; flex-wrap:wrap; align-items:center; gap:2px 4px; min-width:0; padding:2px 2px 0 2px; }
.coding-composer-leading { display:flex; flex:1; flex-wrap:wrap; align-items:center; gap:2px; min-width:0; }
.coding-composer-sep { width:1px; height:16px; margin:0 4px; background:var(--line); flex:none; }
/* Context and usage: a ring and a percentage beside send; the panel opens above the composer. */
.coding-meter { position:relative; flex:none; }
.coding-meter-toggle { display:inline-flex; align-items:center; gap:5px; height:28px; min-height:28px; padding:0 8px; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.coding-meter-ring { width:16px; height:16px; transform:rotate(-90deg); flex:none; }
.coding-meter-ring circle { fill:none; stroke-width:2.5; }
.coding-meter-ring circle:first-child { stroke:var(--line); }
.coding-meter-ring circle:last-child { stroke:var(--muted); stroke-linecap:round; stroke-dasharray:0 51; transition:stroke-dasharray .3s ease; }
.coding-meter[data-tone=notice] .coding-meter-ring circle:last-child { stroke:var(--amber); }
.coding-meter[data-tone=attention] .coding-meter-toggle { color:var(--amber); }
.coding-meter[data-tone=attention] .coding-meter-ring circle:last-child { stroke:var(--amber); }
.coding-meter-panel { position:absolute; right:0; bottom:calc(100% + 8px); z-index:30; width:min(340px,calc(100vw - 32px)); max-height:min(70vh,520px); overflow:auto; display:grid; gap:14px; padding:14px 16px; border:1px solid var(--line); border-radius:12px; background:var(--paper); box-shadow:0 12px 32px color-mix(in srgb,var(--ink) 14%,transparent); font-size:13px; }
.coding-meter-panel section { display:grid; gap:6px; }
.coding-meter-panel h3 { margin:0; font-size:12px; font-weight:600; color:var(--muted); }
.coding-meter-panel p { margin:0; }
.coding-meter-figure { font-variant-numeric:tabular-nums; }
.coding-meter-note { font-size:12px; color:var(--muted); }
.coding-meter-bar { height:6px; border-radius:999px; background:color-mix(in srgb,var(--ink) 8%,transparent); overflow:hidden; }
.coding-meter-bar > span { display:block; height:100%; border-radius:inherit; background:var(--muted); }
.coding-meter-bar[data-tone=notice] > span, .coding-meter-bar[data-tone=attention] > span { background:var(--amber); }
.coding-meter-panel dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:0; font-variant-numeric:tabular-nums; }
.coding-meter-panel dt { color:var(--muted); }
.coding-meter-panel dd { margin:0; text-align:right; }
.coding-meter-panel .mw-btn { justify-self:start; }
.coding-meter-budget { display:flex; align-items:center; gap:6px; }
.coding-meter-budget .mw-input { width:7rem; }
@media (max-width:640px) { .coding-meter-panel { position:fixed; left:16px; right:16px; bottom:96px; width:auto; } }
.coding-composer-context { display:flex; align-items:center; gap:0; min-width:0; }
.coding-composer-context [data-slot=button-label] { display:none; }
.coding-composer-context .mw-btn { position:relative; width:28px; min-width:28px; padding:0; color:var(--muted); }
.coding-composer-bar .mw-select-picker { width:auto; flex:none; }
.coding-composer-bar .mw-select-picker:has([data-coding-intent]) { max-width:7.5rem; }
.coding-composer-bar .mw-select-picker:has([data-coding-model]) { max-width:14rem; }
.coding-composer-bar .mw-select-picker__trigger {
  width:auto; max-width:100%; height:28px; min-height:28px; padding:0 20px 0 8px;
  border:0; border-radius:8px; background-color:transparent; box-shadow:none;
  color:var(--ink-soft); font-size:12px;
}
.coding-composer-bar .mw-select-picker__trigger:hover:not(:disabled) { background-color:var(--nav-hover); color:var(--ink); }
.coding-composer-bar .mw-select-picker__trigger:disabled { background-color:transparent; color:var(--faint); }
.coding-composer-bar .mw-select-picker__trigger:focus-visible {
  border:0; box-shadow:none;
  outline:var(--focus-stroke, 1px solid var(--ink)); outline-offset:var(--focus-stroke-inset, -1px);
}
.coding-composer-bar .coding-results-toggle { height:28px; min-height:28px; padding:0 8px; color:var(--muted); font-size:12px; }
.coding-composer-bar [data-coding-stop] { height:28px; min-height:28px; padding:0 8px; font-size:12px; }
.coding-composer-bar [data-coding-send] { margin-left:auto; flex:none; height:28px; min-height:28px; padding-inline:12px; }
.coding-composer small { font-size:11px; color:var(--muted); overflow-wrap:anywhere; }
.coding-composer-footnote { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.coding-composer-footnote kbd { font-size:10px; flex:none; }
.coding-composer .coding-model-setup { align-self:center; justify-content:flex-start; padding:0; height:auto; min-height:20px; font-size:12px; }
.coding-status { padding:4px 28px; min-height:0; }
.coding-status:empty { display:none; }
.coding-dialogue > .coding-status { width:min(100%, 76ch); margin-inline:auto; padding-inline:0; }
.coding-tools { display:none; overflow-y:auto; overscroll-behavior:contain; min-width:0; min-height:0; border-left:1px solid var(--line); background:var(--paper); }
[data-coding-results=true] .coding-tools { display:block; }
.coding-tool-tabs { position:sticky; top:0; z-index:2; display:flex; align-items:center; gap:8px; min-height:56px; padding:10px 12px 10px 20px; border-bottom:1px solid var(--line); background:color-mix(in srgb,var(--paper) 94%,transparent); backdrop-filter:blur(8px); }
.coding-tools-title { flex:1 1 auto; margin:0; font-size:14px; font-weight:600; color:var(--ink); }
[data-coding-tools][data-companion-open=true] .coding-tools-title { visibility:hidden; }
.coding-tool-tabs .coding-results-close { flex:none; width:28px; height:28px; min-height:28px; padding:0; justify-content:center; order:9; }
.coding-results-close svg { width:16px; height:16px; }
.coding-result { padding:12px 20px; font-size:13px; color:var(--muted); overflow-wrap:anywhere; }
.coding-result h3 { margin:0 0 12px; font-size:13px; font-weight:500; color:var(--ink); }
.coding-result dt { margin-top:12px; }.coding-result dd { margin:4px 0; color:var(--ink); white-space:pre-wrap; }
.coding-command { border-radius:6px; }
.coding-command > summary { list-style:none; display:flex; align-items:center; gap:8px; min-height:30px; padding:4px 8px; margin:0 -8px; border-radius:6px; cursor:pointer; color:var(--ink); }
.coding-command > summary::-webkit-details-marker { display:none; }
.coding-command > summary:hover { background:var(--nav-hover); }
.coding-command > summary code { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:12px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); }
.coding-command-state { flex:none; font:11px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); color:var(--muted); }
.coding-command-state[data-tone=done] { color:var(--green); }.coding-command-state[data-tone=failed] { color:var(--red); }
.coding-command-round { flex:none; font-size:11px; color:var(--faint); }
.coding-command > div { padding:4px 0 10px; }
.coding-command > div p { margin:8px 0 4px; font-size:11.5px; color:var(--muted); }
.coding-command > div p.coding-command-recorded { margin-top:0; font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); overflow-wrap:anywhere; }
.coding-command pre { max-height:320px; margin:0; overflow:auto; white-space:pre-wrap; font-size:12px; background:var(--rail); padding:10px 12px; border-radius:8px; }
/* Floats over the transcript's last lines, centred above the composer; its box nets to zero height in flow. */
.coding-dialogue .coding-jump { position:relative; z-index:3; align-self:center; flex:none; gap:6px; height:30px; min-height:30px; margin:-42px auto 12px; padding:0 12px 0 10px; border:1px solid var(--line); border-radius:999px; background:var(--paper); color:var(--ink); font-size:12px; box-shadow:0 1px 2px rgb(0 0 0 / 6%),0 6px 16px rgb(0 0 0 / 8%); }
.coding-dialogue .coding-jump svg { width:14px; height:14px; }
@media (prefers-reduced-motion:no-preference) { .coding-dialogue .coding-jump:not([hidden]) { animation:coding-rise .16s ease-out both; } }
.coding-stage:has([data-companion-open=true]) { grid-template-columns:minmax(0,1fr); }
.coding-stage:has([data-companion-open=true]) .coding-dialogue { display:none; }
.coding-stage:has([data-companion-open=true]) .coding-tools,.coding-stage:has([data-coding-change-reader]:not([hidden])) .coding-tools { display:block; }
/* Changes open beside the conversation, so reading a diff never loses the thread that produced it. */
.coding-stage:has([data-coding-change-reader]:not([hidden])) { grid-template-columns:minmax(360px,.9fr) minmax(480px,1.1fr); }
.coding-stage:has([data-coding-change-reader]:not([hidden])) .coding-tool-tabs { display:none; }
@container molis-coding (max-width:1100px) {
  .coding-stage:has([data-coding-change-reader]:not([hidden])) { grid-template-columns:minmax(0,1fr); }
  .coding-stage:has([data-coding-change-reader]:not([hidden])) .coding-dialogue { display:none; }
  [data-coding-results=true] .coding-stage { grid-template-columns:minmax(0,1fr); }
  [data-coding-results=true] .coding-dialogue { display:none; }
  .coding-composer-context .mw-btn { width:32px; min-width:32px; }
  .coding-composer-context .mw-btn[data-count]:not([data-count=""])::after { content:attr(data-count); position:absolute; right:0; top:0; font-size:9px; }
}
@container molis-coding (max-width:760px) {
  .coding-layout { grid-template-columns:minmax(0,1fr); }
  [data-coding-workbench]:not([data-coding-detail=true]) .coding-stage { display:none; }
  [data-coding-detail=true] .coding-directory { display:none; }
  .coding-directory-back { display:inline-flex; }
  .mw-layout-primitives .coding-directory { width:100%; }
  .mw-layout-primitives .coding-dialogue-head { padding:16px 16px 8px; }
  .mw-layout-primitives .coding-dialogue > .mw-frame__panel { padding:8px 16px 16px; }
  .mw-layout-primitives .coding-composer { padding:8px 16px 16px; }
  .coding-identity-copy p { max-width:38vw; }
  .coding-welcome { padding:16px 0; }
  .coding-starters { display:grid; }
  .coding-tools { border:0; }
  .coding-turns { flex:1 1 160px; min-height:80px; }
  .coding-dialogue { overflow-y:auto; }
  .coding-composer-context .mw-btn { width:44px; min-width:44px; }
  .coding-composer-shell textarea { font-size:16px; max-height:120px; }
  .coding-composer-bar .mw-select-picker__trigger { padding-inline:8px; }
  .coding-composer-footnote { display:none; }
  .coding-status { padding-inline:16px; }
  [data-coding-workbench] :is(.mw-btn,.mw-toggle,.mw-dir-row,.mw-dir__add,.mw-select-picker__trigger) { min-height:44px; }
}
@media (prefers-reduced-motion:no-preference) {
  [data-coding-results=true] .coding-tools { animation:creative-arrive var(--motion-normal,190ms) var(--ease-out) both; }
}

  .coding-method-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); }
  [data-coding-method-list] { display:grid; gap:var(--space-4); }
  [data-coding-tools]:has([data-coding-change-reader]:not([hidden])) > :not([data-coding-change-reader]):not(.coding-tool-tabs) { display:none; }

/* Timeline: tool calls read as rows, a round closes with what happened. */
.coding-activity { max-width:76ch; margin:-12px auto 20px; color:var(--muted); font-size:12.5px; }
.coding-activity > summary { list-style:none; display:flex; align-items:center; gap:8px; width:fit-content; max-width:100%; padding:4px 10px 4px 8px; border-radius:999px; cursor:pointer; color:var(--muted); transition:background-color .15s ease, color .15s ease; }
.coding-activity > summary::-webkit-details-marker { display:none; }
.coding-activity > summary:hover { background:var(--nav-hover); color:var(--ink); }
.coding-activity[open] > summary { color:var(--ink); }
.coding-tools-summary { display:inline-flex; align-items:center; gap:7px; min-width:0; }
.coding-tools-summary > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-tools-summary svg, .coding-tool svg, .coding-run-card svg, .coding-live svg { width:14px; height:14px; flex:none; }
.coding-tools-summary.is-live > span:last-child { background:linear-gradient(90deg, var(--muted) 0%, var(--ink) 50%, var(--muted) 100%); background-size:200% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation:coding-shimmer 1.8s linear infinite; }
.coding-tools-summary.is-waiting { color:var(--amber); }
.coding-tool-state[data-tone=waiting] { color:var(--amber); }
.coding-tool-state[data-tone=held] { color:var(--faint); }
.coding-tool-preview { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); }
/* Reasoning reads as quoted prose under its row, never as tool output. */
.coding-tool[data-kind=reasoning] .coding-tool-output { font-family:inherit; font-size:12.5px; line-height:1.7; white-space:pre-wrap; color:var(--muted); background:none; border:0; border-left:2px solid var(--line); border-radius:0; padding:2px 0 2px 12px; max-height:360px; }
.coding-tools-chevron { display:inline-flex; color:var(--faint); opacity:0; transition:opacity .15s ease,transform .15s ease; }
.coding-tools-chevron svg { width:12px; height:12px; }
.coding-activity > summary:hover .coding-tools-chevron,.coding-activity > summary:focus-visible .coding-tools-chevron,.coding-activity[open] > summary .coding-tools-chevron { opacity:1; }
.coding-activity[open] > summary .coding-tools-chevron { transform:rotate(90deg); }
.coding-tool-list { margin:6px 0 0 11px; padding-left:14px; border-left:1px solid var(--line); display:grid; gap:1px; animation:coding-rise .18s ease-out; }
.coding-tool > summary, .coding-tool-head { list-style:none; display:flex; align-items:center; gap:8px; min-width:0; padding:3px 6px; border-radius:6px; color:var(--muted); }
.coding-tool > summary::-webkit-details-marker { display:none; }
.coding-tool > summary { cursor:pointer; }
.coding-tool > summary:hover { background:var(--nav-hover); color:var(--ink); }
.coding-tool code { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--ink); background:none; padding:0; }
.coding-tool-icon { display:inline-flex; color:var(--faint); }
.coding-tool-verb { flex:none; }
.coding-tool-state { display:inline-flex; align-items:center; gap:4px; margin-left:auto; flex:none; font-size:11px; font-variant-numeric:tabular-nums; }
.coding-tool-state[data-tone=ok] { color:var(--green); }
.coding-tool-state[data-tone=failed] { color:var(--red); }
.coding-tool-state[data-tone=unknown] { color:var(--amber); }
.coding-tool-output { margin:4px 0 8px 28px; max-height:280px; overflow:auto; padding:8px 10px; border-radius:8px; background:var(--rail); color:var(--ink); font-size:11.5px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
.coding-spinner { width:12px; height:12px; flex:none; border-radius:50%; border:1.5px solid color-mix(in srgb, var(--muted) 30%, transparent); border-top-color:var(--ink); animation:coding-spin .8s linear infinite; }
.coding-inline-review { max-width:76ch; margin:0 auto 18px; animation:coding-rise .22s ease-out; }
.coding-inline-review .agent-review { padding:0; border:0; }
.coding-inline-review [data-agent-review-item]:not([data-agent-review-phase=pending]) { display:none; }
.coding-inline-review [data-agent-review-phase=pending] { border-color:color-mix(in srgb, var(--amber) 45%, var(--line)); box-shadow:0 1px 2px rgb(0 0 0 / .04), 0 0 0 3px color-mix(in srgb, var(--amber) 10%, transparent); }
.coding-inline-review .agent-review-actions .mw-btn--primary { min-width:96px; }
.coding-run-footer { max-width:76ch; margin:0 auto 28px; }
.coding-live { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; }
.coding-live-text { color:var(--ink); }
.coding-run-footer[data-state=live] .coding-live-text { background:linear-gradient(90deg, var(--muted) 0%, var(--ink) 50%, var(--muted) 100%); background-size:200% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation:coding-shimmer 1.8s linear infinite; }
.coding-run-footer[data-state=waiting] .coding-live { color:var(--amber); }
.coding-live-time { font-variant-numeric:tabular-nums; color:var(--faint); }
.coding-pulse { width:8px; height:8px; border-radius:50%; background:var(--blue); box-shadow:0 0 0 0 color-mix(in srgb, var(--blue) 45%, transparent); animation:coding-pulse 1.4s ease-out infinite; }
.coding-run-card { padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--paper); animation:coding-rise .24s ease-out; }
.coding-run-card header { display:flex; align-items:center; gap:8px; }
.coding-run-card header strong { font-weight:500; font-size:13.5px; color:var(--ink); }
.coding-run-mark { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; background:var(--green-soft); color:var(--green); }
.coding-run-card[data-tone=failed] .coding-run-mark { background:var(--red-soft); color:var(--red); }
.coding-run-card[data-tone=stopped] .coding-run-mark { background:var(--rail); color:var(--muted); }
.coding-run-card[data-tone=partial] .coding-run-mark { background:color-mix(in srgb,var(--amber) 14%,transparent); color:var(--amber); }
.coding-run-round { margin-left:auto; font-size:11px; color:var(--faint); }
.coding-run-facts { margin:6px 0 0 28px; font-size:12.5px; color:var(--muted); }
.coding-run-reason { margin:6px 0 0 28px; font-size:12.5px; color:var(--ink); }
.coding-run-reason small { display:inline-block; margin-top:2px; color:var(--faint); font:11px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); overflow-wrap:anywhere; }
.coding-run-files { list-style:none; margin:8px 0 0 28px; padding:0; display:grid; gap:2px; font-size:12px; }
.coding-run-files li { display:flex; align-items:center; gap:6px; color:var(--muted); }
.coding-run-files code { color:var(--ink); background:none; padding:0; }
.coding-run-actions { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0 28px; }
.coding-run-actions .mw-btn { height:28px; min-height:28px; font-size:12px; gap:6px; }
@keyframes coding-spin { to { transform:rotate(360deg); } }
@keyframes coding-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
@keyframes coding-pulse { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--blue) 45%, transparent); } 100% { box-shadow:0 0 0 8px transparent; } }
@keyframes coding-rise { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .coding-spinner, .coding-pulse, .coding-tools-summary.is-live > span:last-child, .coding-run-footer[data-state=live] .coding-live-text, .coding-tool-list, .coding-inline-review, .coding-run-card { animation:none; } }

/* A new session opens like a blank page: the question, the composer, and a few ways in. */
.coding-dialogue:has([data-coding-welcome]) .coding-turns { display:flex; flex-direction:column; justify-content:flex-end; }
.coding-dialogue:has([data-coding-welcome]) > .coding-composer { margin-bottom:clamp(24px, 18vh, 180px); }
.coding-dialogue:has([data-coding-welcome]) > .coding-status:empty { display:none; }
.coding-welcome { width:min(100%, 76ch); margin:0 auto; padding:0 0 18px; text-align:left; animation:coding-rise .3s ease-out; }
.coding-welcome h2 { margin:6px 0 6px; font-size:24px; font-weight:500; letter-spacing:-.01em; color:var(--ink); }
.coding-welcome > p { margin:0; color:var(--muted); font-size:13.5px; line-height:1.6; }
.coding-welcome-kicker { display:inline-flex; align-items:center; gap:6px; margin:0 !important; padding:2px 10px 2px 8px; border-radius:999px; background:var(--rail); color:var(--muted) !important; font-size:12px !important; }
.coding-welcome-kicker svg { width:13px; height:13px; }
.coding-starters { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; margin-top:18px; }
.coding-starter { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; min-height:44px; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:var(--paper); color:var(--ink); text-align:left; font:inherit; cursor:pointer; transition:border-color .15s ease, background-color .15s ease, transform .15s ease; }
.coding-starter:hover:not(:disabled) { border-color:var(--line-strong); background:var(--nav-hover); transform:translateY(-1px); }
.coding-starter:disabled { opacity:.5; cursor:default; }
.coding-starter svg { width:16px; height:16px; color:var(--muted); }
.coding-starter strong { font-weight:500; font-size:13px; }
.coding-starter small { font-size:11px; color:var(--faint); }
@media (max-width: 640px) { .coding-starters { grid-template-columns:minmax(0,1fr); } .coding-dialogue:has([data-coding-welcome]) > .coding-composer { margin-bottom:12px; } }

.coding-start { display:grid; place-items:center; min-height:0; height:100%; padding:24px; }
.coding-start-hero { display:grid; justify-items:center; gap:10px; max-width:420px; text-align:center; animation:coding-rise .3s ease-out; }
.coding-start-mark { display:grid; place-items:center; width:44px; height:44px; border-radius:12px; background:var(--rail); color:var(--ink); }
.coding-start-mark svg { width:22px; height:22px; }
.coding-start-hero h2 { margin:6px 0 0; font-size:22px; font-weight:500; color:var(--ink); }
.coding-start-hero p { margin:0 0 6px; color:var(--muted); font-size:13.5px; line-height:1.6; }
.coding-start-hero small { color:var(--faint); font-size:12px; }

.coding-identity { align-items:center; }
.coding-identity-copy h2 { font-size:15px; font-weight:500; line-height:1.35; color:var(--ink); }
.coding-workspace-chip { display:inline-flex; align-items:center; gap:5px; max-width:100%; margin-top:3px; color:var(--muted); font-size:12px; }
.coding-workspace-chip svg { width:12px; height:12px; flex:none; opacity:.75; }
.coding-workspace-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-head-actions { display:flex; align-items:center; gap:8px; flex:none; }
.coding-head-actions .coding-results-toggle { height:28px; min-height:28px; padding:0 10px; gap:6px; font-size:12px; color:var(--muted); }
.coding-head-actions .coding-results-toggle svg { width:15px; height:15px; }
.coding-phase { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px; border-radius:999px; font-size:12px; background:color-mix(in srgb, var(--blue) 10%, transparent); color:var(--blue-dark, var(--blue)); }
.coding-phase::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; animation:coding-pulse 1.4s ease-out infinite; }
.coding-phase[data-phase=awaiting-review], .coding-phase[data-phase=awaiting-input] { background:color-mix(in srgb, var(--amber) 14%, transparent); color:var(--amber); }
.coding-phase[data-phase=awaiting-review]::before, .coding-phase[data-phase=awaiting-input]::before { animation:none; }

/* Composer: the task first, then mode, model and send; context lives behind "+". */
.coding-composer-shell { border-radius:16px !important; transition:border-color .15s ease, box-shadow .15s ease; }
.coding-composer-shell:focus-within { box-shadow:0 0 0 3px color-mix(in srgb, var(--focus, var(--blue)) 14%, transparent); }
.coding-attach { position:relative; }
.coding-attach-toggle { width:28px !important; min-width:28px !important; height:28px; min-height:28px; padding:0 !important; border-radius:999px !important; color:var(--muted); }
.coding-attach-toggle[aria-expanded=true] { background:var(--nav-active); color:var(--ink); }
.coding-attach-toggle[aria-expanded=true] svg { transform:rotate(45deg); }
.coding-attach-toggle svg { transition:transform .15s ease; }
.coding-attach-menu { position:absolute; left:0; bottom:calc(100% + 8px); z-index:20; display:grid; gap:2px; min-width:196px; padding:6px; border:1px solid var(--line); border-radius:12px; background:var(--paper); box-shadow:0 10px 30px rgb(0 0 0 / .12), 0 2px 6px rgb(0 0 0 / .06); animation:coding-rise .14s ease-out; }
.coding-attach-menu .coding-composer-context { display:grid; gap:2px; }
.coding-attach-menu .mw-btn { justify-content:flex-start; width:100% !important; min-width:0 !important; height:32px; padding:0 10px !important; gap:8px; color:var(--ink) !important; }
.coding-attach-menu .coding-composer-context [data-slot=button-label] { display:inline; }
.coding-composer-bar [data-coding-send] { border-radius:999px; }

/* Change reader: a compact index of writes, folded hunks, and comments docked below. */
.coding-change { display:flex; flex-direction:column; min-height:100%; font-size:13px; color:var(--ink); }
.coding-change-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 12px 12px 20px; border-bottom:1px solid var(--line); background:color-mix(in srgb,var(--paper) 94%,transparent); backdrop-filter:blur(8px); }
.coding-change-heading { min-width:0; }
.coding-change-heading h3 { margin:0; font-size:14px; font-weight:600; }
.coding-change-heading p { margin:2px 0 0; font-size:12px; color:var(--muted); }
.coding-change-actions { display:flex; align-items:center; gap:6px; flex:none; }
.coding-change-actions .mw-btn { height:28px; min-height:28px; padding-inline:10px; font-size:12px; }
.coding-change-actions .coding-change-close { width:28px; padding:0; justify-content:center; }
.coding-change-close svg { width:16px; height:16px; }
.coding-change-fixed { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 9px; border-radius:999px; background:color-mix(in srgb,var(--green) 12%,transparent); color:var(--green); font-size:11.5px; white-space:nowrap; }
.coding-change-fixed[hidden] { display:none; }
.coding-change-fixed svg { width:12px; height:12px; }
.coding-change-status { margin:10px 20px 0; font-size:12px; color:var(--muted); }
.coding-change-status:empty { display:none; }
.coding-change-files { display:grid; gap:2px; margin:12px 12px 0; padding:4px; border:1px solid var(--line); border-radius:10px; }
.coding-change-files:empty { display:none; }
.coding-change-file { display:grid; gap:1px; }
.coding-change-write,.coding-change-file-head { display:flex; align-items:center; gap:8px; width:100%; min-height:32px; padding:4px 8px; border:0; border-radius:6px; background:transparent; color:var(--ink); font:inherit; font-size:12.5px; text-align:left; }
.coding-change-write { cursor:pointer; transition:background-color .12s ease,color .12s ease; }
.coding-change-write:hover { background:var(--nav-hover); }
.coding-change-write[aria-pressed=true] { background:var(--nav-active); }
.coding-change-write:focus-visible { outline:2px solid var(--focus,var(--blue)); outline-offset:-2px; }
.coding-change-write:not(.is-file) { padding-left:30px; color:var(--muted); font-size:12px; }
.coding-change-write:not(.is-file)[aria-pressed=true] { color:var(--ink); }
.coding-change-write.is-net { color:var(--ink); }
.coding-change-write.is-net .coding-change-step::after { content:" · 第一次写入前 → 最后一次写入后"; color:var(--faint); font-size:11px; }
.coding-change-icon { display:inline-flex; color:var(--muted); }
.coding-change-icon svg { width:14px; height:14px; }
.coding-change-path { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:12px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); }
.coding-change-dir { color:var(--muted); }
.coding-change-path b { font-weight:500; }
.coding-change-step { flex:1 1 auto; }
.coding-change-kind { flex:none; font-size:11px; color:var(--muted); }
.coding-change-counts { flex:none; display:inline-flex; gap:6px; font:11.5px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); font-variant-numeric:tabular-nums; }
.coding-change-counts ins { color:var(--green); text-decoration:none; }
.coding-change-counts del { color:var(--red); text-decoration:none; }
.coding-change-state { flex:none; display:inline-flex; align-items:center; gap:5px; min-width:5.5em; font-size:11px; color:var(--muted); }
.coding-change-state::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.coding-change-state[data-tone=done] { color:var(--green); }
.coding-change-state[data-tone=failed] { color:var(--red); }
.coding-change-state[data-tone=attention] { color:var(--amber); }
.coding-change-body { padding:12px 12px 8px; }
.coding-change-note { margin:0 20px 16px; font-size:11.5px; line-height:1.5; color:var(--faint); }
.coding-change-body:empty { display:none; }
[data-coding-change-reader] .diff .diff-notices { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 8px; }
[data-coding-change-reader] .diff .diff-notices li { padding:2px 9px; border-radius:999px; background:var(--nav-hover); font-size:11.5px; line-height:1.6; }
[data-coding-change-reader] .diff .diff-rows { margin:0; padding:4px 0; border-radius:10px; background:var(--paper); font-size:12px; line-height:20px; }
[data-coding-change-reader] .diff .diff-rows li { grid-template-columns:5ch 5ch minmax(max-content,1fr); gap:0; padding:0; }
[data-coding-change-reader] .diff .diff-rows li.diff-fold { display:block; }
[data-coding-change-reader] .diff .diff-rows li[hidden] { display:none; }
[data-coding-change-reader] .diff .diff-rows code { padding:0 16px 0 8px; }
[data-coding-change-reader] .diff .diff-before,[data-coding-change-reader] .diff .diff-after { padding-right:6px; color:var(--faint); user-select:none; }
[data-coding-change-reader] .diff [data-kind=insert] .diff-sign { color:var(--green); }
[data-coding-change-reader] .diff [data-kind=delete] .diff-sign { color:var(--red); }
[data-coding-change-reader] [data-coding-line] { all:unset; box-sizing:border-box; display:block; width:100%; padding-right:2px; border-radius:4px; text-align:right; cursor:pointer; }
[data-coding-change-reader] [data-coding-line]:hover { background:color-mix(in srgb,var(--blue) 14%,transparent); color:var(--blue); }
[data-coding-change-reader] [data-coding-line]:focus-visible { outline:2px solid var(--focus,var(--blue)); outline-offset:-2px; color:var(--blue); }
[data-coding-change-reader] li[data-coding-commented] { box-shadow:inset 3px 0 0 var(--blue); }
.coding-change-feedback { position:sticky; bottom:0; z-index:1; display:grid; gap:8px; margin-top:auto; padding:12px 12px 14px 20px; border-top:1px solid var(--line); background:var(--paper); }
.coding-change-feedback > header { display:flex; align-items:baseline; gap:8px; }
.coding-change-feedback h4 { margin:0; font-size:12.5px; font-weight:600; }
[data-coding-feedback-count] { font-size:11px; color:var(--muted); }
[data-coding-feedback-hint] { margin:0; font-size:12px; color:var(--muted); }
[data-coding-feedback-list] { display:grid; gap:8px; max-height:32vh; overflow:auto; }
[data-coding-feedback-list]:empty { display:none; }
.coding-feedback-item { display:grid; gap:4px; padding:8px; border:1px solid var(--line); border-radius:8px; animation:coding-rise .18s ease-out; }
.coding-feedback-where { display:flex; align-items:center; gap:8px; color:var(--muted); font:11.5px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); }
.coding-feedback-where span { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-feedback-item .coding-feedback-remove { width:24px; height:24px; min-height:24px; padding:0; justify-content:center; }
.coding-feedback-remove svg { width:12px; height:12px; }
.coding-feedback-item textarea { width:100%; min-height:52px; resize:vertical; }
.coding-change-feedback-foot { display:flex; align-items:center; justify-content:flex-end; gap:12px; }
.coding-change-feedback:has([data-coding-feedback-list]:empty) .coding-change-feedback-foot { display:none; }
.coding-change-feedback:has([data-coding-feedback-list]:empty) { gap:2px; padding-block:10px; }
.coding-change-feedback-foot .mw-btn { flex:none; }
@container molis-coding (max-width:760px) {
  .coding-change-head { flex-wrap:wrap; padding:12px 8px 10px 16px; }
  .coding-change-actions { flex-wrap:wrap; }
  .coding-change-actions .mw-btn,.coding-change-write { min-height:44px; }
  .coding-change-actions .coding-change-close { width:44px; }
  [data-coding-change-reader] [data-coding-line] { min-height:32px; line-height:32px; }
  .coding-change-feedback-foot { flex-direction:column; align-items:stretch; }
}
@media (prefers-reduced-motion:no-preference) {
  [data-coding-change-reader]:not([hidden]) { animation:coding-rise .2s var(--ease-out,ease-out) both; }
}

/* Results panel: facts of the latest round, each round's outcomes, receipts, then checkpoints. */
.coding-tools > .coding-result { padding:16px 20px; border-bottom:1px solid var(--line); }
.coding-tools > .coding-result[hidden] { display:none; }
.coding-facts-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.coding-result .coding-facts-head h3 { margin:0; flex:1 1 auto; }
.coding-facts-phase { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--muted); }
.coding-facts-phase::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.coding-facts-phase[data-tone=done] { color:var(--green); }.coding-facts-phase[data-tone=failed] { color:var(--red); }.coding-facts-phase[data-tone=live] { color:var(--blue); }
.coding-facts-round { font-size:11px; color:var(--faint); }
.coding-facts dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px 16px; margin:0; font-size:12.5px; }
.coding-result.coding-facts dt { margin:0; color:var(--muted); }
.coding-result.coding-facts dd { margin:0; color:var(--ink); white-space:normal; overflow-wrap:anywhere; }
.coding-facts dd.is-path { font:12px var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); }
.coding-facts-unused { margin:10px 0 0; font-size:11.5px; color:var(--faint); }
.coding-outcomes [data-coding-outcome-list] { display:grid; gap:2px; }
.coding-outcome { display:flex; align-items:center; gap:8px; min-height:34px; padding:2px 4px 2px 8px; margin:0 -8px; border-radius:6px; }
.coding-outcome:hover { background:var(--nav-hover); }
.coding-outcome-name { color:var(--ink); font-size:12.5px; }
.coding-outcome-phase { flex:1 1 auto; display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--muted); }
.coding-outcome-phase[data-tone=done] { color:var(--green); }.coding-outcome-phase[data-tone=failed] { color:var(--red); }
.coding-outcome .mw-btn { height:26px; min-height:26px; padding:0 8px; gap:5px; font-size:12px; color:var(--muted); }
.coding-outcome .mw-btn:hover { color:var(--ink); }
.coding-outcome .mw-btn svg { width:13px; height:13px; }
.coding-checkpoints > summary { cursor:pointer; color:var(--ink); font-size:13px; font-weight:500; }
.coding-checkpoints > p { margin:8px 0; }
@container molis-coding (max-width:760px) {
  .coding-tool-tabs .coding-results-close { width:44px; height:44px; }
  .coding-outcome .mw-btn,.coding-command > summary { min-height:44px; }
}

/* Session rows carry their state as a dot: live work pulses, anything waiting on the person is amber. */
.coding-session-state { display:inline-flex; align-items:center; gap:5px; }
.coding-session-state:is([data-state=running],[data-state=paused],[data-state=waiting-answer],[data-state=waiting-approval],[data-state=failed],[data-state=reconcile-required])::before { content:""; flex:none; width:6px; height:6px; border-radius:50%; background:currentColor; }
.coding-session-state[data-state=running] { color:var(--blue); }
.coding-session-state:is([data-state=paused],[data-state=waiting-answer],[data-state=waiting-approval]) { color:var(--amber); }
.coding-session-state:is([data-state=failed],[data-state=reconcile-required]) { color:var(--red); }
@media (prefers-reduced-motion:no-preference) { .coding-session-state[data-state=running]::before { animation:coding-pulse 1.4s ease-in-out infinite; } }

/* Streaming caret: sits after the last line the model has written so far. */
.coding-turn.is-writing > :last-child::after,.coding-turn.is-writing:not(:has(> *))::after { content:""; display:inline-block; width:.45em; height:1.05em; margin-left:2px; vertical-align:-.15em; border-radius:1px; background:var(--ink); opacity:.55; }
@media (prefers-reduced-motion:no-preference) { .coding-turn.is-writing > :last-child::after,.coding-turn.is-writing:not(:has(> *))::after,.coding-turn.is-writing > :is(ul,ol):last-child > li:last-child::after { animation:coding-caret 1s steps(2,start) infinite; } }
@keyframes coding-caret { to { visibility:hidden; } }
.coding-turn.is-writing > :is(ul,ol):last-child > li:last-child::after { content:""; display:inline-block; width:.45em; height:1.05em; margin-left:2px; vertical-align:-.15em; border-radius:1px; background:var(--ink); opacity:.55; }
.coding-turn.is-writing > :is(ul,ol,pre,table):last-child::after { content:none; }

/* A Host-composed continuation reads as a quiet marker in the conversation, not a wall of text from the person. */
.coding-turn.is-continuation[data-kind=user] { width:auto; max-width:76ch; margin-inline:auto; padding:0; border-radius:0; background:none; }
.coding-turn.is-continuation details > summary { list-style:none; display:flex; align-items:center; gap:8px; width:fit-content; max-width:100%; padding:5px 12px 5px 10px; border:1px dashed var(--line); border-radius:999px; color:var(--muted); font-size:12.5px; cursor:pointer; }
.coding-turn.is-continuation details > summary::-webkit-details-marker { display:none; }
.coding-turn.is-continuation details > summary:hover { color:var(--ink); background:var(--nav-hover); }
.coding-turn.is-continuation summary svg { width:12px; height:12px; flex:none; }
.coding-continuation-facts { margin:8px 0 0; padding:10px 14px; border-left:2px solid var(--line); color:var(--muted); font-size:12.5px; line-height:1.7; }

.coding-filter-count { display:inline-flex; align-items:center; justify-content:center; min-width:16px; height:16px; margin-left:4px; padding:0 4px; border-radius:999px; background:color-mix(in srgb,var(--ink) 8%,transparent); font-size:10.5px; font-variant-numeric:tabular-nums; }
.coding-filter[data-coding-filter=needs-you] .coding-filter-count { background:color-mix(in srgb,var(--amber) 18%,transparent); color:var(--amber); }
.coding-filter-count[hidden] { display:none; }

/* Running plan: the round's own step graph under the task, with the person's controls while it runs. */
.coding-plan-progress { max-width:76ch; margin:0 auto 20px; padding:12px 14px 10px; border:1px solid var(--line); border-radius:12px; background:var(--paper); font-size:13px; animation:coding-rise .18s ease-out; }
.coding-plan-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; color:var(--ink); }
.coding-plan-head svg { width:14px; height:14px; color:var(--muted); flex:none; }
.coding-plan-head strong { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.coding-plan-count { flex:none; font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.coding-plan-revision { flex:none; font-size:11px; color:var(--faint); }
/* The plan card in the conversation uses the TaskBoard's rows, without the progress column. */
.coding-plan-steps { margin:2px 0 0; }
.coding-board--compact .coding-board-entry { grid-template-columns:minmax(0,1fr) 7.5rem 7rem auto; padding:0 6px; }
.coding-plan-step[data-state=running] .coding-board-node strong { font-weight:500; }
.coding-plan-step:is([data-state=skipped],[data-state=cancelled]) .coding-board-node strong { color:var(--faint); text-decoration:line-through; }
.coding-plan-step[data-inserted=true] .coding-board-node strong::after { content:"你插入的"; margin-left:6px; padding:0 6px; border-radius:999px; background:color-mix(in srgb,var(--blue) 12%,transparent); color:var(--blue); font-size:10.5px; text-decoration:none; }
.coding-plan-form { display:grid; gap:6px; margin:4px 0 6px 28px; padding:8px; border:1px solid var(--line); border-radius:8px; }
.coding-plan-form .mw-input { height:30px; font-size:12.5px; }
.coding-plan-form-actions { display:flex; justify-content:flex-end; gap:6px; }
.coding-plan-form-actions .mw-btn { height:26px; min-height:26px; font-size:12px; }
.coding-plan-foot { margin:6px 0 0; font-size:11.5px; color:var(--faint); }
@media (hover:none) { .coding-board-tools { display:inline-flex; } }
@container molis-coding (max-width:760px) { .coding-board--compact .coding-board-entry { grid-template-columns:minmax(0,1fr) auto; } .coding-board--compact :is(.coding-board-deps,.coding-board-meta) { display:none; } .coding-board-tools { display:inline-flex; position:static; box-shadow:none; } }

/* Subagents under the step that sent them: one card each, with its own timeline, approvals and conclusion. */
.coding-children { max-width:76ch; margin:-8px auto 20px; display:grid; grid-template-columns:minmax(0,1fr); gap:8px; }
/* A long unwrapped preview must never widen a card past the reading column. */
.coding-children > * { min-width:0; }
.coding-child { min-width:0; overflow:hidden; }
.coding-children-head { display:flex; align-items:center; gap:8px; margin:0; padding-left:2px; font-size:12px; color:var(--muted); }
.coding-children-compare { all:unset; margin-left:auto; padding:2px 8px; border-radius:999px; font-size:11.5px; color:var(--muted); cursor:pointer; }
.coding-children-compare:hover,.coding-children-compare[aria-pressed=true] { background:var(--nav-hover); color:var(--ink); }
.coding-children-compare:focus-visible { outline:2px solid var(--focus,var(--blue)); }
/* Side by side, the column widens past the reading measure so two agents' work sits next to each other. */
.coding-children[data-layout=compare] { max-width:min(100%,1200px); grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); align-items:start; }
.coding-children[data-layout=compare] > .coding-children-head { grid-column:1 / -1; }
.coding-children[data-layout=compare] .coding-child-result > .coding-turn { max-height:420px; overflow:auto; }
.coding-child { padding:10px 12px; border:1px solid var(--line); border-radius:12px; background:var(--paper); animation:coding-rise .18s ease-out; }
.coding-child[data-state=running] { border-color:color-mix(in srgb,var(--blue) 35%,var(--line)); }
.coding-child-head { display:flex; align-items:center; gap:8px; min-width:0; }
.coding-child-mark { display:inline-flex; width:16px; justify-content:center; color:var(--faint); flex:none; }
.coding-child-mark svg { width:14px; height:14px; }
.coding-child[data-state=completed] .coding-child-mark { color:var(--green); }
.coding-child[data-state=failed] .coding-child-mark { color:var(--red); }
.coding-child-role { font-size:13px; font-weight:600; color:var(--ink); white-space:nowrap; }
.coding-child-state { font-size:12px; color:var(--muted); white-space:nowrap; }
.coding-child[data-state=running] .coding-child-state { color:var(--blue); }
.coding-child-meta { margin-left:auto; font-size:11px; color:var(--faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.coding-child-task { margin:4px 0 2px 24px; font-size:12.5px; color:var(--ink-soft,var(--ink)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.coding-child .coding-child-process { max-width:none; margin:4px 0 0 16px; }
.coding-child-reviews { margin:6px 0 0 24px; }
.coding-child-reviews[hidden] { display:none; }
.coding-child-reviews .agent-review { padding:0; border:0; }
.coding-child-result { margin:6px 0 0 24px; }
.coding-child-result > summary { cursor:pointer; font-size:12px; color:var(--muted); width:fit-content; }
.coding-child-result > .coding-turn { max-width:none; margin:6px 0 0; padding:10px 12px; border-left:2px solid var(--line); font-size:13px; }
.coding-child-error { margin:6px 0 0 24px; font-size:12px; color:var(--red); }
.coding-child-changed { margin:6px 0 0 24px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
.coding-child-foot { display:flex; gap:6px; margin:8px 0 0 24px; }
.coding-child-foot:empty { display:none; }
.coding-child-foot .mw-btn { height:26px; min-height:26px; padding:0 10px; font-size:12px; border:1px solid var(--line); }
.coding-child-result > summary { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:auto; max-width:100%; }

/* Integration: each child file as a folded diff; a conflict opens a three-way merge a person finishes. */
/* Reading diffs and finishing a merge needs room: the integration dialog is wide, and nothing in it widens it further. */
dialog.mw-dialog--form[data-coding-integration-dialog] { width:min(1040px,calc(100vw - 48px)); max-height:min(calc(100dvh - 48px),960px); }
dialog.mw-dialog--form[data-coding-integration-dialog] > .mw-form { max-height:min(calc(100dvh - 48px),960px); }
@media (max-width:760px), (pointer:coarse) {
  dialog.mw-dialog--form[data-coding-integration-dialog] { width:calc(100vw - 24px); max-height:calc(100dvh - 32px); }
  dialog.mw-dialog--form[data-coding-integration-dialog] > .mw-form { max-height:calc(100dvh - 32px); }
}
dialog[data-coding-integration-dialog] .mw-form__body { grid-template-columns:minmax(0,1fr); }
[data-coding-integration-files] > .coding-material > * { min-width:0; max-width:100%; }
.coding-integration-diff { margin-top:6px; }
.coding-integration-diff > summary { cursor:pointer; font-size:12px; color:var(--muted); }
.coding-integration-diff .diff .diff-rows { margin:6px 0 0; max-height:360px; font-size:12px; line-height:20px; }
.coding-integration-diff .diff .diff-rows li { grid-template-columns:5ch 5ch minmax(max-content,1fr); gap:0; }
.coding-integration-diff .diff .diff-rows li[hidden] { display:none; }
.coding-integration-diff .diff .diff-rows li.diff-fold { display:block; }
.coding-merge { display:grid; grid-template-columns:minmax(0,1fr); gap:6px; margin-top:8px; padding:10px; border:1px solid color-mix(in srgb,var(--amber) 40%,var(--line)); border-radius:10px; background:color-mix(in srgb,var(--amber) 5%,var(--paper)); }
.coding-merge > p { margin:0; font-size:12px; color:var(--muted); }
.coding-merge-editor { box-sizing:border-box; width:100%; max-width:100%; min-height:12rem; font:12px/1.6 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); white-space:pre; overflow:auto; resize:vertical; }
.coding-merge p[data-tone=attention] { color:var(--amber); }
.coding-merge p[data-tone=done] { color:var(--green); }
.coding-merge > .mw-btn { width:fit-content; }
.coding-merge-picks { display:grid; gap:4px; }
.coding-merge-pick { display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px; min-width:0; }
.coding-merge-pick > span { flex:1 1 180px; min-width:0; font-size:12px; color:var(--ink); }
.coding-merge-pick > .mw-btn { min-height:28px; padding:0 10px; font-size:12px; }
@media (max-width:760px) { .coding-merge-pick > span { flex-basis:100%; } }
.coding-child-error-code { display:block; margin-top:2px; font:11px/1.5 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace); color:var(--muted); overflow-wrap:anywhere; }
`;
