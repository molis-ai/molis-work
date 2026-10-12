/** Composition only: every colour, corner, lift and duration is a product token (DESIGN.md). */
export const frameStyles = `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; }
body { margin: 0; overflow: hidden; display: grid; grid-template-rows: 44px auto minmax(0, 1fr); background: var(--desk); color: var(--ink);
  font-family: var(--font); font-size: 13px; line-height: 1.5; letter-spacing: -.011em; }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; } button:disabled { cursor: not-allowed; }
svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
h1, h2, h3, h4, h5, p, ul, ol, dl, dd { margin: 0; } ul, ol { padding: 0; list-style: none; }
:where(button, summary, a, [tabindex], input, textarea):focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
code { font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.pv-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px 0 18px; min-width: 0; }
.pv-brand { display: flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; }
.pv-caption { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); font-size: 12px; padding-left: 10px; box-shadow: inset 1px 0 0 var(--line-strong); }
/* The statement that this is not a real run is always on the page, at every width, and wraps instead of being cut. */
.pv-notice { padding: 0 18px 8px; color: var(--muted); font-size: 11.5px; line-height: 1.45; }
.pv-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }
.pv-tools { display: flex; align-items: center; gap: 6px; flex: none; }
.pv-switch { display: flex; gap: 2px; padding: 3px; border-radius: var(--r-control); background: var(--control-fill); }
.pv-switch .mw-btn { min-height: 26px; padding: 0 10px; font-size: 12px; }
.pv-switch .mw-btn[aria-pressed="true"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
.pv-demo { position: relative; }
.pv-popover { position: absolute; z-index: 60; top: calc(100% + 6px); right: 0; width: 360px; max-height: calc(100vh - 70px); overflow: auto; padding: 12px; border-radius: var(--r-card);
  background: var(--popover, var(--paper)); box-shadow: var(--lift-3); }
.pv-popover h4 { margin: 10px 2px 6px; color: var(--faint); font-size: 11px; font-weight: 500; } .pv-popover h4:first-child { margin-top: 2px; }
.pv-scenes li { display: grid; gap: 1px; margin-bottom: 4px; } .pv-scenes small { padding: 0 10px; color: var(--muted); font-size: 11px; }
.pv-scenes .mw-btn { justify-content: flex-start; width: 100%; }
.pv-checkpoints, .pv-playback { display: flex; flex-wrap: wrap; gap: 4px; }
.pv-meta { margin-top: 10px; color: var(--muted); font-size: 11px; }

.pv-stage { position: relative; min-height: 0; }
.scene { position: absolute; inset: 0; }
.pv-sheet { position: absolute; inset: 0 14px 14px; overflow: hidden; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow); }
.pv-goal { padding: 32px max(32px, calc((100% - 960px) / 2)); color: var(--ink-soft); }
.pv-location { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.pv-goal h1 { margin: 14px 0 4px; color: var(--ink); font-size: 24px; letter-spacing: -.02em; }
.pv-lede { max-width: 60ch; margin-bottom: 24px; }
.pv-rows { display: grid; max-width: 620px; } .pv-rows li { display: flex; align-items: center; gap: 10px; min-height: 40px; box-shadow: inset 0 -1px 0 var(--line); } .pv-rows li span { margin-left: auto; color: var(--faint); font-size: 12px; }
.pv-decor-note { margin-top: 16px; color: var(--faint); font-size: 12px; }
.pv-goal::after { content: ""; position: absolute; inset: 0; background: var(--scrim); pointer-events: none; }

/* The conversation panel: the Assistant rises over the work; Coding keeps it in the middle column. */
.rc-panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--paper); }
.rc-panel--assistant { position: absolute; z-index: 5; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(680px, calc(100% - 28px)); height: min(calc(100% - 28px), 780px);
  border-radius: var(--r-sheet); box-shadow: var(--lift-3); overflow: hidden; }
.cd-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; }
.cd-directory, .cd-review { padding: 14px; overflow: auto; background: var(--rail); } .cd-directory { box-shadow: inset -1px 0 0 var(--line); } .cd-review { box-shadow: inset 1px 0 0 var(--line); }
.cd-head { margin-bottom: 8px; color: var(--faint); font-size: 11px; font-weight: 500; }
.cd-directory li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--r-control); color: var(--ink-soft); } .cd-directory li[aria-current="true"] { background: var(--nav-active); color: var(--ink); }
.cd-empty { color: var(--muted); font-size: 12px; }
.rc-panel-head { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; box-shadow: inset 0 -1px 0 var(--line); }
.rc-panel-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--weight-title, 600); }
.rc-state { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
.rc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex: none; } .rc-dot[data-state="run"] { background: var(--accent); } .rc-dot[data-state="wait"] { background: var(--amber); } .rc-dot[data-state="done"] { background: var(--green); }

.rc-thread { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; overflow-anchor: auto; }
.rc-turn { display: flex; } .rc-turn--you { justify-content: flex-end; }
.rc-bubble { max-width: min(88%, 520px); padding: 8px 12px; border-radius: var(--r-card); background: var(--control-fill); }
.rc-bubble--ai { background: transparent; padding-left: 0; max-width: 100%; } .rc-bubble--task { background: var(--accent-soft); }
.rc-bubble header { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; color: var(--faint); font-size: 11px; } .rc-bubble header time { margin-left: auto; }
.rc-bubble p { overflow-wrap: anywhere; } .rc-bubble.is-withdrawn p { color: var(--faint); text-decoration: line-through; }
.rc-num { color: var(--accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.rc-tag { padding: 0 6px; border-radius: 999px; background: var(--control-fill-hover); color: var(--muted); font-size: 10.5px; } .rc-tag[data-tone="muted"] { color: var(--faint); }

.rc-input { display: grid; justify-items: end; gap: 4px; }
.rc-input > .rc-bubble { background: var(--accent-soft); }
.rc-bar { display: grid; justify-items: end; max-width: 100%; }
.rc-status { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 24px; padding: 2px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: 12px; text-align: left; }
.rc-status:hover { background: var(--nav-hover); }
.rc-status-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.rc-status svg { width: 14px; height: 14px; }
.rc-bar[data-tone="ok"] .rc-status { color: var(--green); } .rc-bar[data-tone="attn"] .rc-status { color: var(--amber); } .rc-bar[data-tone="warn"] .rc-status { color: var(--red); } .rc-bar[data-tone="muted"] .rc-status { color: var(--faint); }
.rc-yours { display: flex; align-items: center; gap: 6px; padding: 0 8px; color: var(--accent-strong); font-size: 12px; } .rc-yours em { color: var(--faint); font-style: normal; font-size: 11px; }
.rc-detail { justify-self: stretch; padding: 12px; border-radius: var(--r-card); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 10px; }
.rc-four { display: grid; gap: 8px; } .rc-four > div { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; }
.rc-four dt { color: var(--faint); font-size: 11.5px; padding-top: 1px; } .rc-four dd { overflow-wrap: anywhere; } .rc-four small { display: block; color: var(--muted); font-size: 12px; }
.rc-evidence h5 { margin-bottom: 4px; color: var(--faint); font-size: 11px; font-weight: 500; } .rc-evidence ol { display: grid; gap: 3px; font-size: 12px; color: var(--ink-soft); }
.rc-evidence li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; align-items: baseline; }
.rc-src { padding: 0 6px; border-radius: 4px; background: var(--control-fill-hover); color: var(--muted); font-size: 10.5px; white-space: nowrap; }
.rc-evidence li[data-source="molis"] .rc-src { background: var(--amber-soft); color: var(--amber); }
.rc-actions, .rc-end-actions, .rc-correct-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rc-cannot { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.rc-note { color: var(--muted); font-size: 12px; }
.rc-correct { display: grid; gap: 8px; padding-top: 8px; box-shadow: inset 0 1px 0 var(--line); }
.rc-correct-kinds { display: flex; gap: 4px; flex-wrap: wrap; } .rc-correct-kinds .mw-btn[aria-pressed="true"] { background: var(--paper); box-shadow: var(--lift-1); }
.rc-choices { display: flex; flex-wrap: wrap; gap: 4px 12px; border: 0; padding: 0; margin: 0; } .rc-choices legend { padding: 0; margin-bottom: 2px; color: var(--faint); font-size: 11px; }
.rc-choices label { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; }
.rc-field { display: grid; gap: 3px; color: var(--muted); font-size: 12px; } .rc-field textarea { padding: 6px 8px; border: 0; border-radius: var(--r-control); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line-strong); resize: vertical; }

.rc-host { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--r-control); background: var(--wash); color: var(--muted); font-size: 12px; } .rc-host time { margin-left: auto; color: var(--faint); }
.rc-call { display: flex; align-items: flex-start; gap: 6px; color: var(--muted); font-size: 12px; } .rc-call small { display: block; color: var(--faint); }
.rc-divider { display: flex; align-items: center; gap: 8px; color: var(--faint); font-size: 11px; } .rc-divider::before, .rc-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.rc-question { padding: 12px; border-radius: var(--r-card); background: var(--amber-soft); display: grid; gap: 6px; } .rc-question h4 { display: flex; gap: 6px; align-items: center; }
.rc-options { display: flex; gap: 6px; flex-wrap: wrap; }
.rc-end, .rc-banner { padding: 12px; border-radius: var(--r-card); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 8px; }
.rc-banner { background: var(--red-soft); box-shadow: none; } .rc-end h4, .rc-banner h4 { display: flex; align-items: center; gap: 6px; }
.rc-end ul, .rc-banner ul { display: grid; gap: 4px; } .rc-end li, .rc-banner li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: baseline; }
.rc-end li b, .rc-banner li b { color: var(--accent); } .rc-end li em, .rc-banner li em { color: var(--muted); font-style: normal; font-size: 12px; }
.rc-end li[data-tone="ok"] em { color: var(--green); } .rc-end li[data-tone="attn"] em { color: var(--amber); } .rc-end li[data-tone="warn"] em { color: var(--red); }
.rc-end-queue { display: flex; gap: 6px; align-items: center; color: var(--amber); }

.rc-foot { position: relative; display: grid; gap: 8px; padding: 8px 16px 14px; box-shadow: inset 0 1px 0 var(--line); }
.rc-tray { position: relative; } .rc-tray-empty { display: flex; align-items: center; gap: 6px; color: var(--faint); font-size: 12px; }
.rc-tray-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 0; border-radius: 999px; background: var(--amber-soft); color: var(--amber); font-size: 12px; }
.rc-tray-list { position: absolute; z-index: 20; left: 0; right: 0; bottom: calc(100% + 6px); max-height: min(50vh, 360px); overflow: auto; padding: 10px; border-radius: var(--r-card); background: var(--popover, var(--paper)); box-shadow: var(--lift-3); display: grid; gap: 8px; }
.rc-tray-list h5 { color: var(--faint); font-size: 11px; font-weight: 500; } .rc-tray-list h5 span { margin-left: 4px; color: var(--muted); }
.rc-tray-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; width: 100%; padding: 4px 6px; border: 0; border-radius: var(--r-control); background: transparent; text-align: left; } .rc-tray-item:hover { background: var(--nav-hover); }
.rc-tray-item b { color: var(--accent); } .rc-tray-item small { grid-column: 2; color: var(--muted); font-size: 11.5px; }
.rc-chip { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; } .rc-chip small { color: var(--muted); font-size: 11.5px; }
.rc-chip .mw-btn[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-strong); }
.rc-pill { position: relative; display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 6px; border-radius: var(--r-composer); background: var(--paper); box-shadow: var(--lift-2), inset 0 0 0 1px var(--line); }
.rc-mode { position: relative; } .rc-input-field { flex: 1; min-width: 0; min-height: 34px; padding: 0 6px; border: 0; background: transparent; outline-offset: 2px; }
.rc-menu { position: absolute; z-index: 30; left: 0; bottom: calc(100% + 8px); width: 280px; padding: 6px; border-radius: var(--r-card); background: var(--popover, var(--paper)); box-shadow: var(--lift-3); display: grid; gap: 2px; }
.rc-menu-item { display: grid; gap: 1px; padding: 6px 8px; border: 0; border-radius: var(--r-control); background: transparent; text-align: left; } .rc-menu-item:hover:not(:disabled) { background: var(--nav-hover); }
.rc-menu-item[aria-checked="true"] b::after { content: " ✓"; color: var(--accent); } .rc-menu-item small { color: var(--muted); font-size: 11.5px; } .rc-menu-item:disabled { opacity: .55; }
.rc-hint { color: var(--faint); font-size: 11.5px; }

@media (prefers-reduced-motion: no-preference) {
  .rc-detail, .rc-tray-list, .rc-menu, .pv-popover { animation: rc-grow var(--dur-move) var(--ease-quint); transform-origin: bottom left; }
  .rc-input.is-new { animation: rc-in var(--dur-arrive) var(--ease-quint); }
  @keyframes rc-grow { from { opacity: 0; transform: translateY(4px) scale(.98); } }
  @keyframes rc-in { from { opacity: 0; transform: translateY(6px); } }
}
@media (max-width: 1180px) { .cd-layout { grid-template-columns: 200px minmax(0, 1fr); } .cd-review { display: none; } }
@media (max-width: 860px) { .cd-layout { grid-template-columns: minmax(0, 1fr); } .cd-directory { display: none; } }
@media (max-width: 520px) {
  body { grid-template-rows: 52px auto minmax(0, 1fr); } .pv-switch .mw-btn { min-height: 44px; }
  .pv-titlebar { padding: 0 8px 0 12px; } .pv-brand strong, .pv-caption { display: none; } .pv-notice { padding: 0 12px 6px; } .pv-tools { margin-left: auto; }
  .pv-sheet { inset: 0 6px 6px; } .rc-panel--assistant { width: calc(100% - 12px); height: calc(100% - 12px); bottom: 6px; }
  .rc-thread { padding: 10px 10px; } .rc-foot { padding: 8px 10px 10px; } .rc-four > div { grid-template-columns: 1fr; gap: 0; }
  .mw-btn--sm, .rc-status, .rc-tray-toggle, .rc-menu-item, .rc-tray-item { min-height: 44px; } .rc-input-field { min-height: 44px; }
  .pv-popover { position: fixed; top: 48px; left: 8px; right: 8px; width: auto; }
}
`;
