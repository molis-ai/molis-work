export const FORM_STYLES = `
  .form-stage-chrome { pointer-events: auto; }
  .form-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 36px; padding: 6px 8px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .form-row:hover { background: var(--nav-hover); }
  .form-row.is-selected { background: var(--nav-active); }
  .form-row strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .form-row small { flex: none; color: var(--faint); font-size: 11px; }
  .form-tabs { display: flex; gap: 4px; margin-left: auto; }
  .form-tabs .mw-btn.is-current { background: var(--nav-active); color: var(--ink); }
  .form-workspace {
    display: flex; flex-direction: column; gap: 14px;
    flex: 1; min-height: 0; padding: 8px 20px 20px; overflow: auto;
  }
  .form-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .form-field textarea.mw-textarea { min-height: 36px; max-height: 96px; padding-top: 7px; padding-bottom: 7px; resize: vertical; }
  .form-toolbar, .form-prompt, .form-actions, .form-question-move {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  }
  .form-toolbar strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .form-toolbar .mw-select { width: 112px; flex: none; }
  .form-toolbar .mw-btn, .form-prompt .mw-btn, .form-actions .mw-btn { flex: none; width: auto; align-self: center; }
  .form-prompt { align-items: flex-end; max-width: 36rem; }
  .form-prompt .form-field { flex: 1; min-width: 0; }
  [data-form-questions] { display: flex; flex-direction: column; gap: 10px; }
  .form-question {
    display: grid; grid-template-columns: minmax(0, 1fr) 112px auto auto auto;
    gap: 8px; align-items: center;
    padding: 10px 10px 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .form-question > label { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .form-question-options { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .form-option-list { display: flex; flex-direction: column; gap: 6px; width: min(100%, 28rem); }
  .form-option-row { display: flex; align-items: center; gap: 6px; width: 100%; }
  .form-option-row .mw-input { flex: 1; min-width: 0; width: auto; }
  .form-question-options .mw-btn { flex: none; width: auto; }
  [data-form-pane=preview] .form-field > span:first-child { color: var(--ink); font-size: 13px; }
  [data-form-pane=preview] .mw-input { max-width: 36rem; }
  .form-preview-options { display: flex; flex-direction: column; gap: 8px; }
  .form-preview-option {
    display: flex; align-items: center; gap: 8px;
    color: var(--ink); font-size: 13px; font-weight: 400;
  }
  .form-preview-hint { font-size: 11px; color: var(--faint); }
  .form-preview-empty, [data-form-result-summary] { margin: 0; font-size: 13px; color: var(--ink); }
  .form-result {
    display: flex; flex-direction: column; gap: 8px;
    max-width: 36rem; padding: 12px 14px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .form-result strong { font-size: 12px; font-weight: 500; color: var(--muted); }
  .form-result p {
    display: grid; grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr);
    gap: 12px; margin: 0; font-size: 13px;
  }
  .form-result p span:first-child { color: var(--muted); }
  .form-result p span:last-child { color: var(--ink); overflow-wrap: anywhere; }
  .form-export-panel { max-width: 36rem; }
  .form-export-panel summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .form-note { margin: 0 20px 16px; font-size: 12px; color: var(--muted); }
  .form-note.is-error { color: var(--red); }
  .form-export { margin: 8px 0 0; padding: 12px; border-radius: 8px; background: var(--rail); white-space: pre-wrap; font-size: 12px; }
  .plugin-stage-detail-bar [data-form-delete] { margin-left: 8px; }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .plugin-stage-workspace > .form-workspace { flex: 1; min-height: 0; }
`;
