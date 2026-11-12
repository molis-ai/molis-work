/**
 * The line under the composer (the platform's composer draws its own bar, unified-input-voice K4): the note saying what the round
 * on show really uses, and the context and usage meter, a ring and a percentage whose panel opens above it. Part of CODING_STYLES,
 * in its place there.
 */
export const CODING_FOOTNOTE_STYLES = `
/* A ring and a percentage under the composer; the panel opens above it. */
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
.coding-model-note { margin-left:8px; color:var(--muted); overflow-wrap:anywhere; }
`;
