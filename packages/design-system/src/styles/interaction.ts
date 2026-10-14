/**
 * Styles for the AI interaction parts (`../interaction.ts`). Kept out of PRIMITIVE_STYLES on purpose: a byte there
 * is paid six times in the frozen page assets. The component board inlines this sheet; a product page takes it when
 * it adopts the parts, in the same change that deletes the rendering they replace (spec §17, P2).
 * Tokens only; the card lays itself out by its own width, so one markup fits the Assistant panel, Coding and a phone.
 * It comes in segments, so a page pays only for the parts it draws (a question without dates leaves the calendar out).
 */
/** The card, its fields, option groups, banners, the footer and an answered summary: every page that shows a question or a card takes it. */
export const INTERACTION_QUESTION_STYLES = `
.mw-ix-card { container: mw-ix / inline-size; display: grid; gap: 12px; padding: 14px 16px 16px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px var(--line); color: var(--ink); text-align: left; }
.mw-ix-card [hidden] { display: none; }
.mw-ix-head { display: flex; align-items: flex-start; gap: 10px; }
.mw-ix-heading { flex: 1; min-width: 0; display: grid; gap: 2px; }
.mw-ix-kicker { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.mw-ix-kicker > svg { width: 12px; height: 12px; }
.mw-ix-card h3 { margin: 0; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); }
.mw-ix-card h4 { margin: 0; color: var(--ink); font-size: 13px; font-weight: var(--weight-title, 600); }
.mw-ix-card p, .mw-ix-card dl { margin: 0; }
.mw-ix-head > .mw-btn { margin: -4px -6px 0 0; }
.mw-ix-badge { flex: none; display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; padding: 1px 8px 1px 7px; border-radius: 999px; background: var(--rail); color: var(--ink-soft); font-size: 11px; line-height: 18px; white-space: nowrap; }
.mw-ix-badge:empty { display: none; }
.mw-ix-badge[data-tone="waiting"] { background: color-mix(in srgb, var(--amber) 13%, transparent); color: var(--ink); }
.mw-ix-badge[data-tone="done"] { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--ink); }
.mw-ix-badge[data-tone="failed"] { background: color-mix(in srgb, var(--red) 11%, transparent); color: var(--ink); }
.mw-ix-intro { color: var(--ink-soft); font-size: 12px; }
.mw-ix-about { color: var(--muted); font-size: 12px; }
.mw-ix-other { display: grid; gap: 4px; width: 100%; margin-top: 2px; color: var(--ink-soft); font-size: 12px; }
.mw-ix-other .mw-input { width: 100%; max-width: none; }
.mw-ix-form { display: grid; gap: 14px; }
.mw-ix-fields { display: grid; gap: 16px; margin: 0; padding: 0; border: 0; min-width: 0; }
.mw-ix-fields:disabled { opacity: .72; }
/* A field: label beside the control when the card is wide enough, above it when not. */
.mw-ix-row { position: relative; isolation: isolate; display: grid; gap: 6px; min-width: 0; }
@container mw-ix (min-width: 520px) { .mw-ix-row { grid-template-columns: 84px minmax(0, 1fr); gap: 14px; } .mw-ix-label { padding-top: 6px; } }
.mw-ix-label { display: grid; align-content: start; gap: 2px; color: var(--ink); font-weight: var(--weight-control, 500); }
.mw-ix-optional { color: var(--muted); font-size: 11px; font-weight: var(--weight-body, 400); }
.mw-ix-control { display: grid; gap: 6px; min-width: 0; justify-items: start; }
.mw-ix-control > .mw-ix-text { width: 100%; max-width: none; }
.mw-ix-control > textarea.mw-ix-text { min-height: 60px; resize: vertical; }
.mw-ix-hint { color: var(--muted); font-size: 12px; }
.mw-ix-error { color: var(--red); font-size: 12px; }
[data-ix-focus], .mw-ix-preview, .mw-ix-result, .mw-ix-operation { scroll-margin-block: 24px; }
:is(.mw-ix-options, .mw-ix-choices, .mw-ix-refs)[aria-invalid="true"] { border-radius: var(--r-control, 8px); box-shadow: 0 0 0 1px var(--red); }
:is(.mw-ix-options, .mw-ix-choices, .mw-ix-refs):focus-visible { outline: var(--focus-stroke); outline-offset: 3px; }
/* Options with a reason: the product's choice, the difference under the name, a copper tag for the recommendation. */
.mw-ix-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; width: 100%; }
.mw-ix-option { display: grid; gap: 3px; min-height: 52px; padding: 8px 12px; border: 0; border-radius: var(--r-control, 8px); background: var(--paper); color: var(--ink); font: inherit; text-align: left; cursor: pointer; box-shadow: var(--lift-1), 0 0 0 1px var(--line);
  transition: background-color var(--dur-move) var(--ease-quint), color var(--dur-move) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
.mw-ix-option:hover:not([aria-pressed="true"], [aria-checked="true"]):not(:disabled) { background: color-mix(in srgb, var(--ink) 3%, var(--paper)); }
.mw-ix-option:active:not(:disabled) { transform: scale(.97); }
.mw-ix-option:is([aria-pressed="true"], [aria-checked="true"]) { background: var(--action); color: var(--action-ink); box-shadow: var(--lift-1); }
.mw-ix-option:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
.mw-ix-option__top { display: flex; align-items: center; gap: 6px; }
.mw-ix-option__title { font-weight: var(--weight-control, 500); }
.mw-ix-option__desc { color: var(--muted); font-size: 12px; line-height: 1.4; }
.mw-ix-option:is([aria-pressed="true"], [aria-checked="true"]) .mw-ix-option__desc { color: color-mix(in srgb, var(--action-ink) 74%, transparent); }
.mw-ix-option__check { margin-left: auto; display: inline-grid; opacity: 0; transform: scale(.6); transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-spring); }
.mw-ix-option__check svg { width: 12px; height: 12px; }
.mw-ix-option:is([aria-pressed="true"], [aria-checked="true"]) .mw-ix-option__check { opacity: 1; transform: none; }
.mw-ix-tag { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--r-tag, 6px); background: var(--accent-soft); color: var(--ink); font-size: 11px; font-weight: var(--weight-control, 500); line-height: 18px; }
.mw-ix-option:is([aria-pressed="true"], [aria-checked="true"]) .mw-ix-tag { background: color-mix(in srgb, var(--action-ink) 18%, transparent); color: var(--action-ink); }
.mw-ix-choices .mw-choice { min-width: 0; min-height: 34px; }
/* A single pick is a radio (aria-checked); the product's choice styles its selected state from aria-pressed, so mirror them. */
.mw-ix-choices .mw-choice[aria-checked="true"] { background: var(--action); color: var(--action-ink); box-shadow: var(--lift-1); }
.mw-ix-choices .mw-choice[aria-checked="true"] .mw-choice__check { opacity: 1; transform: none; }
.mw-ix-banner { display: grid; gap: 8px; padding: 10px 12px; border-radius: var(--r-control, 8px); background: var(--rail); color: var(--ink); }
.mw-ix-banner[data-tone="waiting"] { background: color-mix(in srgb, var(--amber) 12%, var(--paper)); }
.mw-ix-banner[data-tone="failed"] { background: color-mix(in srgb, var(--red) 10%, var(--paper)); }
.mw-ix-option:disabled { cursor: default; opacity: .6; }
.mw-ix-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mw-ix-actions--end { justify-content: flex-end; }
.mw-ix-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding-top: 12px; box-shadow: inset 0 1px 0 var(--line); }
.mw-ix-note { color: var(--muted); font-size: 12px; }
.mw-ix-note[data-tone="error"] { color: var(--red); }
.mw-ix-keys { margin-left: auto; color: var(--faint); font: inherit; font-size: 11px; }
@media (hover: none) { .mw-ix-keys { display: none; } }
.mw-ix-answered dl, .mw-ix-preview dl { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 6px 14px; width: 100%; font-size: 12px; }
.mw-ix-answered dt, .mw-ix-preview dt { color: var(--muted); }
.mw-ix-answered dd, .mw-ix-preview dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; white-space: pre-line; }
@keyframes mw-ix-arrive { from { opacity: .4; transform: translateY(7px); } to { opacity: 1; transform: none; } }
@media (max-width: 760px), (pointer: coarse) {
  :is(.mw-ix-option, .mw-ix-choices .mw-choice) { min-height: 44px; }
  .mw-ix-card .mw-btn { min-height: 44px; }
  .mw-ix-card .mw-btn--icon-only { width: 44px; min-width: 44px; }
}
@media (max-width: 600px) {
  .mw-ix-card { padding: 12px 12px 14px; }
  .mw-ix-foot .mw-ix-actions { width: 100%; }
  .mw-ix-foot [data-ix-action="submit"] { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  :is(.mw-ix-option, .mw-ix-option__check) { animation: none; transition: none; }
}
`;

