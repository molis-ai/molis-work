/** Inbox keeps title and actions at the top; only the context body scrolls. */
export const DETAIL_READING_STYLES = `
  body.immersive-workbench .tab-pane-body > :is([data-inbox-workbench], .immersive-artifact-surface, .project-operation-surface) { overflow: hidden; padding: 0; }
  body.immersive-workbench .inbox-reference-detail { height: 100%; min-height: 0; max-width: 920px; padding: 0; display: flex; flex-direction: column; border-radius: 0; box-shadow: none; }
  body.immersive-workbench .inbox-reference-detail > .feed-detail-header { flex: none; padding: 8px 20px 8px; }
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
    body.immersive-workbench .inbox-reference-footer { padding: 4px 16px 10px; }
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
