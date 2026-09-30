/**
 * Slice styles. Tokens only (colour, radius, duration, easing) so the look follows craft-finish; sizes stay on the
 * type scale (11/12/13/15/17/20/24/30) and nothing transitions layout properties (tests/soft-workbench-refinement).
 */
export const SLICE_STYLES = `
body.cx-slice { margin: 0; min-height: 100vh; background: var(--desk); color: var(--ink); overflow: hidden; }
.cx-banner { position: fixed; inset: 0 0 auto 0; z-index: 40; display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 12px;
  font-size: 12px; color: var(--muted); background: var(--paper); border-bottom: 1px solid var(--line); }
.cx-banner strong { color: var(--ink); font-weight: 600; }
.cx-banner .cx-dev-toggle { margin-left: auto; font-size: 12px; min-height: 24px; padding: 0 8px; }
.cx-main { position: fixed; inset: 32px 0 var(--dock-h, 48px) 0; display: grid; grid-template-columns: 240px minmax(0, 1fr); background: var(--desk); }
.cx-docs { border-right: 1px solid var(--line); background: var(--paper); overflow: auto; padding: 12px 8px; }
.cx-docs header { display: flex; align-items: baseline; justify-content: space-between; padding: 0 8px 8px; font-size: 13px; }
.cx-hint { font-size: 11px; color: var(--faint); }
.cx-doc-row { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: inherit;
  text-align: left; cursor: pointer; font: inherit; font-size: 13px; transition: background var(--dur-hover) var(--ease-quint); }
.cx-doc-row:hover { background: var(--nav-hover); }
.cx-doc-row[aria-current="page"] { background: var(--nav-active); }
.cx-doc-row[aria-selected="true"] { box-shadow: inset 0 0 0 1px var(--accent); }
.cx-doc-row small { font-size: 11px; color: var(--muted); }
.cx-doc-row:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
.cx-stage { overflow: auto; padding: 24px 48px 96px; }
.cx-doc-head { max-width: 760px; margin: 0 auto 8px; display: flex; align-items: baseline; gap: 12px; }
.cx-doc-head h1 { margin: 0; font-size: 24px; font-weight: 600; }
.cx-doc-meta { font-size: 12px; color: var(--muted); }
.cx-editor-wrap { max-width: 760px; margin: 0 auto; }
.pages-focus-frozen { background: color-mix(in srgb, var(--accent) 16%, transparent); border-radius: 2px; box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 55%, transparent); }
.pages-focus-compare { background: color-mix(in srgb, var(--hue-green-fill, var(--accent)) 30%, transparent); border-radius: 2px; }
.cx-flash { animation: cx-flash var(--dur-arrive) var(--ease-quint) 2; }
@keyframes cx-flash { 50% { background: color-mix(in srgb, var(--accent) 28%, transparent); } }

/* ---- the context action row, above the Assistant input (spec §6.3) ---- */
/* Stacking: the editor's own format bar < the Assistant panel < the bar and its menus (to agree with the bar owner in P1). */
.cx-slice .pages-format-bar { z-index: 34; }
/* The bar and its menus sit above the Assistant panel that grows out of it. */
.cx-bar-wrap { position: fixed; inset: auto 0 0 0; z-index: 38; }
.cx-actions { position: absolute; left: 50%; bottom: calc(100% + 8px); translate: -50% 0; display: flex; align-items: center; gap: 6px; max-width: min(760px, calc(100vw - 24px));
  height: 36px; padding: 4px 6px; border-radius: 12px; background: var(--paper); box-shadow: var(--lift-2); border: 1px solid var(--line);
  opacity: 1; transition: opacity var(--dur-move) var(--ease-quint); }
.cx-actions[data-state="idle"] { opacity: 0; pointer-events: none; }
.cx-scope { display: inline-flex; align-items: center; gap: 4px; max-width: 200px; height: 28px; padding: 0 6px 0 8px; border-radius: 8px; font-size: 12px; color: var(--muted);
  background: var(--surface-soft); white-space: nowrap; overflow: hidden; }
.cx-scope span { overflow: hidden; text-overflow: ellipsis; }
.cx-scope button { border: 0; background: transparent; color: var(--faint); cursor: pointer; padding: 0 2px; font: inherit; }
.cx-scope button:hover { color: var(--ink); }
.cx-act { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: transparent;
  color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; transition: background var(--dur-hover) var(--ease-quint), opacity var(--dur-move) var(--ease-quint); }
.cx-act:hover { background: var(--nav-hover); }
.cx-act:active { background: var(--nav-active); }
.cx-act:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
.cx-act[data-emphasis="true"] { background: var(--action); color: var(--action-ink); }
.cx-act[data-emphasis="true"]:hover { background: var(--action); opacity: 0.92; }
.cx-act[data-arriving="true"] { animation: cx-arrive var(--dur-move) var(--ease-quint); }
@keyframes cx-arrive { from { opacity: 0.35; } }
.cx-act .cx-kind { font-size: 11px; color: var(--muted); }
.cx-act[data-emphasis="true"] .cx-kind { color: inherit; opacity: 0.75; }
.cx-more-wrap { position: relative; }
.cx-menu { position: absolute; bottom: calc(100% + 8px); right: 0; min-width: 260px; max-height: min(420px, 60vh); overflow: auto; padding: 6px; border-radius: 12px;
  background: var(--paper); box-shadow: var(--lift-3); border: 1px solid var(--line); z-index: 5; }
.cx-menu h4 { margin: 8px 8px 4px; font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: 0.02em; }
.cx-menu button { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: 12px; padding: 6px 8px; border: 0; border-radius: 8px;
  background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.cx-menu button:hover, .cx-menu button:focus-visible { background: var(--nav-hover); outline: none; }
.cx-menu button small { font-size: 11px; color: var(--faint); }
.cx-menu button[disabled] { color: var(--faint); cursor: not-allowed; }
.cx-menu hr { border: 0; border-top: 1px solid var(--line); margin: 6px 4px; }
.cx-basis { display: inline-flex; align-items: center; gap: 4px; margin-left: 2px; padding: 0 4px; height: 28px; font-size: 11px; color: var(--faint); white-space: nowrap; }
.cx-basis::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
.cx-basis[data-basis="judgment"]::before { background: var(--accent); }
.cx-basis[data-pending="true"]::before { animation: mw-spin var(--dur-arrive) linear infinite; border-radius: 1px; }
.cx-suggest { display: none; }
.cx-actions[data-assistant="true"] .cx-suggest { display: inline-flex; }

/* ---- Assistant panel replica with cards (spec §3.1, §6.3) ---- */
.cx-panel { position: fixed; z-index: 35; left: 50%; translate: -50% 0; bottom: calc(var(--dock-h, 48px) + 56px); width: min(640px, calc(100vw - 24px));
  max-height: min(62vh, 640px); display: flex; flex-direction: column; border-radius: 16px; background: var(--paper); box-shadow: var(--sheet-shadow, var(--lift-3)); border: 1px solid var(--line); }
.cx-panel[hidden], .cx-dev[hidden] { display: none; }
.cx-panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 13px; }
.cx-panel-head span { color: var(--muted); font-size: 12px; }
.cx-panel-head button { margin-left: auto; }
.cx-panel-body { overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cx-card { border: 1px solid var(--line); border-radius: var(--r-card, 12px); background: var(--paper); padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.cx-card[data-state="stale"] { border-style: dashed; }
.cx-card header { display: flex; align-items: baseline; gap: 8px; }
.cx-card header strong { font-size: 13px; }
.cx-card header small { font-size: 11px; color: var(--muted); }
.cx-card header .cx-card-state { margin-left: auto; font-size: 11px; color: var(--muted); }
.cx-quote { margin: 0; padding: 4px 8px; border-left: 2px solid var(--line-strong); color: var(--muted); font-size: 12px; cursor: pointer; }
.cx-quote:hover { color: var(--ink); }
.cx-text { white-space: pre-wrap; line-height: 1.6; margin: 0; }
.cx-diff { display: grid; gap: 6px; }
.cx-diff del { color: var(--muted); text-decoration-color: var(--danger); }
.cx-diff ins { text-decoration: none; background: color-mix(in srgb, var(--hue-green-fill, var(--accent)) 35%, transparent); border-radius: 2px; }
.cx-card textarea, .cx-card input[type="text"] { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; }
.cx-field { display: grid; gap: 4px; }
.cx-field span { font-size: 11px; color: var(--muted); }
.cx-actions-row { display: flex; flex-wrap: wrap; gap: 6px; }
.cx-standin { font-size: 11px; color: var(--faint); }
.cx-hits { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.cx-hits li button { display: grid; gap: 2px; width: 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.cx-hits li button:hover { background: var(--nav-hover); }
.cx-hits small { color: var(--muted); font-size: 11px; }
.cx-compare { display: grid; gap: 6px; }
.cx-compare div { padding: 6px 8px; border-radius: 8px; background: var(--surface-soft); white-space: pre-wrap; }
.cx-error { color: var(--danger); }
.cx-you { align-self: flex-end; max-width: 80%; padding: 8px 10px; border-radius: 12px; background: var(--surface-soft); font-size: 13px; }

/* ---- slice-only debug drawer ---- */
.cx-dev { position: fixed; z-index: 45; top: 40px; right: 8px; width: 340px; max-height: calc(100vh - 120px); overflow: auto; padding: 12px; border-radius: 12px;
  background: var(--paper); box-shadow: var(--lift-3); border: 1px solid var(--line); font-size: 12px; display: grid; gap: 10px; }
.cx-dev fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 8px; display: grid; gap: 6px; }
.cx-dev legend { font-size: 11px; color: var(--muted); padding: 0 4px; }
.cx-dev ol { margin: 0; padding-left: 16px; display: grid; gap: 4px; }
.cx-dev code { font-size: 11px; }
.cx-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

@media (max-width: 800px) {
  .cx-main { grid-template-columns: 1fr; }
  .cx-docs { display: none; }
  .cx-stage { padding: 16px 16px 120px; }
  .cx-actions { max-width: calc(100vw - 16px); }
  .cx-scope { max-width: 96px; }
  .cx-act .cx-kind { display: none; }
}
.cx-short { display: none; }
@media (max-width: 480px) {
  .cx-banner span { display: none; }
  .cx-act { padding: 0 8px; }
  .cx-basis span { display: none; }
  /* A phone row keeps two primary actions; the third leads the “更多” menu. The scope is visible as the highlight. */
  .cx-scope { display: none; }
  .cx-actions .cx-act[data-slot="2"] { display: none; }
  .cx-long { display: none; }
  .cx-short { display: inline; }
  .cx-doc-head { flex-wrap: wrap; }
  .cx-doc-head h1 { font-size: 20px; }
  .cx-panel { bottom: calc(var(--dock-h, 48px) + 104px); max-height: 56vh; }
}
`;
