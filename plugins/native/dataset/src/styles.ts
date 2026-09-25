export const DATASET_STYLES = `
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
  .dataset-stage-chrome { pointer-events: auto; }
  [data-dataset=workbench] { --plugin-tint: var(--plugin-dataset); }
  [data-dataset-stage-workspace] > .plugin-stage-detail-bar { min-width: 0; max-width: 100%; overflow-x: auto; }
  .dataset-workspace {
    display: flex; flex-direction: column; gap: 16px;
    flex: 1; min-height: 0; max-width: 72rem; padding: 8px 20px 28px; overflow: auto;
  }
  .dataset-workspace > * { flex-shrink: 0; }
  .dataset-identity {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px 16px; max-width: 52rem;
  }
  .dataset-identity [data-dataset-title] { font-size: 16px; letter-spacing: -0.02em; color: var(--ink); }
  .dataset-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .dataset-toolbar, .dataset-prompt {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  }
  .dataset-toolbar {
    padding: 8px 10px; border-radius: 10px;
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 6%, var(--rail));
  }
  .dataset-toolbar .mw-input { width: 140px; flex: none; }
  .dataset-toolbar .mw-select, .dataset-toolbar .mw-select-picker { width: 88px; flex: none; }
  .dataset-toolbar .mw-btn, .dataset-prompt .mw-btn, .dataset-panel .mw-btn { flex: none; width: auto; }
  .dataset-prompt { align-items: flex-end; max-width: 36rem; }
  .dataset-prompt .dataset-field { flex: 1 1 14rem; min-width: min(100%, 14rem); }
  .dataset-table-wrap {
    width: max-content; max-width: 100%; overflow: auto;
    padding: 10px; border-radius: 10px;
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .dataset-table-wrap tbody tr { transition: background-color var(--motion-fast, 130ms) ease; }
  .dataset-table-wrap tbody tr:hover td { background: color-mix(in srgb, var(--plugin-dataset, var(--ink)) 6%, transparent); }
  .dataset-table-wrap:has([data-dataset-table-empty]:not([hidden])),
  .dataset-table-wrap:has([data-dataset-filter-empty]:not([hidden])) { width: min(100%, 28rem); }
  .dataset-table-empty { margin: 4px 6px; font-size: 13px; color: var(--muted); }
  .dataset-table-empty[hidden] { display: none; }
  .dataset-table-wrap .mw-table { width: auto; min-width: 0; table-layout: fixed; }
  .dataset-table-wrap .mw-table th,
  .dataset-table-wrap .mw-table td {
    width: 240px; min-width: 240px; max-width: 280px; padding: 4px 6px; vertical-align: middle;
    border: 1px solid var(--line);
  }
  .dataset-table-wrap .mw-table thead th {
    padding-bottom: 4px;
    background: color-mix(in srgb, var(--paper) 55%, transparent);
  }
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
  .dataset-table-wrap .mw-table th:last-child,
  .dataset-table-wrap .mw-table td:last-child { width: 36px; min-width: 36px; max-width: 36px; padding-left: 2px; }
  .dataset-col-head {
    display: grid; grid-template-columns: minmax(0, 1fr) 72px auto;
    gap: 4px; align-items: center;
  }
  .dataset-col-type, .dataset-col-head .mw-select-picker { width: 72px; min-width: 72px; font-size: 12px; }
  .dataset-col-head .mw-select-picker__trigger { font-size: 12px; }
  .dataset-panel { border: 0; padding: 0; max-width: 36rem; }
  .dataset-panel > summary { display: inline-flex; align-items: center; gap: 6px; list-style: none; cursor: pointer; font-size: 12px; color: var(--muted); }
  .dataset-panel > summary::-webkit-details-marker, .dataset-panel > summary::marker { display: none; }
  .dataset-panel > summary:hover { color: var(--ink); }
  .dataset-panel > summary svg { width: 12px; height: 12px; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); }
  .dataset-panel:not([open]) > summary svg { transform: rotate(-90deg); }
  .dataset-panel[open] > summary { margin-bottom: 8px; }
  .dataset-panel .mw-textarea { margin-bottom: 8px; min-height: 72px; resize: vertical; }
  .dataset-panel .mw-btn { flex: none; width: auto; }
  .dataset-versions { display: flex; flex-direction: column; gap: 8px; max-width: 36rem; padding-top: 12px; border-top: 1px solid var(--line); }
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
  .plugin-stage-list .mw-empty { max-width: min(100%, 30em); padding: 8px 8px 16px; }
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
