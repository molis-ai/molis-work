/** Inbox keeps title and actions at the top; only the context body scrolls. */
export const DETAIL_READING_STYLES = `
  .inbox-next-config { margin: 0 0 10px; font-size: 13px; }
  .inbox-next-config > summary {
    display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 8px; border-radius: var(--radius-item, 8px);
    list-style: none; cursor: pointer; color: var(--muted); font-size: 12px;
  }
  .inbox-next-config > summary::-webkit-details-marker, .inbox-next-config > summary::marker { display: none; }
  .inbox-next-config > summary:hover { color: var(--ink); background: var(--nav-hover); }
  .inbox-next-config:not([open]) > summary .goal-collection-caret svg { transform: rotate(-90deg); }
  .inbox-next-config > :not(summary) { margin-left: 30px; }
  .inbox-next-config p { margin-top: 6px; margin-bottom: 6px; overflow-wrap: anywhere; color: var(--ink-soft); }
  .inbox-next-config button { margin: 4px 4px 0 0; white-space: normal; }
  .inbox-next-suggestion { margin: 4px 0 12px; font-size: 13px; line-height: 1.6; }
  .inbox-next-suggestion small { color: var(--muted); }
  .inbox-compose-dialog { width: min(640px, calc(100vw - 32px)); max-height: 85vh; overflow: auto; padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); color: var(--ink); }
  .inbox-compose-dialog::backdrop { background: var(--scrim, rgba(18, 18, 24, .32)); }
  .inbox-compose-dialog form { display: grid; gap: 16px; }
  .inbox-compose-dialog header, .inbox-compose-dialog footer, .inbox-compose-result { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .inbox-compose-dialog h2, .inbox-compose-dialog p { margin: 0; }
  .inbox-compose-dialog h2 { font-size: 15px; font-weight: 400; }
  .inbox-compose-dialog form > label { display: grid; gap: 8px; }
  .inbox-compose-dialog :is(.mw-input, .mw-textarea) { width: 100%; }
  .inbox-compose-dialog fieldset { max-height: 230px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  .inbox-compose-dialog fieldset label { display: flex; gap: 10px; padding: 8px 0; line-height: 1.5; }
  .inbox-compose-dialog fieldset input { flex: none; align-self: start; margin-top: 2px; }
  .inbox-compose-dialog [role=status] { color: var(--muted); font-size: 13px; }
  .inbox-compose-result { padding: 12px 0; border-top: 1px solid var(--line); font-size: 13px; flex-wrap: wrap; }
  .inbox-compose-result button { flex: none; }
  body.immersive-workbench .tab-pane-body > :is([data-inbox-workbench], .immersive-artifact-surface, .project-operation-surface) { overflow: hidden; padding: 0; }
  body.immersive-workbench .inbox-reference-detail { height: 100%; min-height: 0; max-width: 920px; padding: 0; display: flex; flex-direction: column; border-radius: 0; box-shadow: none; }
  body.immersive-workbench .inbox-reference-detail > .feed-detail-header { flex: none; padding: 8px 20px 8px; }
  body.immersive-workbench [data-inbox-workbench] .inbox-reference-detail > .feed-detail-header { width: 100%; max-width: none; }
  body.immersive-workbench [data-inbox-workbench] .inbox-reference-detail > .feed-detail-header h1 { width: 100%; max-width: none; }
  body.immersive-workbench .inbox-reference-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px; }
  body.immersive-workbench .inbox-reference-detail h1 { margin: 0; font-size: 20px; line-height: 1.4; letter-spacing: -.02em; overflow-wrap: anywhere; }
  body.immersive-workbench .inbox-reference-footer { flex: none; padding: 4px 20px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--paper); }
  body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
  body.immersive-workbench .inbox-reference-footer .feed-action-status { margin: 8px 0 0; }
  body.immersive-workbench .inbox-reference-detail .inbox-attention-context { margin-top: 0; }

  body.immersive-workbench .immersive-artifact-surface > [data-artifact-detail],
  body.immersive-workbench .plugin-stage-workspace > [data-artifact-detail] { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail { display: flex; flex-direction: column; height: 100%; min-height: 0; max-width: 960px; margin: 0 auto; }
  body.immersive-workbench .plugin-stage-workspace .artifact-detail { max-width: none; margin: 0; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { flex: none; gap: 12px; margin: 0; padding: 12px 20px; border-bottom: 1px solid var(--line); max-height: 35%; overflow: auto; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) h1 { font-size: 20px; line-height: 1.35; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail header > span { flex: none; color: var(--muted); }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px 20px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-actions { flex: none; margin: 0; padding: 12px 24px; gap: 12px; border-top: 1px solid var(--line); }
  body.immersive-workbench .artifact-raw { margin-top: 16px; }
  body.immersive-workbench .artifact-facts { margin-block: 16px; }

  body.immersive-workbench .tab-pane-body > .project-operation-surface .session-stage { display: flex; flex-direction: column; width: 100%; max-width: none; height: 100%; min-height: 0; margin: 0; overflow: hidden; }
  body.immersive-workbench .session-stage-bar { flex: none; }
  body.immersive-workbench .session-stage-body { flex: 1; min-height: 0; }
  body.immersive-workbench .session-content-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  @media (max-width: 760px) {
    body.immersive-workbench .inbox-reference-detail > .feed-detail-header { padding: 8px 16px 8px; }
    body.immersive-workbench .inbox-reference-body { padding: 16px; }
    body.immersive-workbench .inbox-reference-detail h1 { font-size: 20px; }
    body.immersive-workbench .inbox-reference-footer { margin-inline: 16px; padding: 4px 0 10px; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions > :is(button,a) { min-height: 44px; padding-inline: 8px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { padding: 12px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) h1 { font-size: 20px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { padding: 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions { padding: 10px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions span { flex: 1; min-width: 120px; font-size: 11px; }
    body.immersive-workbench .artifact-export { display: inline-flex; align-items: center; min-height: 44px; }
    body.immersive-workbench .session-stage-actions .mw-btn:not(.mw-btn--icon-only) { min-height: 44px; }
    body.immersive-workbench .session-execution-toolbar :is(input, .mw-toggle) { min-height: 44px; }
    body.immersive-workbench .session-content-body { padding: 12px 16px; }
  }
`;
