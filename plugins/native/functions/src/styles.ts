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
    display: flex; flex-direction: column; gap: 14px;
    padding: 8px 20px 28px; max-width: 720px;
  }
  .functions-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .functions-field small { color: var(--faint); font-size: 11px; }
  .functions-field textarea.mw-input { min-height: 88px; resize: vertical; white-space: pre-wrap; }
  .functions-criteria { display: flex; flex-direction: column; gap: 8px; }
  .functions-criteria-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .functions-criteria-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .functions-criterion {
    display: grid; grid-template-columns: 140px 1fr auto; gap: 8px; align-items: start;
  }
  .functions-actions { display: flex; gap: 8px; }
  .functions-note { margin: 0; font-size: 12px; color: var(--muted); }
  .functions-note.is-error { color: var(--red); }
  .functions-preview {
    margin: 0; padding: 12px; border-radius: 8px; background: var(--rail);
    font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow: auto;
  }
  .functions-settings-form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }
  .functions-settings-status { margin: 0; font-size: 13px; color: var(--muted); }
  .functions-settings-actions { display: flex; gap: 8px; }
  .functions-settings-hint { margin: 0; font-size: 12px; color: var(--faint); }
  body.immersive-workbench .plugin-stage-workspace > .functions-editor {
    flex: 1; min-height: 0; overflow: auto;
  }
`;