/** Days and times typed into a field, with the weekday and the zone beside them. */
export const INTERACTION_DATE_STYLES = `
.mw-ix-date { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.mw-ix-date__input { width: 118px; }
.mw-ix-time { width: 72px; }
.mw-ix-weekday { min-width: 2.5em; color: var(--muted); font-size: 12px; }
.mw-ix-when { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.mw-ix-unit, .mw-ix-zone { color: var(--muted); font-size: 12px; white-space: nowrap; }
@media (max-width: 760px), (pointer: coarse) {
  :is(.mw-ix-date__input, .mw-ix-time) { font-size: 16px; }
}
`;

/** Steppers for numbers and the calendar popover (with INTERACTION_CLIENT_SCRIPT, not the typed-dates variant). */
export const INTERACTION_NUMBER_STYLES = `
.mw-ix-row:has(.mw-ix-calendar:not([hidden])) { z-index: 5; }
/* Number, date and time are typed or stepped; the calendar is the design system's, never an OS picker. */
.mw-ix-number-row { display: inline-flex; align-items: center; gap: 8px; }
.mw-ix-number .mw-input { width: 56px; min-width: 56px; }
.mw-ix-number .mw-btn svg { width: 14px; height: 14px; }
.mw-ix-calendar { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; padding: 12px; border-radius: var(--r-card, 12px); background: var(--popover); box-shadow: var(--lift-3); transform-origin: top left; animation: mw-ix-grow var(--dur-move) var(--ease-quint); }
.mw-ix-calendar[data-place="top"] { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; }
.mw-ix-calendar .mw-calendar__day[aria-pressed="true"] { background: var(--action); color: var(--action-ink); }
@keyframes mw-ix-grow { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@media (max-width: 760px), (pointer: coarse) {
  .mw-ix-number .mw-btn { width: 44px; min-width: 44px; }
  .mw-ix-number .mw-input { font-size: 16px; }
  .mw-ix-number .mw-input { min-height: 42px; }
}
@media (prefers-reduced-motion: reduce) {
  .mw-ix-calendar { animation: none; transition: none; }
}
`;

