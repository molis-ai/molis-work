export const FORM_STYLES = `
  .creative-artifact-row { display: flex; align-items: center; min-width: 0; }
  body.immersive-workbench .creative-artifact-row > .feed-stage-entry { flex: 1 1 auto; min-width: 0; width: auto; }
  .creative-artifact-act {
    display: inline-flex; align-items: center; flex: none; height: 28px; max-width: 28px;
    margin-right: 4px; padding: 0; overflow: hidden; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer;
    transition: max-width var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      background-color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .creative-artifact-act svg { width: 14px; height: 14px; flex: none; margin: 0 7px; }
  .creative-artifact-act span { overflow: hidden; white-space: nowrap; font-size: 12px; line-height: 28px; padding-right: 8px; }
  .creative-artifact-act:hover, .creative-artifact-act:focus-visible {
    max-width: 11rem; color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, var(--paper));
  }
  @media (prefers-reduced-motion: reduce) { .creative-artifact-act { transition: none; } }
  .form-stage-chrome { pointer-events: auto; }
  [data-form=workbench] { --plugin-tint: var(--plugin-form); }
  [data-form-stage-workspace] > .plugin-stage-detail-bar { min-width: 0; max-width: 100%; overflow-x: auto; }
  .form-workspace > * { flex-shrink: 0; }
  [data-form-stage-workspace] > .form-note { flex-shrink: 0; }
  .form-tabs { display: flex; gap: 4px; margin-left: auto; }
  .form-tabs [data-form-tab=editor] { --tab-tone: var(--plugin-form, var(--tone-idle)); }
  .form-tabs [data-form-tab=preview] { --tab-tone: var(--tone-progress); }
  .form-tabs [data-form-tab=results] { --tab-tone: var(--tone-done); }
  .form-tabs .mw-btn { transition: background-color var(--motion-fast, 130ms) ease, color var(--motion-fast, 130ms) ease; }
  .form-tabs .mw-btn.is-current {
    background: color-mix(in srgb, var(--tab-tone) 16%, var(--paper));
    color: var(--tab-tone);
  }
  .form-workspace {
    display: flex; flex-direction: column; gap: 16px;
    flex: 1; min-height: 0; max-width: 52rem; padding: 8px 20px 20px; overflow: auto; overscroll-behavior: contain;
  }
  .form-identity {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px 16px;
  }
  .form-identity [data-form-title] { font-size: 16px; letter-spacing: -0.02em; color: var(--ink); }
  .form-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .form-toolbar, .form-prompt, .form-actions, .form-question-move {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  }
  .form-toolbar {
    padding: 8px 10px; border-radius: 10px;
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 6%, var(--rail));
  }
  .form-toolbar strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .form-toolbar .mw-select, .form-toolbar .mw-select-picker { width: 112px; flex: none; }
  .form-toolbar .mw-btn, .form-prompt .mw-btn, .form-actions .mw-btn { flex: none; width: auto; align-self: center; }
  .form-actions:has([data-form-submit][hidden]) { display: none; }
  .form-prompt { align-items: flex-end; max-width: 36rem; }
  .form-prompt .form-field { flex: 1 1 14rem; min-width: min(100%, 14rem); }
  [data-form-questions] { display: flex; flex-direction: column; gap: 10px; }
  .form-question .mw-select-picker { width: 100%; min-width: 0; }
  .form-question {
    display: grid; grid-template-columns: minmax(0, 1fr) 112px auto auto auto;
    gap: 8px; align-items: center; width: 100%;
    padding: 10px 10px 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
    transition: background-color var(--motion-fast, 130ms) ease;
  }
  .form-question:hover { background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 8%, var(--rail)); }
  .form-question > label { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .form-question-options { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .form-option-list { display: flex; flex-direction: column; gap: 6px; width: min(100%, 28rem); }
  .form-option-row { display: flex; align-items: center; gap: 6px; width: 100%; }
  .form-option-row .mw-input { flex: 1; min-width: 0; width: auto; }
  .form-question-options .mw-btn { flex: none; width: auto; }
  [data-form-pane=preview], [data-form-pane=results] { max-width: 40rem; }
  [data-form-pane]:not([hidden]) { animation: creative-pane var(--motion-normal, 190ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)); }
  [data-form-preview] {
    display: flex; flex-direction: column; gap: 20px;
    padding: 20px 22px; border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
  }
  [data-form-pane=preview] .form-field { gap: 8px; }
  [data-form-pane=preview] .form-field > span:first-child { color: var(--ink); font-size: 13px; }
  .form-preview-options { display: flex; flex-direction: column; gap: 4px; }
  .form-preview-rating { flex-direction: row; flex-wrap: wrap; gap: 8px 12px; }
  .form-preview-option {
    display: flex; align-items: center; gap: 8px;
    margin: 0 -8px; padding: 6px 8px; border-radius: 6px; cursor: pointer;
    color: var(--ink); font-size: 13px; font-weight: 400;
    transition: background-color var(--motion-fast, 130ms) ease;
  }
  .form-preview-option:hover, .form-preview-option:has(:focus-visible) {
    background: color-mix(in srgb, var(--plugin-form, var(--ink)) 8%, transparent);
  }
  .form-question .mw-check-row { font-size: 12px; color: var(--muted); gap: 6px; align-items: center; }
  .form-preview-option .mw-check, .form-preview-option .mw-radio,
  .form-question .mw-check {
    width: 16px; height: 16px; margin: 0;
    border-color: var(--muted);
    background: var(--paper);
  }
  .form-preview-empty, [data-form-result-summary] { margin: 0; font-size: 13px; color: var(--ink); }
  [data-form-result-list] { display: flex; flex-direction: column; gap: 10px; }
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
  .form-result p.form-result-legacy { display: block; color: var(--muted); line-height: 1.5; }
  .form-export-panel { max-width: 36rem; }
  .form-export-panel summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .form-note { margin: 0 20px 16px; max-width: 40rem; font-size: 12px; color: var(--tone-done, var(--muted)); }
  .form-note.is-error { color: var(--red); }
  .form-export { margin: 8px 0 0; padding: 12px; border-radius: 8px; background: var(--rail); white-space: pre-wrap; font-size: 12px; }
  .plugin-stage-detail-bar [data-form-editor-status].mw-status {
    flex: none; color: var(--status-tone, var(--muted)); font-size: 11px;
  }
  .plugin-stage-detail-bar [data-form-delete] { margin-left: 8px; }
  .plugin-stage-list .mw-empty { max-width: min(100%, 30em); padding: 8px 8px 16px; }
  .plugin-stage-workspace.is-arriving,
  .is-arriving { animation: creative-arrive var(--motion-normal, 190ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)) both; }
  @keyframes creative-arrive {
    from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
    to { opacity: 1; transform: none; filter: none; }
  }
  @keyframes creative-pane {
    from { transform: translateY(4px); }
    to { transform: none; }
  }
  @media (max-width: 720px) {
    .form-identity { grid-template-columns: 1fr; }
    .form-question { grid-template-columns: minmax(0, 1fr) auto auto; }
    .form-question > [data-question-title] { grid-column: 1 / -1; min-width: 0; }
    .form-question > .mw-select, .form-question > .mw-select-picker { grid-column: 1; }
    .form-question > .mw-check-row { grid-column: 2 / -1; min-height: 44px; }
    .form-question-move { grid-column: 1 / 3; }
    .form-question [data-question-move], .form-question [data-question-remove],
    .form-question [data-option-remove] { min-width: 44px; min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .is-arriving, .plugin-stage-workspace.is-arriving, [data-form-pane]:not([hidden]) { animation: none; }
    .form-question, .form-tabs .mw-btn, .form-preview-option { transition: none; }
  }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .plugin-stage-workspace > .form-workspace { flex: 1; min-height: 0; }
`;
