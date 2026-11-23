export const MORE_STYLES = `
  .inline-ref { width: fit-content; max-width: 100%; padding: 0; border: 0; background: transparent; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 4px; cursor: pointer; text-decoration: none; }
  .inline-ref:hover span { text-decoration: underline; }
  .inline-ref svg { flex: 0 0 auto; font-size: 13px; }
  .inline-ref span { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .record-id { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 11px; cursor: pointer; overflow-wrap: anywhere; text-align: left; }
  .record-id:hover { text-decoration: underline; }
  [aria-invalid="true"] { border-color: var(--red) !important; outline: 1px solid var(--red); outline-offset: -1px; }
  .fact-row { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .fact-row:last-child { border-bottom: 0; }
  .fact-icon { flex: 0 0 auto; margin-top: 4px; color: var(--blue); }
  .fact-row > span:last-child { min-width: 0; display: grid; }
  .fact-row small { color: var(--muted); overflow-wrap: anywhere; }
  .history-list { list-style: none; margin: 0; padding: 0; }
  .history-list li { display: grid; grid-template-columns: 136px minmax(0, 1fr); gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .history-list time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .history-list span { min-width: 0; display: grid; }
  .history-list strong, .history-list small { overflow-wrap: anywhere; }
  .history-list small { color: var(--muted); }
  .decision-receipt { margin: 16px 0 4px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); background: var(--green-soft); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
  .decision-receipt strong, .decision-receipt span { display: block; }
  .decision-receipt span { color: var(--muted); font-size: 12px; }
  .decision-receipt a { color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .create-dialog { width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 40px); padding: 0; border: 1px solid var(--control-border); border-radius: var(--radius-surface); box-shadow: var(--control-shadow); }
  .create-dialog::backdrop { background: var(--scrim); backdrop-filter: blur(2px); }
  .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 40px); }
  .create-dialog header { padding: 16px 24px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; }
  .create-dialog header > div { display: flex; gap: 12px; }
  .dialog-icon { width: 34px; height: 34px; border-radius: 6px; background: var(--nav-hover); color: var(--ink); display: grid; place-items: center; font-size: 17px; }
  .dialog-icon--danger { color: var(--red); background: var(--red-soft); }
  .create-dialog h2 { margin: 0; font-size: 20px; }
  .create-dialog header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .dialog-body { padding: 16px 24px 24px; overflow: auto; display: grid; gap: 12px; }
  .dialog-body label { display: grid; gap: 4px; }
  .dialog-body label > span, .dialog-body legend { font-weight: 400; }
  .dialog-body small { color: var(--muted); font-weight: 400; }
  .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select { width: 100%; border: 1px solid var(--control-input); border-radius: var(--radius-control); padding: 8px 12px; background: var(--paper); resize: vertical; }
  .field-row { display: grid; gap: 12px; }
  .field-row--split { grid-template-columns: 1fr 120px; }
  .dialog-body fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .relation-field { min-width: 0; padding: 12px 0 4px; border-top: 1px solid var(--line); }
  .relation-field-heading, .relation-field > legend { width: 100%; margin: 0 0 8px; padding: 0; display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; text-align: left; }
  .relation-field-heading > span, .relation-field > legend > span { width: fit-content; height: fit-content; padding: 4px 8px; border-radius: 3px; color: var(--muted); background: var(--rail); font-size: 11px; font-weight: 400; }
  .relation-field-heading h3 { margin: 0; font-size: 15px; }
  .relation-field-heading p, .relation-field > legend small { margin: 4px 0 0; color: var(--muted); font-size: 12px; font-weight: 400; }
  .relation-field > legend strong, .relation-field > legend small { display: block; }
  .relation-preview { margin: 8px 0 0; padding: 8px 8px; border-radius: 4px; color: var(--ink-soft); background: var(--nav-hover); font-size: 12px; overflow-wrap: anywhere; }
  .form-error { margin: 0; padding: 8px 12px; border-radius: 4px; color: var(--red); background: var(--red-soft); }
  .create-dialog footer { padding: 12px 24px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }
  .toast { position: fixed; inset-inline: 0; margin-inline: auto; bottom: 24px; z-index: 30; }
  .bound-list { display: grid; gap: 8px; }
  .bound-list article { min-width: 0; display: grid; }
  .bound-list small { color: var(--muted); overflow-wrap: anywhere; }
  @keyframes pulse { 50% { opacity: .35; } }
`;