/** Objects and materials picked as rows. */
export const INTERACTION_REFERENCE_STYLES = `
/* Objects and materials: real candidates the person may use, picked as rows. */
.mw-ix-refs { display: grid; gap: 4px; width: 100%; }
.mw-ix-ref { display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 10px; min-height: 40px; padding: 6px 10px; border: 0; border-radius: var(--r-row, 10px); background: transparent; color: var(--ink-soft); font: inherit; text-align: left; cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-quint); }
.mw-ix-ref:hover:not(:disabled) { background: var(--nav-hover); }
.mw-ix-ref[aria-pressed="true"] { background: var(--nav-active); color: var(--ink); }
.mw-ix-ref:focus-visible { outline: var(--focus-stroke); outline-offset: -1px; }
.mw-ix-ref__glyph svg { width: 16px; height: 16px; }
.mw-ix-ref__text { display: grid; min-width: 0; }
.mw-ix-ref__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--weight-control, 500); }
.mw-ix-ref__meta { color: var(--faint); font-size: 12px; }
.mw-ix-ref__check { color: var(--accent); opacity: 0; transition: opacity var(--dur-move) var(--ease-quint); }
.mw-ix-ref__check svg { width: 16px; height: 16px; }
.mw-ix-ref[aria-pressed="true"] .mw-ix-ref__check { opacity: 1; }
.mw-ix-ref:disabled { cursor: default; opacity: .6; }
@media (max-width: 760px), (pointer: coarse) {
  .mw-ix-ref { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  :is(.mw-ix-ref, .mw-ix-ref__check) { animation: none; transition: none; }
}
`;

