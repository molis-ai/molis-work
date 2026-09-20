export const DATASET_STYLES = `
  .dataset-stage-chrome { pointer-events: auto; }
  .dataset-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 36px; padding: 6px 8px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .dataset-row:hover { background: var(--nav-hover); }
  .dataset-row.is-selected { background: var(--nav-active); }
  .dataset-row strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .dataset-row small { flex: none; color: var(--faint); font-size: 11px; }
  .dataset-workspace {
    display: flex; flex-direction: column; gap: 14px;
    flex: 1; min-height: 0; padding: 8px 20px 28px; overflow: auto;
  }
  .dataset-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .dataset-field textarea.mw-textarea { min-height: 36px; max-height: 96px; padding-top: 7px; padding-bottom: 7px; resize: vertical; }
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
    padding: 8px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .dataset-table-wrap:has([data-dataset-table-empty]:not([hidden])) { width: min(100%, 28rem); }
  .dataset-table-empty { margin: 4px 6px; font-size: 13px; color: var(--muted); }
  .dataset-table-empty[hidden] { display: none; }
  .dataset-table-wrap table { width: auto; min-width: 0; table-layout: fixed; }
  .dataset-table-wrap th, .dataset-table-wrap td { width: 240px; max-width: 280px; padding: 4px 6px; vertical-align: middle; }
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
  .dataset-note { margin: 0; font-size: 12px; color: var(--muted); }
  .dataset-note.is-error { color: var(--red); }
  .plugin-stage-detail-bar [data-dataset-delete] { margin-left: auto; }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .plugin-stage-workspace > .dataset-workspace { flex: 1; min-height: 0; }
`;
