/**
 * The composer's bar under the box: the round's settings on the left, the usage meter and the main actions (pause, stop,
 * send) on the right. One row; the settings give way first (the model's name, then how a correction is handed over; the
 * way of working stays whole), so the main actions never wrap or move when a round starts or ends (VUX-16). A narrow
 * composer puts the settings on their own row, idle or running alike. Part of CODING_STYLES, in its place there.
 */
export const CODING_COMPOSER_BAR_STYLES = `
.coding-composer-shell { container:coding-composer / inline-size; }
.coding-composer-bar { display:flex; flex-wrap:nowrap; align-items:center; gap:4px; min-width:0; padding:4px 4px 0; }
.coding-composer-leading { display:flex; flex:1 16 auto; flex-wrap:nowrap; align-items:center; gap:4px; min-width:0; }
.coding-composer-trailing { display:flex; flex:0 1 auto; align-items:center; justify-content:flex-end; gap:4px; min-width:0; margin-left:auto; }
.coding-composer-trailing > :is(.coding-meter,button) { flex:none; }
.coding-composer-trailing > [data-coding-mode]:not([hidden]) { display:flex; min-width:0; }
@container coding-composer (max-width:480px) { .coding-composer-bar { flex-wrap:wrap; } .coding-composer-leading { flex-basis:100%; } }
/* Context and usage: a ring and a percentage beside send; the panel opens above the composer. */
.coding-meter { position:relative; flex:none; }
.coding-meter-toggle { display:inline-flex; align-items:center; gap:4px; height:28px; min-height:28px; padding:0 8px; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.coding-meter-ring { width:16px; height:16px; transform:rotate(-90deg); flex:none; }
.coding-meter-ring circle { fill:none; stroke-width:2.5; }
.coding-meter-ring circle:first-child { stroke:var(--line); }
.coding-meter-ring circle:last-child { stroke:var(--muted); stroke-linecap:round; stroke-dasharray:0 51; transition:stroke-dasharray 250ms var(--ease-quint); }
.coding-meter[data-tone=notice] .coding-meter-ring circle:last-child { stroke:var(--amber); }
.coding-meter[data-tone=attention] .coding-meter-toggle { color:var(--amber); }
.coding-meter[data-tone=attention] .coding-meter-ring circle:last-child { stroke:var(--amber); }
.coding-meter-panel { position:absolute; right:0; bottom:calc(100% + 8px); z-index:30; width:min(340px,calc(100vw - 32px)); max-height:min(70vh,520px); overflow:auto; display:grid; gap:16px; padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--paper); box-shadow:var(--lift-1); font-size:13px; }
.coding-meter-panel section { display:grid; gap:8px; }
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
.coding-meter-budget { display:flex; align-items:center; gap:8px; }
.coding-meter-budget .mw-input { width:7rem; }
@media (max-width:640px) { .coding-meter-panel { position:fixed; left:16px; right:16px; bottom:96px; width:auto; } }
.coding-composer-context { display:flex; align-items:center; gap:0; min-width:0; }
.coding-composer-context [data-slot=button-label] { display:none; }
.coding-composer-context .mw-btn { position:relative; width:28px; min-width:28px; padding:0; color:var(--muted); }
.coding-composer-bar .mw-select-picker { width:auto; flex:0 1 auto; min-width:3rem; }
.coding-composer-bar .mw-select-picker:has([data-coding-intent]) { max-width:7.5rem; flex-shrink:0; }
.coding-composer-bar .mw-select-picker:has([data-coding-model]) { max-width:14rem; flex-shrink:16; }
.coding-composer-bar .mw-select-picker__trigger {
  width:auto; max-width:100%; height:28px; min-height:28px; padding:0 24px 0 8px;
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
.coding-composer-bar :is([data-coding-pause], [data-coding-stop]) { height:28px; min-height:28px; padding:0 8px; font-size:12px; }
.coding-composer-bar [data-coding-send] { flex:none; height:28px; min-height:28px; padding-inline:12px; }
`;