/** The operation card: what it acts on, exactly what would run, how it stands. Needs the question segment. */
export const INTERACTION_OPERATION_STYLES = `
/* The operation card: what it acts on and exactly what would run. */
.mw-ix-target, .mw-ix-impact { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); }
.mw-ix-target strong { color: var(--ink); font-weight: var(--weight-control, 500); }
.mw-ix-impact { color: var(--muted); align-items: flex-start; flex-wrap: nowrap; }
.mw-ix-target svg, .mw-ix-impact svg { width: 14px; height: 14px; flex: none; color: var(--ink-soft); }
.mw-ix-impact svg { margin-top: 2px; }
.mw-ix-preview { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-row, 10px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); outline: 0; }
.mw-ix-preview:not([hidden]) { animation: mw-ix-arrive var(--dur-move) var(--ease-quint); }
.mw-ix-status { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 12px; }
.mw-ix-status:empty { display: none; }
.mw-ix-status[data-tone="failed"] { color: var(--red); }
.mw-ix-status[data-tone="waiting"] { color: var(--ink); }
.mw-ix-status .mw-spinner { width: 20px; height: 20px; color: var(--accent); }
@media (prefers-reduced-motion: reduce) {
  .mw-ix-preview { animation: none; transition: none; }
}
`;

/** Next steps and the mark inside a composer. */
export const INTERACTION_STEP_STYLES = `
/* Next steps beside a composer: views of the records above; the input gives them room and takes it back. */
.mw-ix-steps { --mw-ix-step-h: 50px; flex: none; display: flex; gap: 6px; }
.mw-ix-steps:not(:has(.mw-ix-step:not([hidden]))) { display: none; }
.mw-ix-step { display: inline-flex; align-items: center; gap: 8px; height: var(--mw-ix-step-h); padding: 0 14px 0 12px; border: 0; border-radius: var(--r-composer, 15px); background: var(--paper); color: var(--ink); font: inherit;
  font-weight: var(--weight-control, 500); white-space: nowrap; cursor: pointer; box-shadow: var(--lift-2);
  animation: mw-ix-step-in var(--dur-move) var(--ease-quint); transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
.mw-ix-step:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 3%, var(--paper)); }
.mw-ix-step:active:not(:disabled) { transform: scale(.97); }
.mw-ix-step:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
.mw-ix-step[data-secondary] { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink-soft); }
.mw-ix-step:disabled { opacity: .5; cursor: not-allowed; }
.mw-ix-step__glyph { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--action); color: var(--action-ink); }
.mw-ix-step__glyph svg { width: 12px; height: 12px; }
.mw-ix-step[data-secondary] .mw-ix-step__glyph, .mw-ix-step:not([data-busy]) .mw-ix-step__spin, .mw-ix-step[data-busy] .mw-ix-step__glyph { display: none; }
.mw-ix-step__spin { width: 14px; height: 14px; color: var(--accent); }
.mw-ix-step[data-waiting]::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--amber); }
.mw-ix-step__waiting { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.mw-ix-steps__more { color: var(--muted); }
@keyframes mw-ix-step-in { from { opacity: 0; transform: translateX(6px) scale(.98); } to { opacity: 1; transform: none; } }
@media (max-width: 760px), (pointer: coarse) {
  .mw-ix-step { min-height: 44px; }
}
@media (max-width: 600px) {
  .mw-ix-steps { width: 100%; }
  .mw-ix-step:not([data-secondary]) { flex: 1; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) {
  .mw-ix-step { animation: none; transition: none; }
}
`;
/**
 * What carries a card across time: where its facts came from, a field's raised question, a value that landed or was
 * refreshed in the background, an answered summary, a version that moved, a result, the composer's mark. Needs the question segment.
 */
