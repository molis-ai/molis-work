/** Linear × coss: continuous pages, edge-attached editors, quiet transient surfaces.
 * Page navigation stays in the workspace; dialog semantics keep draft focus protected.
 */
const EDITOR_PANEL = 'body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker])';

export const SURFACE_LANGUAGE_STYLES = `
  .goal-node-toolbar .goal-node-back { flex: none; margin-left: -6px; }
  .goal-node-back svg { transform: rotate(180deg); }
  .goal-node-toolbar { gap: 10px; }
  body.immersive-workbench .goal-details-aside { background: var(--paper); box-shadow: none; }
  body.immersive-workbench .goal-canvas-shell .tui-empty { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { border-color: var(--action); }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 880px); }

  /* All temporary editors meet the workspace edge, rather than floating over it. */
  ${EDITOR_PANEL} { position: fixed; inset: var(--tab-strip-h, 32px) 0 0 auto; margin: 0; width: min(560px, 100vw); max-width: 100vw; height: calc(100dvh - var(--tab-strip-h, 32px)); max-height: calc(100dvh - var(--tab-strip-h, 32px)); padding: 0; border: 0; border-left: 1px solid var(--line); border-radius: 0; background: var(--paper); color: var(--ink); box-shadow: none; overflow: hidden; transform: none; animation: none; transition: opacity 140ms ease, overlay 140ms allow-discrete, display 140ms allow-discrete; }
  ${EDITOR_PANEL}::backdrop { background: color-mix(in srgb, var(--ink) 10%, transparent); backdrop-filter: none; }
  ${EDITOR_PANEL} > :is(form, .feed-task-dialog-shell) { height: 100%; max-height: 100%; min-height: 0; }
  ${EDITOR_PANEL} > .dialog-shell { border: 0; border-radius: 0; box-shadow: none; }
  ${EDITOR_PANEL} :is(.dialog-body, .feed-task-dialog-body) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; align-content: start; }
  ${EDITOR_PANEL} .dialog-body { gap: 12px; padding: 16px 20px; }
  body.immersive-workbench dialog[data-feed-sources-dialog] :is(input, select, textarea):focus-visible { outline: 2px solid var(--control-ring); outline-offset: 2px; box-shadow: none; }
  ${EDITOR_PANEL} > form > section { flex: 1; min-height: 0; overflow: auto; align-content: start; gap: 12px; padding: 16px 20px; }
  ${EDITOR_PANEL} > form > header { border-bottom: 1px solid var(--line); }
  ${EDITOR_PANEL} header p { color: var(--muted); font-size: 13px; line-height: 1.6; }
  ${EDITOR_PANEL} label:not(.operation-confirm-check) { font-size: 13px; color: var(--ink-soft); align-content: start; gap: 5px; }
  ${EDITOR_PANEL} :is(input:not([type=checkbox]), select, textarea) { font-size: 14px; }
  ${EDITOR_PANEL} :is(.operation-capability-note, .operation-dialog-status, .operation-field-label, .session-workspace-picker small) { font: inherit; font-size: 12px; line-height: 1.6; }
  ${EDITOR_PANEL} .operation-field-label small { font-size: 11px; }
  ${EDITOR_PANEL} .session-workspace-picker strong { font-size: 13px; }
  ${EDITOR_PANEL} .session-add-field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  ${EDITOR_PANEL} .operation-confirm-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.6; }
  ${EDITOR_PANEL} .operation-confirm-check input { flex: none; width: 17px; height: 17px; margin: 2px 0 0; }
  ${EDITOR_PANEL} [data-session-add-toggle] { min-height: 36px; font-size: 12px; }
  ${EDITOR_PANEL} header button[data-dialog-close] { flex: none; width: 40px; height: 40px; border: 0; border-radius: var(--radius-control); background: var(--nav-bg); }
  ${EDITOR_PANEL} header button[data-dialog-close] svg { width: 16px; height: 16px; }
  ${EDITOR_PANEL} .dialog-icon { display: none; }
  ${EDITOR_PANEL} :is(h2, .feed-task-dialog-shell h2) { font-size: 18px; font-weight: 400; line-height: 1.4; letter-spacing: -.015em; }
  ${EDITOR_PANEL} :is(header, footer) { box-shadow: none; }
  ${EDITOR_PANEL} > form > header, ${EDITOR_PANEL} .feed-task-dialog-shell > header { padding: 16px 20px 12px; }
  ${EDITOR_PANEL} > form > footer, ${EDITOR_PANEL} .feed-task-dialog-shell > footer { padding: 10px 20px; }
  ${EDITOR_PANEL} .frame-picker-list { flex: 1; }
  ${EDITOR_PANEL} .form-disclosure { margin-top: 4px; padding-top: 0; }
  ${EDITOR_PANEL} .form-disclosure > summary { min-height: 44px; display: flex; align-items: center; padding-block: 8px; }
  ${EDITOR_PANEL} .form-disclosure > summary::before { content: ""; width: 6px; height: 6px; margin-right: 8px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); flex: none; }
  ${EDITOR_PANEL} .form-disclosure[open] > summary::before { transform: rotate(45deg); }
  ${EDITOR_PANEL} .feed-task-dialog-body { padding: 12px 20px 20px; }
  ${EDITOR_PANEL} .feed-task-dialog-body label { margin-block: 12px; }
  @starting-style { ${EDITOR_PANEL}[open] { opacity: .5; transform: none; } }
  @media (max-width: 760px) {
    ${EDITOR_PANEL} { width: 100vw; border-left: 0; }
    ${EDITOR_PANEL} .session-add-field-grid { grid-template-columns: minmax(0, 1fr); }
    ${EDITOR_PANEL} > form > header, ${EDITOR_PANEL} .feed-task-dialog-shell > header { padding: 16px; }
    ${EDITOR_PANEL} > form > section, ${EDITOR_PANEL} .dialog-body { padding: 16px; }
    ${EDITOR_PANEL} :is(input:not([type=checkbox]), select, textarea) { font-size: 16px; }
    ${EDITOR_PANEL} :is([data-session-add-toggle], header button[data-dialog-close]) { min-height: 44px; }
    ${EDITOR_PANEL} > form > footer, ${EDITOR_PANEL} .feed-task-dialog-shell > footer { padding: 10px 16px; }
    .goal-node-toolbar button, .goal-details-toggle { width: 44px; min-height: 44px; }
  }
  /* Search and irreversible confirmations remain compact, with restrained depth. */
  body :is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog) { border-radius: 8px; box-shadow: 0 8px 28px #00000018; }
  body :is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog)::backdrop { background: #00000026; backdrop-filter: none; }
  @media (prefers-reduced-motion: reduce) { ${EDITOR_PANEL}, ${EDITOR_PANEL}::backdrop { animation: none; transition: none; } }
`;
