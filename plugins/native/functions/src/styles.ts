export const FUNCTIONS_STYLES = `
  .functions-stage-chrome { pointer-events: auto; }
  .functions-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 36px; padding: 6px 8px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .functions-row:hover { background: var(--nav-hover); }
  .functions-row.is-selected { background: var(--nav-active); }
  .functions-row strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .functions-row small { flex: none; color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .functions-editor {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px;
    flex: 1; min-height: 0; padding: 8px 20px 28px; overflow: hidden;
  }
  .functions-define, .functions-try {
    display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; overflow: auto;
  }
  .functions-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .functions-field small { color: var(--faint); font-size: 11px; }
  .functions-field textarea.mw-input { min-height: 88px; resize: vertical; white-space: pre-wrap; }
  .functions-criteria, .functions-samples { display: flex; flex-direction: column; gap: 8px; }
  .functions-criteria-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .functions-criteria-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .functions-criterion {
    display: grid; grid-template-columns: 140px 1fr auto; gap: 8px; align-items: start;
  }
  .functions-sample {
    display: flex; align-items: center; gap: 8px;
  }
  .functions-sample [data-sample-load] { flex: none; }
  .functions-noul-fields { display: flex; flex-direction: column; gap: 8px; }
  .functions-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .functions-note { margin: 0; font-size: 12px; color: var(--muted); }
  .functions-note.is-error { color: var(--red); }
  .functions-preview {
    display: flex; flex-direction: column; gap: 8px;
    margin: 0; padding: 12px; border-radius: 8px; background: var(--rail);
    font-size: 12px; line-height: 1.45;
  }
  .functions-preview[hidden] { display: none; }
  .functions-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .functions-preview-head strong { font-weight: 500; }
  .functions-preview-head small { color: var(--faint); }
  .functions-meter { height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
  .functions-meter > i { display: block; height: 100%; background: var(--text); }
  .functions-probability { display: grid; grid-template-columns: 88px 1fr 48px; gap: 8px; align-items: center; }
  .functions-probability code, .functions-score-legend code { font-size: 11px; }
  .functions-score-legend { display: flex; flex-wrap: wrap; gap: 8px; }
  .functions-score-legend span { display: flex; gap: 6px; align-items: baseline; color: var(--muted); }
  .functions-score-legend span.is-chosen { color: var(--text); }
  .functions-create-choices { display: grid; gap: 8px; }
  .functions-create-choices .mw-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; height: auto; padding: 12px 14px; }
  .functions-create-choices small { color: var(--muted); font-weight: 400; }
  .plugin-stage-detail-bar [data-functions-delete] { margin-left: auto; }
  body.immersive-workbench .plugin-stage-workspace > .functions-editor {
    flex: 1; min-height: 0;
  }
  @media (max-width: 900px) {
    .functions-editor { grid-template-columns: 1fr; overflow: auto; }
  }
`;
