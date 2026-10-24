/** The import dialog's styles; composed into the Pages stylesheet by the package entry. */
export const PAGES_IMPORT_STYLES = `
  .pages-import-trigger { margin-left: auto; flex-shrink: 0; }
  .mw-dialog.pages-import-dialog { width: min(660px, calc(100vw - 32px)); max-width: calc(100vw - 32px); max-height: calc(100dvh - 48px); padding: 0; overflow: auto; }
  .pages-import-content { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .pages-import-content h2 { margin: 0 0 8px; font-size: 24px; letter-spacing: -.02em; }
  .pages-import-content p { margin: 0; line-height: 1.6; }
  .pages-import-content header p, .pages-import-help, .pages-import-limit { color: var(--muted); font-size: 13px; }
  .pages-import-field { display: flex; align-items: center; gap: 12px; font-size: 13px; white-space: nowrap; }
  .pages-import-field select { flex: 1; min-width: 0; }
  .pages-import-drop { position: relative; display: flex; align-items: center; flex-direction: column; gap: 8px; padding: 24px 16px; border: 1px dashed var(--line-strong, var(--line)); border-radius: 10px; background: var(--rail); text-align: center; cursor: pointer; }
  .pages-import-drop svg { width: 20px; height: 20px; color: var(--muted); stroke-width: 1.6; }
  .pages-import-drop span, .pages-import-drop small { color: var(--muted); font-size: 12px; }
  .pages-import-drop input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .pages-import-drop:focus-within, .pages-import-drop.is-dragover { outline: 2px solid var(--ink); outline-offset: 2px; }
  .pages-import-drop:has(input:disabled) { opacity: .6; cursor: default; }
  .pages-import-status { font-size: 13px; color: var(--muted); }
  .pages-import-status:empty { display: none; }
  .pages-import-status.is-error { color: var(--danger, #b23c31); }
  .pages-import-options { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; font-size: 13px; }
  .pages-import-options .pages-import-field { max-width: 70%; }
  .pages-import-documents { border-top: 1px solid var(--line); max-height: 36vh; overflow: auto; }
  .pages-import-document { padding: 12px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .pages-import-document > label { display: flex; align-items: baseline; gap: 12px; cursor: pointer; }
  .pages-import-document strong { font-size: 15px; }
  .pages-import-document > small { display: block; margin: 4px 0 8px 24px; color: var(--muted); font-size: 11px; }
  .pages-import-document details { margin-left: 24px; font-size: 12px; color: var(--muted); }
  .pages-import-document summary { cursor: pointer; }
  .pages-import-body { margin-top: 8px; max-height: 180px; overflow: auto; white-space: pre-wrap; color: var(--ink); line-height: 1.7; }
  .pages-import-warnings { margin: 8px 0; padding-left: 24px; color: var(--muted); font-size: 12px; line-height: 1.6; }
  .pages-import-content footer { padding-top: 4px; }
  .pages-import-content [hidden] { display: none !important; }
  @media (max-width: 520px) {
    .pages-import-content { padding: 16px; }
    .pages-import-options { align-items: stretch; flex-direction: column; }
    .pages-import-options .pages-import-field { max-width: none; }
  }
`;
