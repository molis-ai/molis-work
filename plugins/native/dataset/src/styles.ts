export const DATASET_STYLES = `
  .dataset-stage-chrome { pointer-events: auto; }
  [data-dataset=workbench] { --plugin-tint: var(--plugin-dataset); }
  .dataset-workspace {
    display: flex; flex-direction: column; gap: 16px;
    flex: 1; min-height: 0; max-width: 72rem; padding: 8px 20px 28px; overflow: auto;
  }
  .dataset-identity {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px 16px; max-width: 52rem;
  }
  .dataset-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .dataset-toolbar, .dataset-prompt {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  }
  .dataset-toolbar .mw-input { width: 140px; flex: none; }
  .dataset-toolbar .mw-select { width: 88px; flex: none; }
  .dataset-toolbar .mw-btn, .dataset-prompt .mw-btn, .dataset-panel .mw-btn { flex: none; width: auto; }
  .dataset-prompt { align-items: flex-end; max-width: 36rem; }
  .dataset-prompt .dataset-field { flex: 1; min-width: 0; }
  .dataset-table-wrap {
    width: max-content; max-width: 100%; overflow: auto;
    padding: 10px; border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .dataset-table-wrap tbody tr { transition: background-color var(--motion-fast, 130ms) ease; }
  .dataset-table-wrap tbody tr:hover td { background: color-mix(in srgb, var(--plugin-dataset, var(--ink)) 6%, transparent); }
  .dataset-table-wrap:has([data-dataset-table-empty]:not([hidden])),
  .dataset-table-wrap:has([data-dataset-filter-empty]:not([hidden])) { width: min(100%, 28rem); }
  .dataset-table-empty { margin: 4px 6px; font-size: 13px; color: var(--muted); }
  .dataset-table-empty[hidden] { display: none; }
  .dataset-table-wrap table { width: auto; min-width: 0; table-layout: fixed; }
  .dataset-table-wrap th, .dataset-table-wrap td { width: 240px; max-width: 280px; padding: 4px 6px; vertical-align: middle; }
  .dataset-table-wrap tbody tr + tr td { border-top: 1px solid var(--line); }
  .dataset-table-wrap td .mw-input {
    background: transparent; border-color: transparent; box-shadow: none;
  }
  .dataset-table-wrap td .mw-input:hover:not(:disabled):not(:focus-visible) {
    border-color: var(--control-input); background: var(--paper);
  }
  .dataset-table-wrap td .mw-input:focus-visible { background: var(--paper); }
  .dataset-table-wrap td .mw-input[type="number"]::-webkit-outer-spin-button,
  .dataset-table-wrap td .mw-input[type="number"]::-webkit-inner-spin-button { appearance: none; margin: 0; }
  .dataset-table-wrap td .mw-input[type="number"] { appearance: textfield; }
  .dataset-table-wrap th:last-child, .dataset-table-wrap td:last-child { width: 36px; max-width: 36px; padding-left: 2px; }
  .dataset-col-head {
    display: grid; grid-template-columns: minmax(0, 1fr) 72px auto;
    gap: 4px; align-items: center;
  }
  .dataset-col-type { width: 72px; min-width: 72px; font-size: 12px; }
  .dataset-panel { border: 0; padding: 0; max-width: 36rem; }
  .dataset-panel > summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .dataset-panel[open] > summary { margin-bottom: 8px; }
  .dataset-panel .mw-textarea { margin-bottom: 8px; min-height: 72px; resize: vertical; }
  .dataset-panel .mw-btn { flex: none; width: auto; }
  .dataset-versions { display: flex; flex-direction: column; gap: 8px; max-width: 36rem; }
  .dataset-versions-head { display: flex; align-items: center; gap: 8px; }
  .dataset-versions-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .dataset-versions-head .mw-input { width: 180px; flex: none; }
  .dataset-versions-head .mw-btn { flex: none; width: auto; }
  .dataset-version { display: flex; align-items: center; gap: 8px; width: max-content; max-width: 100%; font-size: 12px; }
  .dataset-version span { flex: none; color: var(--muted); }
  .dataset-note { margin: 0; font-size: 12px; color: var(--tone-done, var(--muted)); }
  .dataset-note.is-error { color: var(--red); }
  .plugin-stage-detail-bar [data-dataset-editor-status].mw-status {
    flex: none; color: var(--status-tone, var(--muted)); font-size: 11px;
  }
  .plugin-stage-detail-bar [data-dataset-delete] { margin-left: auto; }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .plugin-stage-workspace.is-arriving,
  .is-arriving { animation: creative-arrive var(--motion-normal, 190ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)) both; }
  @keyframes creative-arrive {
    from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
    to { opacity: 1; transform: none; filter: none; }
  }
  @media (max-width: 720px) { .dataset-identity { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) {
    .is-arriving, .plugin-stage-workspace.is-arriving { animation: none; }
    .dataset-table-wrap tbody tr { transition: none; }
  }
  body.immersive-workbench .plugin-stage-workspace > .dataset-workspace { flex: 1; min-height: 0; }
`;
