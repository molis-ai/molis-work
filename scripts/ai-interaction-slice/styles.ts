/**
 * The frame: desk, titlebar, one work sheet and the resident bar, with the product's measures (DESIGN.md Layout,
 * The bottom bar; the Assistant panel's geometry follows craft-finish's `.assistant-panel`). Composition only: every
 * colour, corner, lift and duration is a product token.
 */
export const frameStyles = `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; }
body {
  margin: 0; overflow: hidden; display: grid; grid-template-rows: 44px minmax(0, 1fr);
  background: var(--desk); color: var(--ink); font-family: var(--font); font-size: 13px; line-height: 1.5; letter-spacing: -.011em;
  --dock-h: 76px; --side-w: 272px; --step-h: 50px;
}
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; }
svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
h1, h2, h3, h4, h5, p, ul, dl { margin: 0; }
ul { padding: 0; list-style: none; }
:where(button, summary, a, [tabindex]):focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }

/* Titlebar: the brand, what this page is, and the demo's own switches. */
.pv-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px 0 18px; min-width: 0; }
.pv-brand { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--ink); white-space: nowrap; }
.pv-brand strong { font-size: 13px; font-weight: var(--weight-title, 600); }
.pv-caption { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); font-size: 12px; padding-left: 10px; box-shadow: inset 1px 0 0 var(--line-strong); }
.pv-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }
.pv-tools { display: flex; align-items: center; gap: 6px; flex: none; }
.pv-switch { display: flex; gap: 2px; padding: 3px; border-radius: var(--r-control); background: var(--control-fill); }
.pv-switch .mw-btn { min-height: 26px; padding: 0 10px; font-size: 12px; }
.pv-switch .mw-btn[aria-pressed="true"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
.demo-controls { position: relative; }
.demo-controls > summary { list-style: none; gap: 6px; }
.demo-controls > summary::-webkit-details-marker { display: none; }
.demo-controls[open] > summary { background: var(--nav-active); color: var(--ink); }
.demo-popover {
  position: absolute; z-index: 60; top: calc(100% + 6px); right: 0; width: 336px; padding: 12px;
  border-radius: var(--r-card); background: var(--popover); box-shadow: var(--lift-3);
  transform-origin: top right; animation: pv-grow var(--dur-move) var(--ease-quint);
}
.demo-title { margin: 2px 2px 8px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); }
.demo-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.demo-mode { margin: 0 2px; color: var(--muted); font-size: 12px; }

/* Stage: the scene in view owns the whole area under the titlebar; nothing scrolls the page. */
.pv-stage { position: relative; min-height: 0; }
.scene { position: absolute; inset: 0; display: grid; grid-template-rows: minmax(0, 1fr) var(--dock-h); }
.pv-sheet { margin: 0 14px; min-height: 0; overflow: hidden; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow); }

/* The Goal page behind the Assistant: real-looking, inert, so the panel's reach over the work can be judged. */
.pv-goal { padding: 32px max(32px, calc((100% - 960px) / 2)); color: var(--ink-soft); }
.pv-location { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.pv-location svg { width: 14px; height: 14px; }
.pv-goal h1 { margin: 14px 0 4px; color: var(--ink); font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; }
.pv-lede { max-width: 60ch; }
.pv-goal-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 12px 0 28px; color: var(--muted); font-size: 12px; }
.pv-status { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); }
.pv-status svg { width: 12px; height: 12px; }
.pv-goal h2 { margin-bottom: 6px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); }
.pv-rows { display: grid; max-width: 620px; }
.pv-rows li { display: flex; align-items: center; gap: 10px; min-height: 40px; box-shadow: inset 0 -1px 0 var(--line); }
.pv-rows li span { margin-left: auto; color: var(--faint); font-size: 12px; }
.pv-decor-note { margin-top: 16px; color: var(--faint); font-size: 12px; }

/* The resident bar: trays at the sides, the composer in the middle (DESIGN.md "The bottom bar"). */
.pv-bar { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(280px, 600px) minmax(150px, 1fr); align-items: center; gap: 12px; padding: 0 14px; min-width: 0; }
.pv-tray { display: flex; align-items: center; gap: 2px; justify-self: start; height: 50px; padding: 6px; border-radius: var(--r-composer);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent); }
.pv-tray--own { justify-self: end; }
.pv-tile { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: var(--ink-soft); }
.pv-tile:nth-child(3) { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
.pv-monogram { display: inline-grid; place-items: center; width: 38px; height: 38px; margin-left: 4px; border-radius: 50%; background: var(--action); color: var(--action-ink); font-size: 13px; font-weight: var(--weight-control, 500); }
.pv-center { position: relative; min-width: 0; }
.pv-composer-row { display: flex; align-items: flex-end; gap: 8px; min-width: 0; }
.pv-pill {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 50px; padding: 0 8px 0 10px;
  border-radius: var(--r-composer); background: var(--paper); box-shadow: var(--lift-2);
  transition: box-shadow var(--dur-move) var(--ease-quint);
}
.pv-pill:focus-within { box-shadow: var(--lift-2), 0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent); }
.pv-pill--idle { justify-content: center; color: var(--faint); font-size: 12px; }
.pv-input { flex: 1; min-width: 0; height: 100%; padding: 0 4px; border: 0; outline: 0; background: transparent; font-size: 13px; }
.pv-input::placeholder, .cd-input::placeholder { color: var(--muted); }
.pv-target { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 0; border-radius: var(--r-control); background: var(--control-fill); font-size: 12px; font-weight: var(--weight-control, 500); white-space: nowrap; }
.pv-target:hover { background: var(--nav-hover); }

/* The Assistant panel rises from the composer: 16px corners, lift 3, a tab strip on the desk tone. */
.ap-panel {
  position: absolute; z-index: 50; left: -40px; right: -40px; bottom: calc(100% + 8px); display: flex; flex-direction: column; overflow: hidden;
  height: min(620px, calc(100dvh - 44px - var(--dock-h) - 32px)); border-radius: var(--r-dialog); background: var(--popover); box-shadow: var(--lift-3);
  transform-origin: bottom center; animation: pv-rise var(--dur-move) var(--ease-quint) both;
}
.scene[data-panel="closed"] .ap-panel { display: none; }
.ap-tabbar { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; height: 42px; padding: 6px 6px 0 8px; background: var(--desk); box-shadow: inset 0 -1px 0 var(--line); }
.ap-tab { display: flex; align-items: center; gap: 6px; width: 200px; height: 34px; padding: 0 12px; border-radius: 9px 9px 0 0; background: var(--popover); box-shadow: 0 0 0 1px var(--line); clip-path: inset(-1px -1px 0 -1px); font-size: 12px; font-weight: var(--weight-control, 500); }
.ap-tab-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-mark { flex: none; width: 7px; height: 7px; border-radius: 50%; background: transparent; }
:is(.ap-mark, .pv-target-mark)[data-mark="waiting"] { background: var(--amber); }
:is(.ap-mark, .pv-target-mark)[data-mark="failed"] { background: var(--red); }
:is(.ap-mark, .pv-target-mark)[data-mark="done"] { background: var(--green); }
:is(.ap-mark, .pv-target-mark)[data-mark="running"] { width: 9px; height: 9px; border: 1.5px solid var(--green); border-right-color: transparent; animation: mw-spin 640ms var(--ease-quint) infinite; }
.pv-target-mark { width: 7px; height: 7px; border-radius: 50%; }
.ap-minimise { align-self: center; }
.ap-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.ap-side { display: none; }
.ap-main { position: relative; min-height: 0; display: flex; flex-direction: column; }
.ap-notice { flex: none; min-height: 30px; padding: 6px 16px; color: var(--muted); font-size: 12px; box-shadow: inset 0 1px 0 var(--line); }
.ap-notice:empty { display: none; }
@media (min-width: 1240px) {
  .ap-panel { left: calc(-1 * var(--side-w) - 24px); right: -24px; }
  .ap-body { grid-template-columns: var(--side-w) minmax(0, 1fr); }
  .ap-side { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; padding: 14px 12px 16px 14px; box-shadow: inset -1px 0 0 var(--line); font-size: 12px; }
}
.ap-summary { display: grid; gap: 2px; padding: 12px; border-radius: var(--r-card); background: var(--rail); transition: background-color var(--dur-move) var(--ease-quint); }
.ap-summary[data-tone="waiting"] { background: color-mix(in srgb, var(--amber) 11%, var(--popover)); }
.ap-summary[data-tone="done"] { background: color-mix(in srgb, var(--green) 9%, var(--popover)); }
.ap-summary[data-tone="failed"] { background: color-mix(in srgb, var(--red) 9%, var(--popover)); }
.ap-state { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px 1px 7px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 11px; line-height: 18px; }
.ap-state::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
.ap-summary[data-tone="waiting"] .ap-state::before { background: var(--amber); }
.ap-summary[data-tone="running"] .ap-state::before { background: var(--accent); }
.ap-summary[data-tone="done"] .ap-state::before { background: var(--green); }
.ap-summary[data-tone="failed"] .ap-state::before { background: var(--red); }
.ap-title { margin-top: 6px; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); line-height: 1.4; }
.ap-now { color: var(--ink-soft); }
.ap-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 10px; margin-top: 10px; }
.ap-meta dt { color: var(--muted); }
.ap-meta dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.ap-block h4 { padding-top: 12px; margin-bottom: 6px; box-shadow: inset 0 1px 0 var(--line); font-size: 12px; font-weight: var(--weight-title, 600); }
.ap-materials { display: grid; gap: 4px; }
.ap-materials li { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 8px; border-radius: var(--r-control); background: var(--rail); color: var(--ink); animation: pv-arrive var(--dur-move) var(--ease-quint); }
.ap-materials svg { width: 14px; height: 14px; color: var(--ink-soft); }
.ap-empty { color: var(--faint); }

/* Coding: directory · dialogue · results and review, inside the one sheet. */
.cd-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 360px; }
.cd-layout[data-tools="closed"] { grid-template-columns: 220px minmax(0, 1fr); }
.cd-layout[data-tools="closed"] .cd-tools { display: none; }
.cd-directory { min-height: 0; overflow: auto; padding: 16px 8px; background: var(--surface-soft); }
.cd-dir-head { margin: 0 8px 8px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); }
.cd-session { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 8px; padding: 6px 10px; border-radius: var(--r-row); color: var(--ink-soft); }
.cd-session[aria-current] { background: var(--nav-active); color: var(--ink); }
.cd-session-title { grid-column: 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--weight-control, 500); }
.cd-session-meta { grid-column: 2; color: var(--faint); font-size: 12px; }
.cd-dialogue { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; }
.cd-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px 12px; box-shadow: inset 0 -1px 0 var(--line); }
.cd-head h2 { font-size: 15px; font-weight: var(--weight-title, 600); }
.cd-chip { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.cd-chip svg { width: 12px; height: 12px; }
.cd-layout[data-tools="open"] .cd-tools-toggle { background: var(--nav-active); color: var(--ink); }
.cd-main { position: relative; min-height: 0; display: flex; flex-direction: column; }
.cd-notice { min-height: 0; padding: 0 24px 6px; color: var(--muted); font-size: 12px; }
.cd-notice:empty { display: none; }
.cd-composer-row { padding: 0 20px 16px; --step-h: 40px; }
.cd-shell { flex: 1; min-width: 0; display: grid; gap: 6px; padding: 10px 10px 8px 14px; border-radius: var(--r-composer); background: var(--paper); box-shadow: var(--lift-2); }
.cd-shell:focus-within { box-shadow: var(--lift-2), 0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent); }
.cd-input { width: 100%; min-height: 40px; padding: 0; border: 0; outline: 0; resize: none; background: transparent; line-height: 1.5; }
.cd-shell-bar { display: flex; align-items: center; gap: 6px; }
.cd-tag { padding: 2px 8px; border-radius: var(--r-tag); background: var(--control-fill); color: var(--ink-soft); font-size: 12px; }
.cd-tag + .cd-tag { margin-right: auto; }
.cd-keys { color: var(--faint); font-size: 11px; }
.cd-tools { min-height: 0; overflow: auto; padding: 14px 16px; box-shadow: inset 1px 0 0 var(--line); background: var(--paper); }
.cd-tools-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cd-tools-head h3 { font-size: 13px; font-weight: var(--weight-title, 600); }
.cd-tools-close { margin-left: auto; }
.cd-tabs { display: flex; gap: 14px; margin-bottom: 12px; color: var(--muted); font-size: 12px; box-shadow: inset 0 -1px 0 var(--line); }
.cd-tabs span { padding-bottom: 6px; }
.cd-tabs [aria-current] { color: var(--ink); font-weight: var(--weight-control, 500); box-shadow: inset 0 -2px 0 var(--ink); }
.cd-file { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 12px; }
.cd-diffstat { margin-left: auto; color: var(--muted); }
.cd-diff { margin: 8px 0 10px; padding: 10px 0; overflow-x: auto; border-radius: var(--r-control); background: var(--surface-soft); font: 12px/1.9 var(--font-mono, monospace); }
.cd-diff code { display: block; min-width: max-content; white-space: pre; }
.cd-line { display: block; padding-right: 12px; }
.cd-ln { display: inline-block; width: 34px; padding-right: 10px; color: var(--faint); text-align: right; user-select: none; }
.cd-add { background: var(--green-soft); }
.cd-del { background: var(--red-soft); color: var(--ink-soft); }
.cd-tools[data-landed] { animation: pv-arrive var(--dur-arrive) var(--ease-quint); }

@keyframes pv-rise { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes pv-grow { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes pv-arrive { from { opacity: .4; transform: translateY(7px); } to { opacity: 1; transform: none; } }

@media (max-width: 1280px) {
  .cd-layout[data-tools="open"] { grid-template-columns: 220px minmax(0, 1fr); }
  .cd-layout[data-tools="open"] .cd-tools { position: absolute; z-index: 30; top: 0; right: 0; bottom: 0; width: min(380px, 92%); border-radius: 0 var(--r-sheet) var(--r-sheet) 0; box-shadow: var(--lift-3); animation: pv-slide var(--dur-move) var(--ease-quint); }
  .scene--coding .pv-sheet { position: relative; }
}
@keyframes pv-slide { from { transform: translateX(16px); opacity: .6; } to { transform: none; opacity: 1; } }
@media (max-width: 1100px) {
  .cd-layout, .cd-layout[data-tools] { grid-template-columns: minmax(0, 1fr); }
  .cd-directory { display: none; }
  .pv-bar { grid-template-columns: auto minmax(0, 1fr) auto; }
  .pv-tray .pv-tile:nth-child(n + 4) { display: none; }
}
@media (max-width: 900px) {
  .pv-caption-more { display: none; }
}
/* Phones: the bar takes two rows (the composer first), the panel stands above it full-width, steps go above the input. */
@media (max-width: 600px) {
  body { --dock-h: 116px; grid-template-rows: 52px minmax(0, 1fr); }
  .pv-titlebar { padding: 0 8px 0 12px; }
  .pv-caption, .pv-brand strong, .pv-theme [data-slot="button-label"], .demo-controls > summary > span { display: none; }
  .pv-tools { gap: 4px; }
  .demo-controls > summary { width: 44px; padding: 0; }
  .pv-theme { width: 44px; padding: 0; }
  .pv-sheet { margin: 0; border-radius: 0; }
  .pv-goal { padding: 20px 16px; }
  .pv-bar { grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 50px 44px; gap: 8px 4px; padding: 8px 8px; align-content: center; }
  .pv-center { grid-column: 1 / -1; grid-row: 1; }
  .pv-tray { grid-row: 2; height: 44px; padding: 0; background: none; box-shadow: none; }
  .pv-tile, .pv-monogram { width: 44px; height: 44px; }
  .ap-panel { position: fixed; left: 8px; right: 8px; top: 60px; bottom: calc(var(--dock-h) + 8px + var(--steps-room, 0px)); height: auto; }
  .scene--assistant:has([data-next]:not([hidden])) { --steps-room: 52px; }
  .scene--assistant .ix-steps { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); justify-content: flex-start; }
  .pv-input { font-size: 16px; }
  .demo-popover { position: fixed; top: 56px; left: 8px; right: 8px; width: auto; }
  .cd-head { padding: 10px 12px 10px 16px; }
  .cd-tools-toggle [data-slot="button-label"] { display: none; }
  .cd-composer-row { flex-direction: column; align-items: stretch; padding: 0 8px 8px; --step-h: 44px; }
  .cd-input { font-size: 16px; }
  .cd-keys { display: none; }
  .cd-layout[data-tools="open"] .cd-tools { width: 100%; border-radius: 0; }
}
@media (max-width: 600px), (pointer: coarse) {
  .scene .mw-btn, .pv-tools .mw-btn, .demo-controls > summary, .pv-switch .mw-btn { min-height: 44px; }
  .scene .mw-btn--icon-only { width: 44px; min-width: 44px; }
  .pv-target { height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
