/** Inbox-owned workbench styles served on demand at `/assets/molis-work-plugins/inbox.css` (PG-070, PEQ-08). */
export const INBOX_STYLES = `
  body.immersive-workbench .tab-pane-body > [data-inbox-workbench] { overflow: hidden; padding: 0; }
  body.immersive-workbench .tab-pane-body [data-inbox-workbench] .mw-detail-empty { display: grid; place-items: center; align-content: center; width: 100%; min-height: 100%; margin: 0; padding: 48px 24px; border-radius: 0; background: transparent; box-shadow: none; color: var(--muted); text-align: center; }
  body.immersive-workbench .tab-pane-body [data-inbox-workbench] .mw-detail-empty svg { width: 20px; height: 20px; color: var(--faint); stroke-width: 1.6; }
  body.immersive-workbench .tab-pane-body [data-inbox-workbench] .mw-detail-empty h1 { margin: 8px 0 0; color: var(--ink-soft); font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: 0; }
  body[data-desktop-shell="true"] [data-inbox-workbench] .inbox-attention-context .inbox-attention-next { order: -1; padding: 0 0 16px; }
  body[data-desktop-shell="true"] [data-inbox-workbench] .inbox-attention-context .inbox-attention-next dt { color: var(--blue-dark); font-weight: var(--weight-control, 500); }
  body[data-desktop-shell="true"] [data-inbox-workbench] .inbox-attention-context .inbox-attention-next dd { color: var(--ink); font-size: 13px; font-weight: 400; line-height: 1.5; }
  .inbox-next-config { margin: 0 0 12px; font-size: 13px; }
  .inbox-next-config > summary {
    display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 8px; border-radius: var(--radius-item, 8px);
    list-style: none; cursor: pointer; color: var(--muted); font-size: 12px;
  }
  .inbox-next-config > summary::-webkit-details-marker, .inbox-next-config > summary::marker { display: none; }
  .inbox-next-config > summary:hover { color: var(--ink); background: var(--nav-hover); }
  .inbox-next-config:not([open]) > summary .mw-collection-caret svg { transform: rotate(-90deg); }
  .inbox-next-config > :not(summary) { margin-left: 32px; }
  .inbox-next-config p { margin-top: 8px; margin-bottom: 8px; overflow-wrap: anywhere; color: var(--ink-soft); }
  .inbox-next-config button { margin: 4px 4px 0 0; white-space: normal; }
  .inbox-next-suggestion { margin: 4px 0 12px; font-size: 13px; line-height: 1.6; }
  .inbox-next-suggestion small { color: var(--muted); }
  .inbox-compose-trigger { align-self: flex-start; }
  .inbox-compose-dialog { width: min(640px, calc(100vw - 32px)); max-height: 85vh; overflow: auto; padding: 24px; border: 0; border-radius: 16px; background: var(--paper); color: var(--ink); box-shadow: var(--lift-3); }
  .inbox-compose-dialog::backdrop { background: var(--scrim); }
  .inbox-compose-dialog form { display: grid; gap: 16px; }
  .inbox-compose-dialog header, .inbox-compose-dialog footer, .inbox-compose-result { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .inbox-compose-dialog h2, .inbox-compose-dialog p { margin: 0; }
  .inbox-compose-dialog h2 { font-size: 15px; font-weight: var(--weight-title, 600); }
  .inbox-compose-dialog form > label { display: grid; gap: 8px; }
  .inbox-compose-dialog :is(.mw-input, .mw-textarea) { width: 100%; }
  .inbox-compose-dialog fieldset { max-height: 230px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  .inbox-compose-dialog fieldset label { display: flex; gap: 12px; padding: 8px 0; line-height: 1.5; }
  .inbox-compose-dialog fieldset input { flex: none; align-self: start; margin-top: 4px; }
  .inbox-compose-dialog [role=status] { color: var(--muted); font-size: 13px; }
  .inbox-compose-result { padding: 12px 0; border-top: 1px solid var(--line); font-size: 13px; flex-wrap: wrap; }
  .inbox-compose-result button { flex: none; }
  body.immersive-workbench [data-inbox-workbench] .inbox-reference-detail > .mw-detail-header { width: 100%; max-width: none; }
  body.immersive-workbench [data-inbox-workbench] .inbox-reference-detail > .mw-detail-header h1 { width: 100%; max-width: none; }
  .inbox-object-title .mw-presentation__tag { font-size: var(--type-title-size, 1rem); display: flex; align-items: flex-start; block-size: auto; max-width: none; white-space: normal; }
  .inbox-object-title .mw-presentation__tag strong { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
`;
