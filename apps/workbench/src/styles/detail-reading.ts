/** Long details retain their actions while their own content scrolls. */
export const DETAIL_READING_STYLES = `
  body.immersive-workbench .tab-pane-body > :is([data-inbox-workbench], .immersive-artifact-surface, .project-operation-surface) { overflow: hidden; padding: 0; }
  body.immersive-workbench .inbox-reference-detail { height: 100%; min-height: 0; max-width: 920px; padding: 0; display: flex; flex-direction: column; border-radius: 0; box-shadow: none; }
  body.immersive-workbench .inbox-reference-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px; }
  body.immersive-workbench .inbox-reference-detail h1 { margin: 0; font-size: 20px; line-height: 1.4; letter-spacing: -.02em; overflow-wrap: anywhere; }
  body.immersive-workbench .inbox-reference-footer { flex: none; padding: 12px 24px; border-top: 1px solid var(--line); background: var(--paper); }
  body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
  body.immersive-workbench .inbox-reference-footer .feed-action-status { margin: 8px 0 0; }
  body.immersive-workbench .inbox-reference-detail .inbox-attention-context { margin-top: 16px; }

  body.immersive-workbench .immersive-artifact-surface > [data-artifact-detail] { height: 100%; min-height: 0; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail { display: flex; flex-direction: column; height: 100%; min-height: 0; max-width: 960px; margin: 0 auto; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header { flex: none; gap: 12px; margin: 0; padding: 12px 20px; border-bottom: 1px solid var(--line); max-height: 35%; overflow: auto; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail h1 { font-size: 20px; line-height: 1.35; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail header > span { flex: none; color: var(--muted); }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px 20px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-actions { flex: none; margin: 0; padding: 12px 24px; gap: 12px; border-top: 1px solid var(--line); }
  body.immersive-workbench .artifact-raw { margin-top: 16px; }
  body.immersive-workbench .artifact-facts { margin-block: 16px; }

  body.immersive-workbench .tab-pane-body > .project-operation-surface > .project-session-document { display: flex; flex-direction: column; width: 100%; max-width: 1104px; height: 100%; min-height: 0; margin: 0 auto; padding: 0; gap: 0; overflow: hidden; }
  body.immersive-workbench .project-session-document .project-operation-hero { flex: none; min-height: 0; max-height: 42%; overflow: auto; padding: 10px 20px; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .project-session-document .goal-header { padding: 0; }
  body.immersive-workbench .project-session-document .goal-title-row { gap: 12px; }
  body.immersive-workbench .project-session-document .goal-title-row h1 { font-size: 18px; line-height: 1.4; }
  body.immersive-workbench .project-session-document .goal-title-kicker { margin-bottom: 6px; }
  body.immersive-workbench .project-session-document .project-operation-layout { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: stretch; padding: 0; gap: 0; overflow: hidden; }
  body.immersive-workbench .project-session-document .goal-focus-main { flex: 1; min-height: 0; display: flex; flex-direction: column; order: 0; }
  body.immersive-workbench .project-session-document .session-execution { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
  body.immersive-workbench .project-session-document .session-execution > header { flex: none; align-self: stretch; display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 10px 20px; gap: 8px; border-bottom: 1px solid var(--line); }
  body.immersive-workbench .project-session-document .session-execution > header p { display: none; }
  body.immersive-workbench .project-session-document .session-content-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px; }
  body.immersive-workbench .project-session-document .session-content-state { min-height: 0; padding: 20px 0; }
  body.immersive-workbench .session-context-disclosure { flex: none; max-height: 40%; overflow: auto; overscroll-behavior: contain; border-top: 1px solid var(--line); }
  body.immersive-workbench .session-context-disclosure > summary { position: sticky; top: 0; z-index: 1; min-height: 36px; padding: 8px 20px; color: var(--muted); background: var(--paper); cursor: pointer; }
  body.immersive-workbench .project-session-document .session-context-disclosure .goal-focus-aside { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; padding: 8px 20px 16px; }
  body.immersive-workbench .session-context-disclosure .operation-archive { width: auto; align-self: start; }
  @media (max-width: 760px) {
    body.immersive-workbench .inbox-reference-body { padding: 16px; }
    body.immersive-workbench .inbox-reference-detail h1 { font-size: 20px; }
    body.immersive-workbench .inbox-reference-footer { padding: 10px 16px; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions > :is(button,a) { min-height: 44px; padding-inline: 8px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail > header { padding: 12px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail h1 { font-size: 20px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { padding: 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions { padding: 10px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions span { flex: 1; min-width: 120px; font-size: 11px; }
    body.immersive-workbench .artifact-export { display: inline-flex; align-items: center; min-height: 44px; }
    body.immersive-workbench .project-session-document .project-operation-hero { padding: 10px 16px; }
    body.immersive-workbench .project-session-document .goal-title-row { display: flex; flex-direction: column; gap: 8px; }
    body.immersive-workbench .project-session-document .goal-title-actions { display: flex; width: 100%; gap: 8px; }
    body.immersive-workbench .project-session-document .goal-title-actions > button { width: auto; min-height: 44px; flex: 1; }
    body.immersive-workbench .project-session-document .session-execution > header { padding: 8px 16px; }
    body.immersive-workbench .project-session-document .operation-content-controls { width: 100%; min-width: 0; }
    body.immersive-workbench .project-session-document .operation-content-search { flex: 1; min-width: 0; }
    body.immersive-workbench .project-session-document .operation-content-controls :is(input,select) { min-height: 44px; }
    body.immersive-workbench .project-session-document .session-content-body { padding: 12px 16px; }
    body.immersive-workbench .session-context-disclosure > summary { min-height: 44px; padding: 11px 16px; }
    body.immersive-workbench .project-session-document .session-context-disclosure .goal-focus-aside { grid-template-columns: minmax(0,1fr); padding-inline: 16px; }
  }
`;
