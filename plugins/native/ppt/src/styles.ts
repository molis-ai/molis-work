export const PPT_STYLES = `
  .ppt-stage-chrome { pointer-events: auto; }
  [data-ppt=workbench] { --plugin-tint: var(--plugin-ppt); }
  .ppt-workspace {
    display: flex; flex-direction: column; gap: 16px;
    flex: 1; min-height: 0; max-width: 72rem; padding: 8px 20px 28px; overflow: auto;
  }
  .ppt-meta {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) auto;
    gap: 12px 16px; align-items: end;
  }
  .ppt-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .ppt-meta [data-ppt-title] { font-size: 16px; letter-spacing: -0.02em; color: var(--ink); }
  .ppt-slide-editor textarea.mw-textarea { field-sizing: content; min-height: 72px; max-height: 220px; resize: vertical; }
  .ppt-slide-editor textarea[data-ppt-slide-notes] { min-height: 48px; max-height: 120px; }
  .ppt-colors { display: flex; flex-wrap: wrap; gap: 12px 16px; padding-bottom: 2px; font-size: 12px; color: var(--muted); }
  .ppt-color-field { display: flex; flex-direction: column; gap: 6px; }
  .ppt-swatches { display: flex; flex-wrap: wrap; gap: 6px; }
  .ppt-swatch {
    width: 22px; height: 22px; padding: 0; border: 1px solid var(--line); border-radius: 6px;
    cursor: pointer; box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 35%, transparent);
  }
  .ppt-swatch[aria-checked="true"] { box-shadow: 0 0 0 2px var(--action); }
  .ppt-split { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(280px, 1.2fr); gap: 16px; min-height: 0; }
  .ppt-slides { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .ppt-slides-head { display: flex; align-items: center; gap: 8px; }
  .ppt-slides-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .ppt-slides-head .mw-btn { flex: none; width: auto; }
  [data-ppt-slide-list] { display: flex; flex-direction: column; gap: 2px; }
  .ppt-slide-row { display: flex; align-items: center; gap: 4px; }
  .ppt-slide-row > button:first-child {
    display: flex; align-items: center; gap: 8px;
    flex: 1; min-width: 0; text-align: left; border: 0; background: transparent;
    color: inherit; font: inherit; padding: 6px 8px; border-radius: 6px; cursor: pointer;
    transition: background-color var(--motion-fast, 130ms) ease;
  }
  .ppt-slide-row > button:first-child:hover { background: var(--nav-hover); }
  .ppt-slide-row.is-selected > button:first-child {
    background: color-mix(in srgb, var(--plugin-ppt, var(--ink)) 12%, transparent);
  }
  .ppt-slide-index {
    display: inline-grid; place-items: center; flex: none;
    width: 18px; height: 18px; border-radius: 5px;
    font-size: 11px; font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--plugin-ppt, var(--ink)) 12%, transparent);
    color: var(--plugin-ppt, var(--muted));
  }
  .ppt-slide-row.is-selected .ppt-slide-index {
    background: color-mix(in srgb, var(--plugin-ppt, var(--ink)) 22%, transparent);
    color: var(--ink);
  }
  .ppt-slide-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ppt-slide-editor {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .ppt-preview { display: flex; flex-direction: column; gap: 16px; overflow: auto; padding: 4px; }
  .ppt-preview-item { display: flex; flex-direction: column; gap: 8px; }
  .ppt-card-notes { margin: 0 0 4px; padding: 0 4px; font-size: 12px; color: var(--muted); }
  .ppt-card {
    aspect-ratio: 16 / 9; min-height: 140px; max-width: 100%; padding: 18px 20px; border-radius: 10px;
    border: 1px solid transparent; display: flex; flex-direction: column; justify-content: center; gap: 8px;
    transition: box-shadow var(--motion-fast, 130ms) ease;
  }
  .ppt-card.is-current {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--plugin-ppt, var(--focus)) 72%, var(--focus));
  }
  .ppt-card h2 { margin: 0; font-size: 18px; font-weight: 500; }
  .ppt-card ul { margin: 0; padding-left: 18px; }
  .ppt-card-empty { margin: 0; font-size: 13px; font-weight: 400; color: var(--muted); }
  .ppt-note { margin: 0; font-size: 12px; color: var(--tone-done, var(--muted)); }
  .ppt-note.is-error { color: var(--red); }
  .plugin-stage-detail-bar [data-ppt-editor-status].mw-status {
    flex: none; color: var(--status-tone, var(--muted)); font-size: 11px;
  }
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
  @media (max-width: 900px) { .ppt-split { grid-template-columns: 1fr; } }
  @media (max-width: 720px) { .ppt-meta { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) {
    .is-arriving, .plugin-stage-workspace.is-arriving { animation: none; }
    .ppt-slide-row > button:first-child, .ppt-card, .ppt-swatch { transition: none; }
  }
  body.immersive-workbench .plugin-stage-workspace > .ppt-workspace { flex: 1; min-height: 0; }
`;
