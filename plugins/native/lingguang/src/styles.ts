export const LINGGUANG_STYLES = `
  .lingguang-stage-chrome { pointer-events: auto; display: flex; align-items: center; gap: 8px; }
  .lingguang-stage-chrome [data-lingguang-count] { margin-right: auto; font-size: 12px; color: var(--muted); }
  .lingguang-stage-chrome .mw-btn { flex: none; width: auto; }
  [data-lingguang-rows] { display: flex; flex-direction: column; gap: 6px; padding: 0 8px 8px; }
  .lingguang-row {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px; align-items: start;
    padding: 8px; border-radius: 8px;
    background: transparent; color: inherit;
  }
  .lingguang-row:hover { background: var(--nav-hover); }
  .lingguang-row.is-expanded {
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .lingguang-row__check { margin-top: 4px; }
  .lingguang-row__main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .lingguang-row__open {
    display: flex; flex-direction: column; gap: 2px; width: 100%;
    padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .lingguang-row__open strong {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400;
  }
  .lingguang-row__open small { color: var(--faint); font-size: 11px; }
  .lingguang-row .mw-btn { flex: none; width: auto; }
  .lingguang-editor { display: flex; flex-direction: column; gap: 8px; }
  .lingguang-composer, .lingguang-chat-form, .lingguang-selection-bar, .lingguang-field {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px;
  }
  .lingguang-composer { padding: 8px 8px 12px; }
  .lingguang-field { flex: 1; min-width: 0; flex-direction: column; align-items: stretch; gap: 6px; font-size: 12px; color: var(--muted); }
  .lingguang-composer .mw-btn, .lingguang-chat-form .mw-btn, .lingguang-selection-bar .mw-btn { flex: none; width: auto; align-self: flex-end; }
  .lingguang-selection-bar {
    position: sticky; bottom: 0; align-items: center;
    padding: 8px; border-top: 1px solid var(--line);
    background: var(--paper);
  }
  .lingguang-selection-bar span { margin-right: auto; font-size: 12px; color: var(--muted); }
  .lingguang-chat {
    display: flex; flex-direction: column; gap: 14px;
    flex: 1; min-height: 0; padding: 8px 20px 20px; overflow: auto;
  }
  .lingguang-context, .lingguang-message {
    padding: 10px 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 82%, var(--paper));
  }
  .lingguang-context { display: flex; flex-direction: column; gap: 10px; }
  .lingguang-context article { display: flex; flex-direction: column; gap: 4px; }
  .lingguang-context strong, .lingguang-message strong { font-size: 12px; font-weight: 500; color: var(--muted); }
  .lingguang-context p, .lingguang-message p { margin: 0; font-size: 13px; color: var(--ink); overflow-wrap: anywhere; white-space: pre-wrap; }
  [data-lingguang-messages] { display: flex; flex-direction: column; gap: 8px; }
  .lingguang-note { margin: 0 20px 16px; font-size: 12px; color: var(--muted); }
  .lingguang-note.is-error { color: var(--red); }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .lingguang-dispatch-candidates { margin: 0; padding-left: 1.2em; color: var(--muted); font-size: 13px; }
  body.immersive-workbench .plugin-stage-workspace > .lingguang-chat { flex: 1; min-height: 0; }
`;
