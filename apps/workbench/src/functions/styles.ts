export const FUNCTIONS_STYLES = `
  [data-functions=workbench] { --plugin-tint: var(--hue-indigo); }
  .functions-stage-chrome { pointer-events: auto; }
  .functions-editor {
    display: flex; flex-direction: column;
    flex: 1; min-width: 0; min-height: 0;
    max-width: none; padding: 0; overflow: hidden;
  }
  .functions-steps { display: flex; flex: none; gap: 8px; padding: 16px 24px; border-bottom: 1px solid var(--line); }
  .functions-steps button { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
  .functions-steps button span { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--line-strong); border-radius: 50%; font-size: 12px; font-variant-numeric: tabular-nums; }
  .functions-steps button[aria-current] { background: color-mix(in srgb, var(--hue-indigo) 12%, transparent); color: var(--ink); }
  .functions-steps button[aria-current] span { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .functions-steps button:hover { color: var(--ink); background: var(--nav-hover); }
  .functions-columns { flex: 1; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .functions-col { max-width: 800px; margin: 0 auto; min-width: 0; display: flex; flex-direction: column; gap: 24px; padding: 28px 32px 36px; animation: functions-step-enter 180ms cubic-bezier(.16,1,.3,1); }
  .functions-col[hidden] { display: none; }
  .functions-section-heading h2 { font-size: 22px; line-height: 1.35; font-weight: 500; letter-spacing: -.02em; color: var(--ink); margin: 0 0 8px; }
  .functions-section-heading p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .functions-editor-footer { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); padding: 14px 24px; background: var(--paper); }
  .functions-feedback { min-width: 0; display: grid; gap: 4px; }
  .functions-save-status { font-size: 12px; color: var(--muted); }
  .functions-editor-footer .functions-actions { flex: none; }
  .functions-details { border-top: 1px solid var(--line); padding-top: 14px; min-width: 0; }
  .functions-details > summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; padding: 4px 0; }
  .functions-details[open] > summary { margin-bottom: 12px; }
  .functions-details > .functions-field, .functions-details > .functions-hint { margin-bottom: 12px; }
  .functions-context-note { font-size: 12px; line-height: 1.6; color: var(--ink-soft); margin: 8px 0 0; }
  .functions-release { border-top: 1px solid var(--line); padding-top: 24px; display: flex; flex-direction: column; gap: 12px; }
  .functions-release h3 { margin: 0; font-size: 16px; font-weight: 500; }
  .functions-release > button { align-self: flex-start; }
  .functions-option-key { min-width: 0; padding-top: 23px; }
  .functions-option-key summary { font-size: 12px; color: var(--muted); cursor: pointer; }
  .functions-option-key input { margin-top: 8px; width: 100%; min-width: 0; }
  .functions-criterion > button { margin-top: 18px; }
  [data-functions-criteria], [data-functions-map], [data-functions-samples] { display: grid; gap: 12px; }
  [data-functions=workbench] :is(button, input, textarea, select, summary):focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 3px; }
  @keyframes functions-step-enter { from { opacity: .65; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .functions-col { animation: none; } }
  .functions-name .mw-input { font-size: 16px; font-weight: 500; letter-spacing: -0.02em; }
  .functions-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ink-soft); }
  .functions-field small { color: var(--muted); font-size: 11px; }
  .functions-field textarea.mw-input { min-height: 88px; resize: vertical; white-space: pre-wrap; }
  .functions-fieldset {
    margin: 0; padding: 0; border: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .functions-fieldset legend {
    padding: 0; margin: 0 0 2px;
    font-size: 13px; font-weight: 500; color: var(--ink);
  }
  .functions-hint { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .functions-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .functions-chip {
    display: inline-flex; align-items: center; gap: 6px;
    margin: 0; padding: 6px 10px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
    color: var(--ink); font-size: 12px; cursor: pointer;
  }
  .functions-chip:hover, .functions-chip:has(:focus-visible) {
    background: color-mix(in srgb, var(--hue-indigo) 10%, var(--paper));
  }
  .functions-chip:has(:checked) {
    background: color-mix(in srgb, var(--hue-indigo) 14%, var(--paper));
  }
  .functions-chip.is-related {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hue-indigo) 28%, transparent);
  }
  .functions-chip .mw-check { width: 14px; height: 14px; margin: 0; }
  .functions-dest-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .functions-dest {
    display: grid; gap: 3px; width: 100%;
    margin: 0; padding: 14px 16px; border: 1px solid transparent; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
    color: var(--ink); text-align: left; cursor: pointer;
  }
  .functions-dest:hover, .functions-dest:focus-visible {
    background: color-mix(in srgb, var(--hue-indigo) 10%, var(--paper));
  }
  .functions-dest.is-related {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hue-indigo) 28%, transparent);
  }
  .functions-dest.is-current {
    border-color: var(--ink-soft);
    background: color-mix(in srgb, var(--hue-indigo) 16%, var(--paper));
  }
  .functions-dest[disabled] { opacity: 0.48; cursor: not-allowed; }
  .functions-dest strong { font-size: 13px; font-weight: 500; }
  .functions-dest small { font-size: 12px; line-height: 1.4; color: var(--muted); }
  .functions-criteria, .functions-samples, .functions-try, .functions-map, .functions-palette {
    display: flex; flex-direction: column; gap: 10px;
  }
  .functions-try {
    margin-top: 0; padding: 0;
  }
  .functions-criteria-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .functions-criteria-head strong { font-size: 13px; font-weight: 500; color: var(--ink); }
  .functions-behavior-group { display: flex; flex-direction: column; gap: 6px; margin: 0 0 4px; }
  .functions-behavior-group > span {
    font-size: 11px; color: var(--muted); letter-spacing: 0.01em;
  }
  .functions-palette-row, .functions-map-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center;
    margin: 0; padding: 8px 10px; border-radius: 8px;
    background: color-mix(in srgb, var(--paper) 70%, transparent);
  }
  .functions-palette-row { grid-template-columns: minmax(0, 1fr) auto; border-bottom: 1px solid var(--line); border-radius: 0; padding: 12px 0; }
  .functions-palette-row > span:first-child { grid-column: 1; }
  .functions-palette-row .functions-effect { grid-column: 1; grid-row: 2; }
  .functions-palette-row > button { grid-column: 2; grid-row: 1 / 3; }
  .functions-palette-row strong, .functions-map-row strong {
    font-size: 13px; font-weight: 500; color: var(--ink);
  }
  .functions-palette-row small {
    display: block; font-size: 11px; color: var(--muted);
    white-space: normal; overflow-wrap: anywhere; line-height: 1.6;
  }
  .functions-map-row :is(.mw-select, .mw-select-picker) { min-width: 0; }
  .functions-effect {
    flex: none; font-size: 11px; color: var(--muted);
  }
  .functions-effect[data-effect="write"] { color: var(--tone-attention, var(--amber)); }
  .functions-noul-fields { display: flex; flex-direction: column; gap: 8px; }
  .functions-criterion {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(64px, .3fr) auto; gap: 8px; align-items: start;
  }
  .functions-criterion:has([data-score-level]) { grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; }
  .functions-criterion:has([data-score-level]) > button { margin-top: 0; }
  .functions-criterion [data-score-index] { align-self: center; font-size: 11px; color: var(--muted); }
  .functions-sample { display: flex; align-items: center; gap: 8px; }
  .functions-sample [data-sample-load] { flex: none; }
  .functions-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .functions-note { margin: 0; font-size: 12px; color: var(--muted); }
  .functions-note.is-error { color: var(--red); }
  .functions-preview, .functions-usages {
    display: flex; flex-direction: column; gap: 8px;
    margin: 0; padding: 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--paper) 78%, transparent);
    font-size: 12px; line-height: 1.45;
  }
  .functions-preview[hidden], .functions-usages:empty, .functions-map[hidden], .functions-palette:empty { display: none; }
  .functions-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .functions-preview-head strong { font-weight: 500; }
  .functions-preview-head small { color: var(--muted); }
  .functions-usages strong { font-size: 12px; font-weight: 500; color: var(--ink); }
  .functions-usages p { margin: 0; color: var(--ink-soft); }
  .functions-usages .mw-btn { align-self: start; }
  .functions-meter { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
  .functions-meter > i { display: block; height: 100%; background: var(--ink); }
  .functions-probability { display: grid; grid-template-columns: minmax(0, 1fr) 1fr 48px; gap: 8px; align-items: center; }
  .functions-probability code, .functions-score-legend code { font-size: 12px; font-family: inherit; overflow-wrap: anywhere; }
  .functions-preview-head strong { overflow-wrap: anywhere; }
  .functions-preview-head small { flex: none; }
  .functions-score-legend { display: flex; flex-wrap: wrap; gap: 8px; }
  .functions-score-legend span { display: flex; gap: 6px; align-items: baseline; color: var(--muted); }
  .functions-score-legend span.is-chosen { color: var(--ink); }
  .functions-create-choices { display: grid; gap: 8px; }
  .functions-create-choices .mw-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; height: auto; padding: 12px 14px; }
  .functions-create-choices small { color: var(--muted); font-weight: 400; }
  body.immersive-workbench .plugin-stage-workspace > .functions-editor {
    flex: 1; min-height: 0;
  }
  @media (max-width: 760px) {
    .functions-steps { gap: 2px; padding: 10px 12px; }
    .functions-steps button { flex: 1; justify-content: center; gap: 5px; padding: 8px 3px; min-height: 44px; font-size: 12px; }
    .functions-steps button span { width: 19px; height: 19px; }
    .functions-col { padding: 22px 16px; gap: 20px; }
    .functions-section-heading h2 { font-size: 20px; }
    .functions-editor-footer { padding: 12px 16px; align-items: stretch; flex-direction: column; gap: 8px; }
    .functions-editor-footer .functions-actions { justify-content: flex-end; }
    .functions-editor .mw-btn, .functions-editor summary, .functions-chip { min-height: 44px; }
    .functions-dest-list { grid-template-columns: 1fr; }
    .functions-map-row { grid-template-columns: 1fr; }
    .functions-option-key { padding-top: 18px; }
    .functions-criterion { grid-template-columns: minmax(0, 1fr) 52px auto; gap: 6px; }
    .functions-option-key[open] { grid-column: 1 / -1; grid-row: 2; padding: 0; }
  }
`;
