/** Shared detail-reading surface styles (used by Inbox, Schedule and Feed detail panels). */
export const DETAIL_READING_STYLES = `
  body[data-desktop-shell="true"] .feed-detail { width: min(100%, 920px); margin: 0 auto; padding: 32px; border-radius: 14px; background: var(--paper); box-shadow: var(--lift-1); }
  body[data-desktop-shell="true"] .feed-detail-header { max-width: 76ch; }
  body[data-desktop-shell="true"] .feed-detail-header h1 { max-width: 26ch; margin: 0; color: var(--ink); font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1.16; letter-spacing: -.028em; }
  body[data-desktop-shell="true"] .feed-detail-header > p { margin: 12px 0 0; color: var(--muted); font-size: 13px; line-height: 1.68; }
  body[data-desktop-shell="true"] .feed-detail-kicker { margin-bottom: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  body[data-desktop-shell="true"] .feed-detail-kicker span { padding: 4px 8px; border-radius: 6px; color: var(--faint); background: color-mix(in srgb, var(--ink) 5%, transparent); font-size: 11px; font-weight: 400; }
  body[data-desktop-shell="true"] .feed-detail-kicker span:first-child { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 9%, transparent); }
  body[data-desktop-shell="true"] .feed-detail-actions { margin-top: 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  body[data-desktop-shell="true"] .feed-detail-actions button:not(.mw-btn),
  body[data-desktop-shell="true"] .feed-linked-goal { min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 62%, var(--paper)); display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 11px; font-weight: 400; text-decoration: none; cursor: pointer; }
  body[data-desktop-shell="true"] .feed-detail-actions button:not(.mw-btn):hover:not(:disabled),
  body[data-desktop-shell="true"] .feed-linked-goal:hover { transform: translateY(-1px); box-shadow: var(--lift-1); }
  body[data-desktop-shell="true"] .feed-detail-actions button:focus-visible,
  body[data-desktop-shell="true"] .feed-linked-goal:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  body[data-desktop-shell="true"] .feed-detail-actions button:disabled { opacity: .52; cursor: default; }
  body[data-desktop-shell="true"] .feed-detail-actions .feed-action-subtle { color: var(--faint); background: transparent; }
  body[data-desktop-shell="true"] .feed-detail-actions svg { width: 12px; height: 12px; }
  body[data-desktop-shell="true"] .feed-action-status { margin: 8px 0 0; color: var(--danger); font-size: 11px; }
  body[data-desktop-shell="true"] .feed-detail-empty { width: min(100%, 920px); min-height: 440px; margin: 0 auto; padding: 48px; border-radius: 14px; color: var(--faint); background: var(--paper); box-shadow: var(--lift-1); display: grid; place-items: center; align-content: center; gap: 8px; text-align: center; }
  body[data-desktop-shell="true"] .feed-detail-empty[hidden] { display: none; }
  body[data-desktop-shell="true"] .feed-detail-empty svg { width: 20px; height: 20px; stroke-width: 1.6; }
  body[data-desktop-shell="true"] .feed-detail-empty h1 { margin: 0; color: var(--ink-soft); font-size: 17px; }
  body[data-desktop-shell="true"] .feed-detail-empty p { max-width: 46ch; margin: 0; font-size: 11px; line-height: 1.55; }
  body[data-desktop-shell="true"] .feed-detail--attention .feed-detail-kicker span:first-child { color: var(--amber); background: color-mix(in srgb, var(--amber) 9%, transparent); }
  body[data-desktop-shell="true"] .feed-detail--attention .feed-detail-actions { padding-bottom: 24px; border-bottom: 1px solid color-mix(in srgb, var(--line) 68%, transparent); }
  body[data-desktop-shell="true"] .inbox-attention-context { max-width: 76ch; margin-top: 24px; }
  body[data-desktop-shell="true"] .inbox-attention-context dl { margin: 0; display: flex; flex-direction: column; }
  body[data-desktop-shell="true"] .inbox-attention-context dl > div { padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 16px; }
  body[data-desktop-shell="true"] .inbox-attention-context dt { color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); line-height: 1.55; }
  body[data-desktop-shell="true"] .inbox-attention-context dd { margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.55; }
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface { overflow: hidden; padding: 0; }
  body.immersive-workbench .inbox-reference-detail { height: 100%; min-height: 0; max-width: 920px; padding: 0; display: flex; flex-direction: column; border-radius: 0; box-shadow: none; }
  body.immersive-workbench .inbox-reference-detail > .feed-detail-header { flex: none; padding: 8px 24px 8px; }
  body.immersive-workbench .inbox-reference-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 24px; }
  body.immersive-workbench .inbox-reference-detail h1 { margin: 0; font-size: 20px; line-height: 1.4; letter-spacing: -.02em; overflow-wrap: anywhere; }
  body.immersive-workbench .inbox-reference-footer { flex: none; padding: 4px 24px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--paper); }
  body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
  body.immersive-workbench .inbox-reference-footer .feed-action-status { margin: 8px 0 0; }
  body.immersive-workbench .inbox-reference-detail .inbox-attention-context { margin-top: 0; }
  .inbox-reference-body dd { font-family: var(--type-reading-font); font-size: var(--type-reading-size); line-height: var(--type-reading-line-height); }

  body.immersive-workbench .immersive-artifact-surface > [data-artifact-detail],
  body.immersive-workbench .plugin-stage-workspace > [data-artifact-detail] { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail { display: flex; flex-direction: column; height: 100%; min-height: 0; max-width: 960px; margin: 0 auto; }
  body.immersive-workbench .plugin-stage-workspace .artifact-detail { max-width: none; margin: 0; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { flex: none; gap: 12px; margin: 0; padding: 12px 24px; border-bottom: 1px solid var(--line); max-height: 35%; overflow: auto; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) h1 { font-size: 20px; line-height: 1.35; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail header > span { flex: none; color: var(--muted); }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 24px 24px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-actions { flex: none; margin: 0; padding: 12px 24px; gap: 12px; border-top: 1px solid var(--line); }
  body.immersive-workbench .artifact-raw { margin-top: 16px; }
  body.immersive-workbench .artifact-facts { margin-block: 16px; }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .feed-detail,
    body[data-desktop-shell="true"] .feed-detail-empty { width: 100%; margin: 0; border-radius: 12px; }
    body[data-desktop-shell="true"] .feed-detail { padding: 24px 16px 32px; }
    body[data-desktop-shell="true"] .feed-detail-empty { min-height: 58vh; padding: 32px 16px; }
    body[data-desktop-shell="true"] .feed-detail-header h1 { font-size: 20px; }
    body[data-desktop-shell="true"] .feed-detail-actions button,
    body[data-desktop-shell="true"] .feed-linked-goal { min-height: 44px; }
    body[data-desktop-shell="true"] .inbox-attention-context dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    body.immersive-workbench .inbox-reference-detail > .feed-detail-header { padding: 8px 16px 8px; }
    body.immersive-workbench .inbox-reference-body { padding: 16px; }
    body.immersive-workbench .inbox-reference-detail h1 { font-size: 20px; }
    body.immersive-workbench .inbox-reference-footer { margin-inline: 16px; padding: 4px 0 12px; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; }
    body.immersive-workbench .inbox-reference-footer .feed-detail-actions > :is(button,a) { min-height: 44px; padding-inline: 8px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { padding: 12px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) h1 { font-size: 20px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-detail-content { padding: 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions { padding: 12px 16px; }
    body.immersive-workbench .immersive-artifact-surface .artifact-actions span { flex: 1; min-width: 120px; font-size: 11px; }
    body.immersive-workbench .artifact-export { display: inline-flex; align-items: center; min-height: 44px; }
  }

  .frame-reading { display: grid; gap: 12px; }
  .frame-reading h2 { margin: 0; font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.015em; line-height: 1.35; overflow-wrap: anywhere; }
  .frame-reading-meta { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .frame-reading .feed-rich-content { font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
  .frame-reading .feed-rich-content p { margin: 0 0 .7em; }
  .frame-reading .feed-rich-content p:last-child { margin-bottom: 0; }
  .frame-reading-link { margin: 0; font-size: 12px; }
  .frame-reading-link a { color: var(--blue-dark); text-underline-offset: 3px; }
  .frame-reading dl { display: grid; gap: 12px; margin: 0; }
  .frame-reading dl > div { display: grid; gap: 4px; }
  .frame-reading dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .frame-reading dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
  .frame-reading .artifact-facts { display: grid; gap: 8px; margin: 0; font-size: 13px; line-height: 1.6; }
  .frame-reading .artifact-facts p { margin: 0; }
`;
