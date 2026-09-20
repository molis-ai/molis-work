export const PPT_STYLES = `
  .ppt-stage-chrome { pointer-events: auto; }
  .ppt-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 36px; padding: 6px 8px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .ppt-row:hover { background: var(--nav-hover); }
  .ppt-row.is-selected { background: var(--nav-active); }
  .ppt-row strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .ppt-row small { flex: none; color: var(--faint); font-size: 11px; }
  .ppt-workspace {
    display: flex; flex-direction: column; gap: 14px;
    flex: 1; min-height: 0; padding: 8px 20px 28px; overflow: auto;
  }
  .ppt-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .ppt-workspace > .ppt-field textarea.mw-textarea { min-height: 36px; max-height: 96px; padding-top: 7px; padding-bottom: 7px; resize: vertical; }
  .ppt-slide-editor textarea.mw-textarea { min-height: 72px; resize: vertical; }
  .ppt-colors { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--muted); }
  .ppt-colors label { display: flex; align-items: center; gap: 8px; }
  .ppt-colors input[type="color"] {
    width: 28px; height: 28px; padding: 0; border: 1px solid var(--control-input);
    border-radius: 6px; background: transparent; cursor: pointer;
  }
  .ppt-colors input[type="color"]::-webkit-color-swatch-wrapper { padding: 3px; }
  .ppt-colors input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 3px; }
  .ppt-split { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(280px, 1.2fr); gap: 16px; min-height: 0; }
  .ppt-slides { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .ppt-slides-head { display: flex; align-items: center; gap: 8px; }
  .ppt-slides-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .ppt-slides-head .mw-btn { flex: none; width: auto; }
  .ppt-slide-row { display: flex; align-items: center; gap: 4px; }
  .ppt-slide-row > button:first-child {
    flex: 1; min-width: 0; text-align: left; border: 0; background: transparent;
    color: inherit; font: inherit; padding: 6px 8px; border-radius: 6px; cursor: pointer;
  }
  .ppt-slide-row.is-selected > button:first-child { background: var(--nav-active); }
  .ppt-slide-editor {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .ppt-preview { display: flex; flex-direction: column; gap: 12px; overflow: auto; padding: 4px; }
  .ppt-card {
    aspect-ratio: 16 / 9; min-height: 140px; max-width: 100%; padding: 18px 20px; border-radius: 10px;
    border: 1px solid transparent; display: flex; flex-direction: column; justify-content: center; gap: 8px;
  }
  .ppt-card.is-current { box-shadow: 0 0 0 1px var(--focus); }
  .ppt-card h2 { margin: 0; font-size: 18px; font-weight: 500; }
  .ppt-card ul { margin: 0; padding-left: 18px; }
  .ppt-note { margin: 0; font-size: 12px; color: var(--muted); }
  .ppt-note.is-error { color: var(--red); }
  .plugin-stage-detail-bar [data-ppt-delete] { margin-left: auto; }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 900px) { .ppt-split { grid-template-columns: 1fr; } }
  body.immersive-workbench .plugin-stage-workspace > .ppt-workspace { flex: 1; min-height: 0; }
`;
