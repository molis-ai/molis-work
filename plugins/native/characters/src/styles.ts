export const CHARACTERS_STYLES = `
  .characters-editor { display: flex; flex-direction: column; gap: 18px; padding: 4px 20px 56px; max-width: 52rem; }
  .characters-editor label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .characters-editor textarea { min-height: 180px; resize: vertical; line-height: 1.65; }
  .characters-editor fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .characters-editor legend, .characters-editor h2 { font-size: 13px; font-weight: 400; color: var(--ink); margin: 0 0 8px; }
  .characters-editor .characters-check { flex-direction: row; align-items: center; }
  .characters-actions { display: flex; flex-wrap: wrap; gap: 8px; }
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
