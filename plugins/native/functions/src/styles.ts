export const FUNCTIONS_STYLES = `
  [data-functions=workbench] { --plugin-tint: var(--plugin-functions); }
  .functions-stage-chrome { pointer-events: auto; }
  .functions-editor {
    display: flex; flex-direction: column;
    flex: 1; min-width: 0; min-height: 0;
    max-width: none; padding: 0; overflow: hidden;
  }
  .functions-columns {
    flex: 1; min-width: 0; min-height: 0;
    display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.4fr) minmax(0, 1fr);
  }
  .functions-col {
    min-width: 0; min-height: 0;
    display: flex; flex-direction: column; gap: 16px;
    padding: 8px 18px 28px;
    overflow: auto; overscroll-behavior: contain;
  }
  .functions-col + .functions-col { border-left: 1px solid var(--line); }
  .functions-col[data-functions-col="fn"] { padding-left: 20px; padding-right: 20px; }
  .functions-name .mw-input { font-size: 16px; font-weight: 500; letter-spacing: -0.02em; }
  .functions-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
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
    background: color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 10%, var(--paper));
  }
  .functions-chip:has(:checked) {
    background: color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 14%, var(--paper));
  }
  .functions-chip.is-related {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 28%, transparent);
  }
  .functions-chip .mw-check { width: 14px; height: 14px; margin: 0; }
  .functions-dest-list { display: flex; flex-direction: column; gap: 6px; }
  .functions-dest {
    display: grid; gap: 3px; width: 100%;
    margin: 0; padding: 10px 12px; border: 0; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
    color: var(--ink); text-align: left; cursor: pointer;
  }
  .functions-dest:hover, .functions-dest:focus-visible {
    background: color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 10%, var(--paper));
  }
  .functions-dest.is-related {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 28%, transparent);
  }
  .functions-dest.is-current {
    background: color-mix(in srgb, var(--plugin-functions, var(--hue-indigo)) 16%, var(--paper));
  }
  .functions-dest[disabled] { opacity: 0.48; cursor: not-allowed; }
  .functions-dest strong { font-size: 13px; font-weight: 500; }
  .functions-dest small { font-size: 11px; line-height: 1.4; color: var(--muted); }
  .functions-criteria, .functions-samples, .functions-try, .functions-map, .functions-palette {
    display: flex; flex-direction: column; gap: 10px;
  }
  .functions-try {
    margin-top: 4px; padding: 14px 14px 16px; border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
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
  .functions-palette-row { grid-template-columns: minmax(0, 1fr) auto auto; }
  .functions-palette-row strong, .functions-map-row strong {
    font-size: 13px; font-weight: 500; color: var(--ink);
  }
  .functions-palette-row small {
    display: block; font-size: 11px; color: var(--muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .functions-map-row select.mw-input { min-width: 0; }
  .functions-effect {
    flex: none; font-size: 11px; color: var(--muted);
  }
  .functions-effect[data-effect="write"] { color: var(--tone-attention, var(--amber)); }
  .functions-noul-fields { display: flex; flex-direction: column; gap: 8px; }
  .functions-criterion {
    display: grid; grid-template-columns: minmax(7rem, 0.7fr) minmax(0, 1.3fr) auto; gap: 8px; align-items: start;
  }
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
  .functions-probability code, .functions-score-legend code { font-size: 11px; }
  .functions-score-legend { display: flex; flex-wrap: wrap; gap: 8px; }
  .functions-score-legend span { display: flex; gap: 6px; align-items: baseline; color: var(--muted); }
  .functions-score-legend span.is-chosen { color: var(--ink); }
  .functions-create-choices { display: grid; gap: 8px; }
  .functions-create-choices .mw-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; height: auto; padding: 12px 14px; }
  .functions-create-choices small { color: var(--muted); font-weight: 400; }
  body.immersive-workbench .plugin-stage-workspace > .functions-editor {
    flex: 1; min-height: 0;
  }
  @media (max-width: 900px) {
    .functions-columns { grid-template-columns: 1fr; overflow: auto; }
    .functions-col { overflow: visible; }
    .functions-col + .functions-col { border-left: 0; border-top: 1px solid var(--line); }
  }
`;
