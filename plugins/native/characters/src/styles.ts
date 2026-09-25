export const CHARACTERS_STYLES = `
  .characters-import-dialog { width: min(62rem, calc(100vw - 32px)) !important; }
  .characters-dialog .mw-form__body { display: flex; flex-direction: column; gap: 14px; }
  .characters-dialog label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
  .characters-dialog select { min-height: 34px; }
  .characters-dialog textarea { width: 100%; min-height: 110px; }
  .characters-sources { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-sources button { white-space: normal; text-align: left; }
  .characters-sources button[aria-pressed="true"] { border-color: var(--accent); background: var(--hover); }
  .characters-import-item { padding: 10px 0; border-top: 1px solid var(--line); }
  .characters-import-item > label { flex-direction: row; align-items: center; color: var(--ink); }
  .characters-import-item small { display: block; overflow-wrap: anywhere; color: var(--muted); margin: 4px 0; }
  .characters-import-item pre { background: var(--paper); padding: 10px; font: 12px/1.65 ui-monospace, monospace; }
  .characters-location { font-size: 12px; }
  .characters-location label { margin-top: 12px; }
  .characters-run-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .characters-run-modes > section { border-top: 1px solid var(--line); padding-top: 10px; }
  .characters-run-modes h3 { font-size: 14px; margin: 8px 0; }
  .characters-source-detail, .characters-use { padding-top: 14px; border-top: 1px solid var(--line); }
  .characters-source-detail .characters-actions { justify-content: space-between; align-items: center; }
  .characters-source-detail details { font-size: 12px; margin: 8px 0; }
  .characters-source-detail pre, [data-character-run-output] { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 22rem; overflow: auto; font-size: 12px; line-height: 1.65; }
  .characters-terminal { height: 420px; min-width: 0; overflow: hidden; position: relative; background: var(--paper); }
  .characters-terminal .tui-xterm { position: absolute; inset: 0; }
  .characters-terminal-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; }
  [data-character-native-runs] { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  @media(max-width: 640px) { .characters-run-modes { grid-template-columns: 1fr; } .characters-terminal { height: 350px; } }
  .characters-editor { display: flex; flex-direction: column; gap: 18px; padding: 4px 20px 56px; max-width: 52rem; }
  .characters-editor label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .characters-editor textarea { min-height: 180px; resize: vertical; line-height: 1.65; }
  .characters-editor fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .characters-editor legend, .characters-editor h2 { font-size: 13px; font-weight: 400; color: var(--ink); margin: 0 0 8px; }
  .characters-editor .characters-check { flex-direction: row; align-items: center; }
  .characters-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-actions [data-character-delete] { color: var(--red); }
  .characters-actions [data-character-delete]:hover { color: var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); }
  .plugin-stage-list > .characters-hint { margin: 0 0 6px; padding-inline: 12px; }
  [data-character-reload] { align-self: flex-start; }
  .characters-hint, .characters-editor small { color: var(--muted); font-size: 12px; line-height: 1.6; }
  [data-character-list] > button { width: 100%; text-align: left; display: flex; justify-content: space-between; gap: 12px; margin: 4px 0; white-space: normal; }
  [data-character-list] small { flex: none; color: var(--muted); }
  .characters-notice { position: absolute; bottom: 0; left: 0; right: 0; margin: 0; padding: 8px 20px; background: var(--paper); color: var(--ink); font-size: 12px; z-index: 2; }
  .characters-notice:empty { display: none; }
  [data-character-publications] details { border-top: 1px solid var(--line); padding: 10px 0; font-size: 12px; }
  [data-character-publications] pre, .characters-dialog pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; line-height: 1.65; max-height: 45vh; overflow: auto; }
  .characters-dialog { width: min(42rem, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
  .characters-dialog p { font-size: 12px; color: var(--muted); }
  @media (max-width: 760px) { .characters-editor { padding: 4px 16px 72px; } .characters-actions > button { min-height: 44px; } }
`;
