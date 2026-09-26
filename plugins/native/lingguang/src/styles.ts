export const LINGGUANG_STYLES = `
  [data-work-surface="lingguang"] { --plugin-tint: var(--plugin-lingguang); }
  .lingguang-stage-chrome { pointer-events: auto; }
  .lingguang-selection-bar {
    display: flex; flex-wrap: nowrap; align-items: center; gap: 4px;
  }
  .lingguang-selection-bar span {
    margin: 0 4px 0 2px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums;
  }
  .lingguang-selection-bar .mw-btn { flex: none; width: auto; }
  .plugin-stage-list .mw-empty { max-width: min(100%, 30em); padding: 8px 8px 16px; }
  [data-lingguang="directory"] [data-lingguang-rows] { max-width: 40rem; }
  body.immersive-workbench .plugin-stage-shell:not([data-expanded="true"]) [data-lingguang="directory"] .feed-stage-entry {
    width: 100%;
    grid-template-columns: minmax(0, 1.2fr) 4.75rem minmax(0, 1fr) max-content;
  }
  .lingguang-editor {
    display: flex; flex-direction: column; gap: 12px;
    flex: 1; min-height: 0; max-width: 52rem; padding: 8px 20px 20px; overflow: auto;
  }
  .lingguang-editor .mw-input {
    font-size: 16px; letter-spacing: -.02em; line-height: 1.35;
  }
  .lingguang-editor .mw-textarea {
    flex: 1; min-height: 12rem; resize: vertical; font-size: 14px; line-height: 1.65;
  }
  .lingguang-chat {
    display: flex; flex-direction: column; gap: 16px;
    flex: 1; min-height: 0; width: min(40rem, 100%);
    padding: 4px 20px 20px; overflow: hidden;
  }
  .lingguang-context {
    display: flex; flex-direction: column; gap: 12px; flex: none;
    padding: 0 0 4px;
  }
  .lingguang-context article {
    display: flex; flex-direction: column; gap: 4px;
    padding: 0 0 12px; border-bottom: 1px solid var(--line);
  }
  .lingguang-context article:last-child { border-bottom: 0; padding-bottom: 0; }
  .lingguang-context strong, .lingguang-message strong {
    font-size: 11px; font-weight: 400; color: var(--faint);
  }
  .lingguang-context p, .lingguang-message p {
    margin: 0; font-size: 14px; line-height: 1.65; color: var(--ink);
    overflow-wrap: anywhere; white-space: pre-wrap;
  }
  .lingguang-context strong { font-size: 13px; color: var(--ink); }
  [data-lingguang-messages] {
    flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 14px; padding: 4px 0 8px;
  }
  .lingguang-message { display: flex; flex-direction: column; gap: 4px; }
  .lingguang-chat-form {
    display: flex; flex-direction: column; gap: 8px; flex: none;
  }
  .lingguang-chat-form .mw-btn { flex: none; width: auto; align-self: flex-end; }
  .lingguang-note {
    position: absolute; left: 50%; bottom: 28px; z-index: 6;
    margin: 0; padding: 8px 14px; border-radius: 8px;
    background: var(--action); color: var(--action-ink);
    font-size: 12px; transform: translateX(-50%);
    max-width: min(420px, calc(100% - 32px)); text-align: center;
  }
  .lingguang-note.is-error { background: var(--red); color: var(--paper); }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .lingguang-dispatch-candidates {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin: 0; padding: 0; list-style: none;
  }
  .lingguang-dispatch-candidates li {
    padding: 2px 6px; border-radius: 5px;
    background: color-mix(in srgb, var(--ink) 11%, transparent);
    color: var(--ink-soft); font-size: 11px;
  }
  body.immersive-workbench .plugin-stage-workspace > .lingguang-editor,
  body.immersive-workbench .plugin-stage-workspace > .lingguang-chat { flex: 1; min-height: 0; }
  @media (max-width: 760px) {
    .lingguang-editor .mw-input, .lingguang-editor .mw-textarea,
    .lingguang-chat-form .mw-textarea { font-size: 16px; }
    .lingguang-selection-bar .mw-btn, .lingguang-chat-form .mw-btn,
    .plugin-stage-detail-bar .mw-btn { min-height: 44px; }
  }
`;