export const INTERACTION_TRACE_STYLES = `
.mw-ix-card h5 { margin: 0 0 4px; font-size: 12px; font-weight: var(--weight-title, 600); }
.mw-ix-evidence { color: var(--muted); font-size: 12px; }
.mw-ix-evidence > summary { width: fit-content; cursor: pointer; list-style: none; border-radius: var(--r-tag, 6px); }
.mw-ix-evidence > summary::-webkit-details-marker { display: none; }
.mw-ix-evidence > summary::before { content: "›"; display: inline-block; width: 12px; transition: transform var(--dur-move) var(--ease-quint); }
.mw-ix-evidence[open] > summary::before { transform: rotate(90deg); }
.mw-ix-evidence > summary:hover { color: var(--ink); }
.mw-ix-evidence > summary:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
.mw-ix-evidence dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 4px 12px; margin: 8px 0 0; font-family: var(--font-mono, monospace); font-size: 11px; }
.mw-ix-evidence dt { color: var(--faint); }
.mw-ix-evidence dd { margin: 0; color: var(--ink-soft); overflow-wrap: anywhere; }
.mw-ix-refreshed { color: var(--accent); font-size: 11px; font-weight: var(--weight-body, 400); }
.mw-ix-row[data-landed]::before { content: ""; position: absolute; z-index: -1; inset: -6px -8px; border-radius: var(--r-row, 10px); background: var(--accent-soft); opacity: 0; pointer-events: none; animation: mw-ix-wash 1.4s var(--ease-quint); }
@keyframes mw-ix-wash { from { opacity: 1; } to { opacity: 0; } }
/* A question the field raises before it changes. */
.mw-ix-notice { display: grid; gap: 8px; width: 100%; padding: 10px 12px; border-radius: var(--r-control, 8px); background: var(--accent-soft); color: var(--ink); font-size: 12px; }
.mw-ix-notice:not([hidden]) { animation: mw-ix-arrive var(--dur-move) var(--ease-quint); }
.mw-ix-answered { display: grid; gap: 8px; justify-items: start; }
.mw-ix-version { display: inline-flex; padding: 0 6px; border-radius: var(--r-tag, 6px); background: var(--control-fill); color: var(--ink-soft); font-size: 11px; line-height: 18px; }
.mw-ix-version[data-changed] { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--ink); }
.mw-ix-result { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; padding: 12px 14px; border-radius: var(--r-row, 10px); background: color-mix(in srgb, var(--green) 7%, var(--paper)); outline: 0; }
.mw-ix-result:not([hidden]) { animation: mw-ix-arrive var(--dur-arrive) var(--ease-quint); }
.mw-ix-result__mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--green-soft); color: var(--green); }
.mw-ix-result__mark > svg { width: 16px; height: 16px; }
.mw-ix-result__body { display: grid; gap: 6px; }
.mw-ix-result__body > p { color: var(--muted); font-size: 12px; }
.mw-ix-result__details { padding: 10px 12px; border-radius: var(--r-control, 8px); background: var(--paper); font-size: 12px; }
.mw-ix-into { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px; border-radius: var(--r-tag, 6px); background: var(--accent-soft); color: var(--ink); font-size: 12px; white-space: nowrap; }
.mw-ix-into svg { width: 12px; height: 12px; }
@media (prefers-reduced-motion: reduce) {
  :is(.mw-ix-notice, .mw-ix-result) { animation: none; transition: none; }
  .mw-ix-row[data-landed]::before { animation: none; }
}
`;
/** Every segment: the component board, and a page that draws all of them. */
export const INTERACTION_STYLES = `${INTERACTION_QUESTION_STYLES}${INTERACTION_DATE_STYLES}${INTERACTION_NUMBER_STYLES}${INTERACTION_REFERENCE_STYLES}${INTERACTION_OPERATION_STYLES}${INTERACTION_STEP_STYLES}${INTERACTION_TRACE_STYLES}`;
