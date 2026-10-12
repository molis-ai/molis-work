/**
 * The interaction pieces that are candidates for the shared design system (§15.5): the questionnaire, options,
 * reference picking, the operation card with its preview and result, and the next steps beside the composer.
 * The card lays itself out by its own width (container query), so the same markup fits the Assistant panel,
 * Coding's dialogue column and a phone.
 */
export const cardStyles = `
.ix-thread { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 18px; padding: 18px 20px 20px; outline: 0; }
.ix-thread:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.cd-main .ix-thread { width: 100%; max-width: 780px; margin: 0 auto; padding: 20px 24px; }
.ix-turn--person { align-self: flex-end; max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--rail); color: var(--ink); }
.ix-turn--ai { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; }
.ix-ai-mark { padding-top: 2px; color: var(--accent); }
.ix-turn-body { display: grid; gap: 10px; min-width: 0; }
.ix-turn-body > p { color: var(--ink); }
.ix-turn[data-op-turn]:not([hidden]) { animation: pv-arrive var(--dur-arrive) var(--ease-quint); }
.ix-jump { position: absolute; left: 50%; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: 999px;
  background: var(--action); color: var(--action-ink); font-size: 12px; box-shadow: var(--lift-3); transform: translateX(-50%); }

.ix-card { container: ixcard / inline-size; display: grid; gap: 12px; padding: 14px 16px 16px; border-radius: var(--r-card); background: var(--paper); box-shadow: 0 0 0 1px var(--line); }
.ix-card-head { display: flex; align-items: flex-start; gap: 10px; }
.ix-heading { flex: 1; min-width: 0; display: grid; gap: 2px; }
.ix-kicker { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.ix-kicker svg { width: 12px; height: 12px; }
.ix-card h3 { color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); }
.ix-card h4 { color: var(--ink); font-size: 13px; font-weight: var(--weight-title, 600); }
.ix-collapse { margin: -4px -6px 0 0; }
.ix-badge { flex: none; display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; padding: 1px 8px 1px 7px; border-radius: 999px; background: var(--rail); color: var(--ink-soft); font-size: 11px; line-height: 18px; white-space: nowrap; }
.ix-badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
.ix-badge:empty { display: none; }
.ix-badge[data-tone="waiting"] { background: color-mix(in srgb, var(--amber) 13%, transparent); color: var(--ink); }
.ix-badge[data-tone="waiting"]::before { background: var(--amber); }
.ix-badge[data-tone="progress"]::before { background: var(--accent); }
.ix-badge[data-tone="done"] { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--ink); }
.ix-badge[data-tone="done"]::before { background: var(--green); }
.ix-badge[data-tone="failed"] { background: color-mix(in srgb, var(--red) 11%, transparent); color: var(--ink); }
.ix-badge[data-tone="failed"]::before { background: var(--red); }
.ix-intro { color: var(--ink-soft); font-size: 12px; }
.ix-form { display: grid; gap: 14px; }
.ix-fields { display: grid; gap: 16px; margin: 0; padding: 0; border: 0; min-width: 0; }
.ix-fields:disabled { opacity: .72; }

/* A field: label beside the control when the card is wide enough, above it when not. */
.ix-row { position: relative; isolation: isolate; display: grid; gap: 6px; min-width: 0; }
.ix-row:has(.ix-calendar:not([hidden])) { z-index: 5; }
@container ixcard (min-width: 520px) { .ix-row { grid-template-columns: 84px minmax(0, 1fr); gap: 14px; } .ix-label { padding-top: 6px; } }
.ix-label { display: grid; align-content: start; gap: 2px; color: var(--ink); font-weight: var(--weight-control, 500); }
.ix-refreshed { color: var(--accent); font-size: 11px; font-weight: var(--weight-body, 400); }
.ix-control { display: grid; gap: 6px; min-width: 0; justify-items: start; }
[data-focus-target], .ix-preview, .ix-result, .ix-operation { scroll-margin-block: 24px; }
.ix-control > .mw-textarea { width: 100%; min-height: 60px; }
.ix-hint { color: var(--muted); font-size: 12px; }
.field-error { color: var(--red); font-size: 12px; }
.ix-row[data-landed]::before { content: ""; position: absolute; z-index: -1; inset: -6px -8px; border-radius: var(--r-row); background: var(--accent-soft); opacity: 0; pointer-events: none; animation: ix-wash 1.4s var(--ease-quint); }
@keyframes ix-wash { from { opacity: 1; } to { opacity: 0; } }
:is(.ix-options, .ix-choices, .ix-refs)[aria-invalid="true"] { border-radius: var(--r-control); box-shadow: 0 0 0 1px var(--red); }
:is(.ix-options, .ix-choices, .ix-refs):focus-visible { outline: var(--focus-stroke); outline-offset: 3px; }

/* Options with a reason: the product's choice, with the difference under the name and a copper "推荐". */
.ix-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; width: 100%; }
.ix-option { display: grid; gap: 3px; min-height: 52px; padding: 8px 12px; border: 0; border-radius: var(--r-control); background: var(--paper); color: var(--ink); text-align: left; box-shadow: var(--lift-1), 0 0 0 1px var(--line);
  transition: background-color var(--dur-move) var(--ease-quint), color var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
.ix-option:hover:not([aria-pressed="true"]):not(:disabled) { background: color-mix(in srgb, var(--ink) 3%, var(--paper)); }
.ix-option:active:not(:disabled) { transform: scale(.97); }
.ix-option[aria-pressed="true"] { background: var(--action); color: var(--action-ink); box-shadow: var(--lift-1); }
.ix-option:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
.ix-option-top { display: flex; align-items: center; gap: 6px; }
.ix-option-title { font-weight: var(--weight-control, 500); }
.ix-option-desc { color: var(--muted); font-size: 12px; line-height: 1.4; }
.ix-option[aria-pressed="true"] .ix-option-desc { color: color-mix(in srgb, var(--action-ink) 74%, transparent); }
.ix-option-check { margin-left: auto; display: inline-grid; opacity: 0; transform: scale(.6); transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
.ix-option-check svg { width: 12px; height: 12px; }
.ix-option[aria-pressed="true"] .ix-option-check { opacity: 1; transform: none; }
.ix-tag { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--r-tag); background: var(--accent-soft); color: var(--ink); font-size: 11px; font-weight: var(--weight-control, 500); line-height: 18px; }
.ix-option[aria-pressed="true"] .ix-tag { background: color-mix(in srgb, var(--action-ink) 18%, transparent); color: var(--action-ink); }
.ix-tag--quiet { background: var(--control-fill); color: var(--muted); }
.ix-choices .mw-choice { min-width: 0; min-height: 34px; }

/* Number, date and time: typed or stepped, never an OS picker. */
.ix-number-row { display: inline-flex; align-items: center; gap: 8px; }
.ix-number .mw-input { width: 56px; min-width: 56px; }
.ix-number .mw-btn svg { width: 14px; height: 14px; }
.ix-unit, .ix-zone { color: var(--muted); font-size: 12px; white-space: nowrap; }
.ix-date { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.ix-date-input { width: 118px; }
.ix-time-input { width: 72px; }
.ix-weekday { min-width: 2.5em; color: var(--muted); font-size: 12px; }
.ix-when { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ix-calendar { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; padding: 12px; border-radius: var(--r-card); background: var(--popover); box-shadow: var(--lift-3); transform-origin: top left; animation: pv-grow var(--dur-move) var(--ease-quint); }
.ix-calendar[data-place="top"] { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; }
.ix-calendar .mw-calendar__day[aria-pressed="true"] { background: var(--action); color: var(--action-ink); }

/* Notes and the composer share one draft: a stated duration waits for a decision instead of changing the field. */
.ix-conflict { display: grid; gap: 8px; width: 100%; padding: 10px 12px; border-radius: var(--r-control); background: var(--accent-soft); color: var(--ink); font-size: 12px; }
.ix-conflict:not([hidden]) { animation: pv-arrive var(--dur-move) var(--ease-quint); }

/* Materials: real candidates in the product; fixed examples here, marked as such. */
.ix-refs { display: grid; gap: 4px; width: 100%; }
.ix-ref { display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 10px; min-height: 40px; padding: 6px 10px; border: 0; border-radius: var(--r-row); background: transparent; color: var(--ink-soft); text-align: left;
  transition: background-color var(--dur-hover) var(--ease-quint); }
.ix-ref:hover:not(:disabled) { background: var(--nav-hover); }
.ix-ref[aria-pressed="true"] { background: var(--nav-active); color: var(--ink); }
.ix-ref:focus-visible { outline: var(--focus-stroke); outline-offset: -1px; }
.ix-ref-text { display: grid; min-width: 0; }
.ix-ref-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--weight-control, 500); }
.ix-ref-meta { color: var(--faint); font-size: 12px; }
.ix-ref-check { color: var(--accent); opacity: 0; transition: opacity var(--dur-move) var(--ease-quint); }
.ix-ref[aria-pressed="true"] .ix-ref-check { opacity: 1; }
.ix-ref:disabled, .ix-option:disabled { cursor: default; opacity: .6; }

.ix-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ix-actions--end { justify-content: flex-end; }
.ix-card-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding-top: 12px; box-shadow: inset 0 1px 0 var(--line); }
.ix-foot-note { color: var(--muted); font-size: 12px; }
.ix-keys { margin-left: auto; color: var(--faint); font: inherit; font-size: 11px; }
@media (hover: none) { .ix-keys { display: none; } }
.ix-foot-note[data-tone="error"] { color: var(--red); }
.ix-banner { display: grid; gap: 8px; padding: 10px 12px; border-radius: var(--r-control); background: var(--rail); color: var(--ink); }
.ix-banner[data-tone="waiting"] { background: color-mix(in srgb, var(--amber) 12%, var(--paper)); }
.ix-banner[data-tone="failed"] { background: color-mix(in srgb, var(--red) 10%, var(--paper)); }
.ix-answered { display: grid; gap: 8px; justify-items: start; }
.ix-answered dl, .ix-preview dl { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 6px 14px; width: 100%; font-size: 12px; }
.ix-answered dt, .ix-preview dt { color: var(--muted); }
.ix-answered dd, .ix-preview dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; white-space: pre-line; }
.ix-collapsed { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--r-card); background: var(--rail); color: var(--ink); text-align: left; }
.ix-collapsed:hover { background: var(--nav-hover); }
.ix-collapsed-title { font-weight: var(--weight-control, 500); }
.ix-collapsed-meta { margin-left: auto; color: var(--muted); font-size: 12px; }

/* The operation card: target and version first, then a preview of exactly what would run. */
.ix-target, .ix-impact { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); }
.ix-target strong { color: var(--ink); font-weight: var(--weight-control, 500); }
.ix-impact { color: var(--muted); align-items: flex-start; flex-wrap: nowrap; }
.ix-target svg, .ix-impact svg { width: 14px; height: 14px; color: var(--ink-soft); }
.ix-impact svg { margin-top: 2px; }
.ix-version { display: inline-flex; padding: 0 6px; border-radius: var(--r-tag); background: var(--control-fill); color: var(--ink-soft); font-size: 11px; line-height: 18px; }
.ix-version[data-changed] { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--ink); }
.ix-preview { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-row); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); outline: 0; }
.ix-preview:not([hidden]) { animation: pv-arrive var(--dur-move) var(--ease-quint); }
.ix-exec { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 12px; }
.ix-exec:empty { display: none; }
.ix-exec[data-tone="failed"] { color: var(--red); }
.ix-exec[data-tone="waiting"] { color: var(--ink); }
.ix-exec .mw-spinner { width: 12px; height: 12px; color: var(--accent); }
.ix-result { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; padding: 12px 14px; border-radius: var(--r-row); background: color-mix(in srgb, var(--green) 7%, var(--paper)); outline: 0; }
.ix-result:not([hidden]) { animation: pv-arrive var(--dur-arrive) var(--ease-quint); }
.ix-result-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--green-soft); color: var(--green); }
.ix-result-body { display: grid; gap: 6px; }
.ix-result-body > p { color: var(--muted); font-size: 12px; }
.ix-result-details { padding: 10px 12px; border-radius: var(--r-control); background: var(--paper); font-size: 12px; }
.ix-result-details h5 { margin-bottom: 4px; font-size: 12px; font-weight: var(--weight-title, 600); }

/* Next steps beside the composer: views of the records above; the input gives them room and takes it back. */
.ix-steps { flex: none; display: flex; gap: 6px; }
.ix-steps:not(:has(.ix-step:not([hidden]))) { display: none; }
.ix-step { display: inline-flex; align-items: center; gap: 8px; height: var(--step-h); padding: 0 14px 0 12px; border: 0; border-radius: var(--r-composer); background: var(--paper); color: var(--ink);
  font-weight: var(--weight-control, 500); white-space: nowrap; box-shadow: var(--lift-2);
  animation: ix-step-in var(--dur-move) var(--ease-quint); transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
.ix-step:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 3%, var(--paper)); }
.ix-step:active:not(:disabled) { transform: scale(.97); }
.ix-step[data-secondary] { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink-soft); }
.ix-step:disabled { opacity: .5; }
.ix-step-glyph { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--action); color: var(--action-ink); }
.ix-step-glyph svg { width: 12px; height: 12px; }
.ix-step[data-secondary] .ix-step-glyph, .ix-step:not([data-busy]) .ix-step-spin, .ix-step[data-busy] .ix-step-glyph { display: none; }
.ix-step-spin { width: 14px; height: 14px; color: var(--accent); }
.ix-into { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px; border-radius: var(--r-tag); background: var(--accent-soft); color: var(--ink); font-size: 12px; white-space: nowrap; }
.ix-into svg { width: 12px; height: 12px; }
.cd-shell .ix-into { justify-self: start; }
@keyframes ix-step-in { from { opacity: 0; transform: translateX(6px) scale(.98); } to { opacity: 1; transform: none; } }

@media (max-width: 600px), (pointer: coarse) {
  .ix-option, .ix-ref, .ix-collapsed, .ix-choices .mw-choice, .ix-step { min-height: 44px; }
  .ix-number .mw-btn { width: 44px; min-width: 44px; }
  .ix-date-input, .ix-time-input, .ix-number .mw-input { font-size: 16px; }
}
@media (max-width: 600px) {
  .ix-thread, .cd-main .ix-thread { padding: 14px 12px 16px; }
  .ix-card { padding: 12px 12px 14px; }
  .ix-turn--ai { grid-template-columns: minmax(0, 1fr); }
  .ix-ai-mark { display: none; }
  .ix-card-foot .ix-actions { width: 100%; }
  .ix-card-foot [data-submit] { flex: 1; }
  .ix-steps { width: 100%; }
  .ix-step:not([data-secondary]) { flex: 1; justify-content: center; }
}
`;
