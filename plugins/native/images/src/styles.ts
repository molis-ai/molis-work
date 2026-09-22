export const IMAGES_STYLES = `
  [data-images=workbench] { --plugin-tint: var(--ink); }
  .images-workspace-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 12px 24px 28px; }
  .images-compose, .images-result { width: 100%; max-width: 760px; margin: 0 auto; }
  .images-compose { display: flex; flex-direction: column; gap: 20px; padding-top: 14px; }
  .images-intro h2 { font-size: 23px; font-weight: 400; letter-spacing: -.025em; margin: 0 0 8px; color: var(--ink); }
  .images-intro p, .images-help { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.65; }
  .images-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; font-size: 12px; color: var(--ink-soft); }
  .images-field-label { display: block; margin-bottom: 7px; color: var(--ink-soft); font-size: 12px; }
  .images-field small { color: var(--muted); font-size: 11px; line-height: 1.5; }
  .images-prompt.mw-textarea { min-height: 170px; resize: vertical; width: 100%; font-size: 14px; line-height: 1.7; }
  .images-parameters { max-width: 360px; }
  .images-connection-empty { padding: 14px 0; border-block: 1px solid var(--line); }
  .images-connection-empty p { margin: 0 0 12px; font-size: 13px; color: var(--muted); line-height: 1.6; }
  .images-submit-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .images-submit-row p { max-width: 46ch; font-size: 11px; line-height: 1.6; color: var(--muted); margin: 0; }
  .images-submit-row > button { flex: none; min-height: 36px; }
  .images-note { margin: 12px 0 0; font-size: 12px; line-height: 1.6; color: var(--muted); overflow-wrap: anywhere; }
  .images-note.is-error { color: var(--red); }
  .images-workspace-body > .images-note { max-width: 760px; margin: 14px auto 0; }
  .images-history-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 10px; font-size: 11px; color: var(--muted); }
  body.immersive-workbench [data-images=workbench] .images-history-row.feed-stage-entry { display: flex; width: 100%; gap: 10px; min-height: 58px; padding: 8px; align-items: center; text-align: left; }
  .images-history-thumb { flex: none; width: 38px; height: 38px; object-fit: cover; border-radius: 4px; background: var(--rail); }
  .images-history-thumb-placeholder { display: grid; place-items: center; color: var(--muted); }
  .images-history-thumb-placeholder svg { width: 17px; height: 17px; }
  .images-history-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .images-history-copy strong { font-size: 12px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .images-history-copy small { font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .images-service-menu { position: relative; }
  .images-service-menu summary { justify-content: space-between; width: 100%; list-style: none; cursor: pointer; min-height: 36px; gap: 12px; }
  .images-service-menu summary::-webkit-details-marker { display: none; }
  .images-service-menu summary > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .images-service-menu summary svg { width: 14px; height: 14px; flex: none; }
  .images-service-options { position: absolute; z-index: 15; inset: calc(100% + 4px) 0 auto; max-height: 240px; overflow: auto; padding: 4px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); box-shadow: var(--control-shadow); }
  .images-service-option { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; min-width: 0; border: 0; padding: 8px; border-radius: 4px; background: transparent; color: var(--ink); font: inherit; cursor: pointer; text-align: left; }
  .images-service-option:hover, .images-service-option[aria-pressed=true] { background: var(--nav-hover); }
  .images-service-option small { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .images-result-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 0; }
  .images-result-heading h2 { margin: 0; font-size: 16px; font-weight: 400; }
  .images-result-meta { margin: 0 0 18px; font-size: 12px; color: var(--muted); line-height: 1.7; overflow-wrap: anywhere; }
  .images-result-prompt { margin: 18px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.7; color: var(--ink-soft); }
  .images-result-image { display: block; max-width: 100%; max-height: 62vh; margin: 0 auto; object-fit: contain; border-radius: 6px; background: var(--rail); }
  .images-result figure { margin: 16px 0; }
  .images-result figcaption { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; font-size: 11px; color: var(--muted); }
  .images-status-panel { padding: 28px 0; border-block: 1px solid var(--line); }
  .images-status-panel p { margin: 8px 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
  .images-status-panel[data-status=running] > p:first-child { color: var(--blue); }
  .images-status-panel[data-status=failed] > p:first-child { color: var(--red); }
  .images-status-panel small { display: block; color: var(--muted); line-height: 1.65; margin-bottom: 12px; }
  .images-actions, .images-presets, .images-protocols, .images-saved-connections { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .images-presets .mw-btn[aria-pressed=true], .images-protocols .mw-btn[aria-pressed=true], .images-saved-connections .mw-btn[aria-pressed=true] { background: var(--nav-active); color: var(--ink); }
  dialog.mw-dialog.images-connections-dialog { width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 32px); padding: 0; }
  .images-connections-dialog > form { display: flex; flex-direction: column; max-height: calc(100dvh - 32px); }
  .images-dialog-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .images-dialog-header h2 { margin: 0; font-size: 15px; font-weight: 400; }
  .images-dialog-body { overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 16px; padding: 18px 20px; }
  .images-connection-fields { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; border: 0; min-width: 0; }
  .images-connection-fields legend { margin-bottom: 12px; padding: 0; font-size: 13px; color: var(--ink-soft); }
  .images-dialog-footer { display: flex; flex-direction: column; gap: 12px; flex: none; padding: 12px 20px 16px; border-top: 1px solid var(--line); }
  .images-dialog-footer > .images-note { margin: 0; }
  .images-dialog-footer .images-actions { justify-content: flex-end; }
  .images-dialog-footer .images-actions > .mw-btn--primary { min-height: 36px; }
  .images-service-option:focus-visible, .images-service-menu summary:focus-visible, [data-images=workbench] .plugin-stage-back:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  @media (max-width: 760px), (pointer: coarse) {
    [data-images=workbench] .mw-btn, .images-service-option, [data-images=workbench] .plugin-stage-back { min-height: 44px; }
    [data-images=workbench] .plugin-stage-back { min-width: 44px; }
    .images-workspace-body { padding: 8px 16px 24px; }
    .images-compose { gap: 18px; padding-top: 8px; }
    .images-intro h2 { font-size: 21px; }
    .images-field .mw-input, .images-prompt.mw-textarea { font-size: 16px; }
    .images-submit-row { flex-direction: column; align-items: stretch; gap: 12px; }
    .images-submit-row p { max-width: none; }
    .images-parameters { max-width: none; }
    .images-dialog-body, .images-dialog-header, .images-dialog-footer { padding-inline: 16px; }
  }
`;
